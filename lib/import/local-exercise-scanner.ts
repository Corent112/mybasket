import type {
  AiDiagramAction,
  AiDiagramObject,
  AiDiagramPlayer,
  AiPoint,
  AiExerciseImport,
  AiExerciseDiagram,
} from "./types";

type OCRLine = { text: string; x0: number; y0: number; x1: number; y1: number; confidence: number };
type OCRWord = OCRLine;
type OCRResult = { text: string; lines: OCRLine[]; words: OCRWord[]; confidence: number };
type TesseractLike = {
  createWorker: (lang?: string) => Promise<{
    recognize: (
      image: HTMLCanvasElement | HTMLImageElement,
      options?: Record<string, unknown>,
      output?: Record<string, boolean>
    ) => Promise<{ data: any }>;
    setParameters?: (params: Record<string, string>) => Promise<void>;
    terminate: () => Promise<void>;
  }>;
};

declare global {
  interface Window {
    Tesseract?: TesseractLike;
  }
}

const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js";
const ALLOWED_THEMES = [
  "Fondamentaux individuel",
  "Fondamentaux pré collectif",
  "Collectif",
  "Défense",
  "Surnombre",
  "Jeu rapide",
  "Repli",
  "Rebond",
  "Physique",
  "Adresse",
];

const FIELD_HEADINGS: Array<{ field: "title" | "organisation" | "deroulement" | "consignes" | "variantes"; aliases: string[] }> = [
  { field: "organisation", aliases: ["organisation", "mise en place", "installation", "dispositif"] },
  { field: "deroulement", aliases: ["déroulement", "deroulement", "déroulé", "deroule", "description", "default text for your practice plans", "consigne de jeu"] },
  { field: "consignes", aliases: ["consignes", "consigne", "points clés", "points cles", "critères", "criteres"] },
  { field: "variantes", aliases: ["variantes", "variante", "évolution", "evolution", "évolutions", "evolutions"] },
  { field: "title", aliases: ["titre", "title", "nom de l'exercice", "nom exercice", "exercice", "drill"] },
];

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[•●▪■►→:;|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function ensureTesseract(): Promise<TesseractLike> {
  if (window.Tesseract) return window.Tesseract;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-mb-tesseract="1"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Chargement OCR impossible")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = TESSERACT_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.mbTesseract = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Le moteur OCR gratuit n'a pas pu être chargé."));
    document.head.appendChild(script);
  });
  if (!window.Tesseract) throw new Error("Moteur OCR indisponible.");
  return window.Tesseract;
}

function imageToCanvas(source: CanvasImageSource, width: number, height: number) {
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image invalide"));
      el.src = url;
    });
    return imageToCanvas(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function videoFrames(file: File): Promise<HTMLCanvasElement[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Vidéo invalide"));
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const samples = duration < 3 ? [0.25, 0.75] : [0.08, 0.3, 0.55, 0.8, 0.96];
    const frames: HTMLCanvasElement[] = [];
    let lastSignature = "";

    for (const ratio of samples) {
      video.currentTime = Math.min(Math.max(0, duration * ratio), Math.max(0, duration - 0.05));
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        video.addEventListener("seeked", done, { once: true });
        window.setTimeout(done, 1200);
      });
      const frame = imageToCanvas(video, video.videoWidth || 1280, video.videoHeight || 720);
      const signature = canvasSignature(frame);
      if (!lastSignature || signatureDistance(lastSignature, signature) > 7) {
        frames.push(frame);
        lastSignature = signature;
      }
      if (frames.length >= 3) break;
    }
    return frames.length ? frames : [imageToCanvas(video, video.videoWidth || 1280, video.videoHeight || 720)];
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasSignature(canvas: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, 8, 8);
  const data = ctx.getImageData(0, 0, 8, 8).data;
  let mean = 0;
  const vals: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
    vals.push(v);
    mean += v;
  }
  mean /= vals.length;
  return vals.map((v) => (v < mean ? "0" : "1")).join("");
}

function signatureDistance(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
  return diff;
}

async function runOCR(canvas: HTMLCanvasElement): Promise<OCRResult> {
  const tesseract = await ensureTesseract();
  let worker: Awaited<ReturnType<TesseractLike["createWorker"]>> | null = null;
  try {
    try {
      worker = await tesseract.createWorker("fra");
    } catch {
      worker = await tesseract.createWorker("eng");
    }

    // Tesseract.js v6 ne renvoie plus les blocs/boîtes par défaut.
    // On les réactive explicitement : le texte brut sert au formulaire,
    // les coordonnées servent à retrouver le schéma et les numéros joueurs.
    const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const rawText = String(result.data?.text || "").trim();
    const blocks = Array.isArray(result.data?.blocks) ? result.data.blocks : [];
    const rawLines = blocks.flatMap((b: any) =>
      (b?.paragraphs || []).flatMap((p: any) => p?.lines || [])
    );
    const rawWords = rawLines.flatMap((line: any) => line?.words || []);

    const makeBox = (item: any): OCRLine => ({
      text: String(item?.text || "").trim(),
      x0: Number(item?.bbox?.x0 || 0),
      y0: Number(item?.bbox?.y0 || 0),
      x1: Number(item?.bbox?.x1 || 0),
      y1: Number(item?.bbox?.y1 || 0),
      confidence: Math.max(0, Math.min(1, Number(item?.confidence || 0) / 100)),
    });

    const lines: OCRLine[] = rawLines.map(makeBox).filter((line: OCRLine) => line.text.length > 0);
    const words: OCRWord[] = rawWords.map(makeBox).filter((word: OCRWord) => word.text.length > 0);
    const confidenceSource: Array<OCRLine | OCRWord> = lines.length ? lines : words;
    const confidence = confidenceSource.length
      ? confidenceSource.reduce((sum: number, item: OCRLine | OCRWord) => sum + item.confidence, 0) / confidenceSource.length
      : rawText ? 0.5 : 0;

    return { text: rawText, lines, words, confidence };
  } finally {
    await worker?.terminate().catch(() => undefined);
  }
}

function cleanCapturedSection(value: string) {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^there are no data$/i.test(line) && !/^update$/i.test(line))
    .join("\n")
    .trim();
}

function rawSection(rawText: string, starts: string[], stops: string[]) {
  const src = rawText.replace(/\r/g, "\n");
  const lower = norm(src).replace(/\n/g, " ");
  // La recherche principale se fait sur le texte original, afin de préserver exactement ce qui a été lu.
  for (const start of starts) {
    const startRx = new RegExp(`(?:^|\\n)\\s*[-~—|>]*\\s*${start}\\s*(?:[:\\-–—]|\\n|\\s)+`, "i");
    const match = startRx.exec(src);
    if (!match) continue;
    const from = match.index + match[0].length;
    let to = src.length;
    const tail = src.slice(from);
    for (const stop of stops) {
      const stopRx = new RegExp(`(?:^|\\n)\\s*[-~—|>]*\\s*${stop}\\b`, "i");
      const stopMatch = stopRx.exec(tail);
      if (stopMatch && from + stopMatch.index < to) to = from + stopMatch.index;
    }
    const captured = cleanCapturedSection(src.slice(from, to));
    if (captured) return captured;
  }
  void lower;
  return "";
}

function parseText(lines: OCRLine[], rawText = "") {
  const sorted = [...lines].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const sections: Record<"title" | "organisation" | "deroulement" | "consignes" | "variantes", string[]> = {
    title: [], organisation: [], deroulement: [], consignes: [], variantes: [],
  };
  const unassigned: string[] = [];
  let active: keyof typeof sections | null = null;

  const stopHeading = /^(goals|purpose|skills|equipment|players|coaches|age group|type|publishing|author|variations|tips|hints|emphasis|default text)/i;
  const identifyHeading = (text: string) => {
    const n = norm(text);
    for (const item of FIELD_HEADINGS) {
      for (const alias of item.aliases) {
        const a = norm(alias);
        if (n === a || n.startsWith(`${a} `)) return { field: item.field, alias };
      }
    }
    return null;
  };

  for (const line of sorted) {
    const text = line.text.trim();
    if (!text) continue;
    const heading = identifyHeading(text);
    if (heading) {
      active = heading.field;
      const split = text.split(/[:\-–—]/, 2);
      if (split.length > 1 && split[1].trim()) sections[active].push(split[1].trim());
      else {
        const rest = text.slice(heading.alias.length).replace(/^\s*[:\-–—]?\s*/, "").trim();
        if (rest && norm(rest) !== norm(heading.alias)) sections[active].push(rest);
      }
      continue;
    }
    if (stopHeading.test(norm(text))) {
      active = null;
      continue;
    }
    if (active) sections[active].push(text);
    else unassigned.push(text);
  }

  // Titre : priorité à "Title:" puis au bandeau DRILL "...".
  let title = "";
  const titleMatch = rawText.match(/\b(?:title|titre)\s*[:\-]\s*([^\n]+)/i);
  if (titleMatch?.[1]) title = titleMatch[1].trim();
  if (!title) {
    const drillMatch = rawText.match(/\bdrill\s*["“”']?\s*([^\n"“”']{3,120})/i);
    if (drillMatch?.[1]) title = drillMatch[1].trim();
  }
  if (!title) title = sections.title.join(" ").trim();
  if (!title) {
    const candidate = unassigned.find((line) => line.length >= 3 && line.length <= 100 && !/publishing|created|updated|author|home page|profile/i.test(line));
    if (candidate) title = candidate;
  }
  title = title.replace(/^[:\-\s]+|["“”']+$/g, "").trim();

  // Déroulement : "Description" est une règle forte. Le texte brut est prioritaire
  // pour ne pas dépendre du découpage en lignes de Tesseract.
  const rawDescription = rawSection(
    rawText,
    ["description", "déroulement", "deroulement"],
    ["goals\s*\/\s*purpose\s*\/\s*skills", "goals", "variations", "tips\s*\/\s*hints", "equipment", "players\s*\/\s*coaches", "age group", "type"]
  );
  let deroulement = rawDescription || sections.deroulement.join("\n").trim();
  // Certains sites mettent un sous-titre parasite immédiatement après Description.
  deroulement = deroulement
    .split("\n")
    .filter((line) => !/^default text for your practice plans$/i.test(line.trim()))
    .join("\n")
    .trim();

  let organisation = sections.organisation.join("\n").trim();
  if (!organisation) {
    organisation = rawSection(
      rawText,
      ["organisation", "mise en place", "installation"],
      ["description", "déroulement", "deroulement", "consignes", "variations", "variantes", "equipment"]
    );
  }

  let consignes = sections.consignes.join("\n").trim();
  if (!consignes) {
    consignes = rawSection(rawText, ["tips\\s*\\/\\s*hints\\s*\\/\\s*emphasis", "consignes", "tips"], ["equipment", "players", "age group", "type", "variations"]);
  }
  if (/^there are no data$/i.test(consignes)) consignes = "";

  let variantes = sections.variantes.join("\n").trim();
  if (!variantes) variantes = rawSection(rawText, ["variations", "variantes", "évolution", "evolution"], ["tips", "equipment", "players", "age group", "type"]);
  if (/^there are no data$/i.test(variantes)) variantes = "";

  return {
    title,
    organisation,
    deroulement: deroulement ? deroulement.split("\n").map((x) => x.trim()).filter(Boolean) : [],
    consignes: consignes ? consignes.split("\n").map((x) => x.trim()).filter(Boolean) : [],
    variantes: variantes ? variantes.split("\n").map((x) => x.trim()).filter(Boolean) : [],
  };
}

function saturation(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function detectColorGraphicRegions(canvas: HTMLCanvasElement) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, W, H).data;
  const step = Math.max(3, Math.round(Math.min(W, H) / 300));
  const gw = Math.ceil(W / step), gh = Math.ceil(H / step);
  const mask = new Uint8Array(gw * gh), seen = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const x = Math.min(W - 1, gx * step), y = Math.min(H - 1, gy * step), i = (y * W + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (saturation(r,g,b) > 0.18 && Math.max(r,g,b) > 70 && Math.min(r,g,b) < 245) mask[gy * gw + gx] = 1;
  }
  const comps: any[] = [];
  for (let sy=0; sy<gh; sy++) for (let sx=0; sx<gw; sx++) {
    const idx=sy*gw+sx; if (!mask[idx] || seen[idx]) continue;
    const q=[[sx,sy]] as Array<[number,number]>; seen[idx]=1;
    let minX=sx,maxX=sx,minY=sy,maxY=sy,count=0;
    while(q.length){const [x,y]=q.pop()!;count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){if(nx>=0&&ny>=0&&nx<gw&&ny<gh){const ni=ny*gw+nx;if(mask[ni]&&!seen[ni]){seen[ni]=1;q.push([nx,ny]);}}}
    }
    const w=(maxX-minX+1)*step,h=(maxY-minY+1)*step,area=w*h;
    if (area > W*H*0.012 && w > W*0.10 && h > H*0.18) comps.push({x0:minX*step,y0:minY*step,x1:Math.min(W,(maxX+1)*step),y1:Math.min(H,(maxY+1)*step),score:area});
  }
  return comps.sort((a,b)=>b.score-a.score).slice(0,4);
}

function mergeGraphicRegions(regions: Array<{x0:number;y0:number;x1:number;y1:number;score?:number}>, W: number, H: number) {
  const result: Array<{x0:number;y0:number;x1:number;y1:number}> = [];
  for (const r of regions) {
    const padded = {
      x0: Math.max(0, r.x0 - W * 0.012),
      y0: Math.max(0, r.y0 - H * 0.018),
      x1: Math.min(W, r.x1 + W * 0.012),
      y1: Math.min(H, r.y1 + H * 0.018),
    };
    let merged = false;
    for (const current of result) {
      const overlapX = Math.max(0, Math.min(current.x1, padded.x1) - Math.max(current.x0, padded.x0));
      const minWidth = Math.min(current.x1-current.x0, padded.x1-padded.x0);
      const gapY = Math.max(0, Math.max(current.y0, padded.y0) - Math.min(current.y1, padded.y1));
      if (overlapX > minWidth * 0.45 && gapY < H * 0.06) {
        current.x0 = Math.min(current.x0, padded.x0); current.y0 = Math.min(current.y0, padded.y0);
        current.x1 = Math.max(current.x1, padded.x1); current.y1 = Math.max(current.y1, padded.y1);
        merged = true; break;
      }
    }
    if (!merged) result.push(padded);
  }
  return result;
}

function colorDiversity(canvas: HTMLCanvasElement, r: {x0:number;y0:number;x1:number;y1:number}) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const x0=Math.max(0,Math.floor(r.x0)),y0=Math.max(0,Math.floor(r.y0));
  const w=Math.max(1,Math.floor(r.x1-r.x0)),h=Math.max(1,Math.floor(r.y1-r.y0));
  const data=ctx.getImageData(x0,y0,w,h).data;
  const bins=new Set<number>();
  const stride=Math.max(1,Math.floor(Math.sqrt(w*h/5000)));
  for(let y=0;y<h;y+=stride)for(let x=0;x<w;x+=stride){const i=(y*w+x)*4;const R=data[i],G=data[i+1],B=data[i+2];if(saturation(R,G,B)<.12)continue;const max=Math.max(R,G,B),min=Math.min(R,G,B);if(max-min<18)continue;let hue=0;if(max===R)hue=(G-B)/(max-min||1);else if(max===G)hue=2+(B-R)/(max-min||1);else hue=4+(R-G)/(max-min||1);hue=((hue*60+360)%360);bins.add(Math.floor(hue/35));}
  return bins.size;
}

function detectDiagramRegions(canvas: HTMLCanvasElement, ocrLines: OCRLine[]) {
  const W = canvas.width, H = canvas.height;
  const raw = detectColorGraphicRegions(canvas);
  const merged = mergeGraphicRegions(raw, W, H)
    .filter((r) => {
      const rw=r.x1-r.x0,rh=r.y1-r.y0;
      return rw>W*.10 && rw<W*.55 && rh>H*.22 && rh<H*.92 && colorDiversity(canvas,r)>=2;
    })
    .sort((a,b) => {
      const score=(r:{x0:number;y0:number;x1:number;y1:number}) => {
        const rw=r.x1-r.x0,rh=r.y1-r.y0, area=rw*rh;
        const aspect=rh/Math.max(1,rw);
        const aspectScore=aspect>.9&&aspect<2.4?2:0;
        const centerBonus=r.x0>W*.12?1:0;
        return area/(W*H)+aspectScore+centerBonus+colorDiversity(canvas,r)*.25;
      };
      return score(b)-score(a);
    });
  if (merged.length) return merged.slice(0, 4);

  // Fallback documents papier : si le texte occupe surtout le haut, le bas est probablement un dessin.
  const maxTextY = ocrLines.reduce((m, l) => Math.max(m, l.y1), 0);
  if (maxTextY > 0 && maxTextY < H * 0.76) return [{ x0: 0, x1: W, y0: Math.max(0, maxTextY + 10), y1: H }];
  return [];
}

function rgbAt(data: Uint8ClampedArray, w:number, x:number, y:number) {
  const xx=Math.max(0,Math.min(w-1,Math.round(x))), yy=Math.max(0,Math.round(y));
  const i=(yy*w+xx)*4; return [data[i]||0,data[i+1]||0,data[i+2]||0] as const;
}

function playerVisual(data: Uint8ClampedArray, w:number, h:number, cx:number, cy:number) {
  const radius=Math.max(7,Math.min(w,h)*.035);
  let red=0,blue=0,orange=0;
  for(let y=Math.max(0,Math.floor(cy-radius));y<Math.min(h,Math.ceil(cy+radius));y++)for(let x=Math.max(0,Math.floor(cx-radius));x<Math.min(w,Math.ceil(cx+radius));x++){
    if(Math.hypot(x-cx,y-cy)>radius)continue;
    const [r,g,b]=rgbAt(data,w,x,y); const sat=saturation(r,g,b); if(sat<.22)continue;
    if(r>b*1.25 && r>g*.95) red++;
    if(b>r*1.12 && b>g*.85) blue++;
    if(r>150 && g>65 && g<175 && b<100) orange++;
  }
  return { color: blue>red*1.12 ? "#2366A8" : red>blue*1.12 ? "#8B1E3F" : undefined, hasBall: orange>2 };
}

function connectedInkComponents(data: Uint8ClampedArray, w:number, h:number, excluded:Array<{x:number;y:number;r:number}>) {
  const scale=Math.max(1,Math.round(Math.min(w,h)/500));
  const gw=Math.ceil(w/scale), gh=Math.ceil(h/scale), seen=new Uint8Array(gw*gh);
  const isExcluded=(x:number,y:number)=>excluded.some(e=>Math.hypot(x-e.x,y-e.y)<e.r);
  const ink=(x:number,y:number)=>{
    if(isExcluded(x,y))return false;
    const [r,g,b]=rgbAt(data,w,x,y), gray=(r+g+b)/3, sat=saturation(r,g,b);
    // On vise les traits de consigne foncés/colorés et on rejette les aplats du terrain.
    const darkNeutral=gray<82 && sat<.35;
    const darkColored=gray<155 && sat>.30;
    return darkNeutral||darkColored;
  };
  const comps:Array<Array<{x:number;y:number}>>=[];
  for(let sy=0;sy<gh;sy++)for(let sx=0;sx<gw;sx++){
    const idx=sy*gw+sx,x0=sx*scale,y0=sy*scale;if(seen[idx]||!ink(x0,y0))continue;
    const q:Array<[number,number]>=[[sx,sy]];seen[idx]=1;const pts:Array<{x:number;y:number}>=[];
    while(q.length&&pts.length<12000){const [gx,gy]=q.pop()!;const x=gx*scale,y=gy*scale;pts.push({x,y});for(const[nx,ny]of[[gx+1,gy],[gx-1,gy],[gx,gy+1],[gx,gy-1]])if(nx>=0&&ny>=0&&nx<gw&&ny<gh){const ni=ny*gw+nx;if(!seen[ni]&&ink(nx*scale,ny*scale)){seen[ni]=1;q.push([nx,ny]);}}}
    if(pts.length>=2)comps.push(pts);
  }
  return comps;
}

function componentPolyline(points:Array<{x:number;y:number}>, w:number, h:number): AiPoint[] {
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
  const bw=maxX-minX,bh=maxY-minY;
  if(bw<3&&bh<3)return [];
  // Pour les petits éléments (ex. tirets), une ligne selon l'axe principal reproduit mieux le visuel qu'un nuage de points.
  if(points.length<70){
    const horizontal=bw>=bh;
    return horizontal
      ? [{x:minX/w,y:((minY+maxY)/2)/h},{x:maxX/w,y:((minY+maxY)/2)/h}]
      : [{x:((minX+maxX)/2)/w,y:minY/h},{x:((minX+maxX)/2)/w,y:maxY/h}];
  }
  const ordered=[...points].sort((a,b)=>a.y-b.y||a.x-b.x);
  const stride=Math.max(1,Math.ceil(ordered.length/80));
  return ordered.filter((_,i)=>i%stride===0).map(p=>({x:p.x/w,y:p.y/h}));
}

type MarkerCandidate = { x0:number; y0:number; x1:number; y1:number; cx:number; cy:number; points:number };

function markerCandidatesFromImage(data: Uint8ClampedArray, w:number, h:number): MarkerCandidate[] {
  const comps=connectedInkComponents(data,w,h,[]);
  const minSide=Math.min(w,h);
  const raw:MarkerCandidate[]=[];
  for(const comp of comps){
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const p of comp){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
    const bw=maxX-minX+1,bh=maxY-minY+1,ratio=bw/Math.max(1,bh);
    if(bw<minSide*.022||bh<minSide*.018||bw>minSide*.13||bh>minSide*.13)continue;
    if(ratio<.42||ratio>2.5||comp.length<12)continue;
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    // Icônes de téléchargement/menu courantes en haut à droite du graphique.
    if(cx>w*.82&&cy<h*.14)continue;
    raw.push({x0:minX,y0:minY,x1:maxX,y1:maxY,cx,cy,points:comp.length});
  }
  raw.sort((a,b)=>b.points-a.points);
  const kept:MarkerCandidate[]=[];
  for(const c of raw){
    if(kept.some(k=>Math.hypot(k.cx-c.cx,k.cy-c.cy)<minSide*.035))continue;
    kept.push(c);
    if(kept.length>=24)break;
  }
  return kept;
}

async function recognizeMarkerLabels(source: HTMLCanvasElement, candidates: MarkerCandidate[]) {
  if(!candidates.length)return [] as Array<{candidate:MarkerCandidate;label:string}>;
  const tesseract=await ensureTesseract();
  let worker: Awaited<ReturnType<TesseractLike["createWorker"]>> | null=null;
  const found:Array<{candidate:MarkerCandidate;label:string}>=[];
  try{
    try{worker=await tesseract.createWorker("eng");}catch{return found;}
    await worker.setParameters?.({tessedit_char_whitelist:"0123456789",tessedit_pageseg_mode:"10"});
    const srcCtx=source.getContext("2d",{willReadFrequently:true})!;
    for(const candidate of candidates.slice(0,18)){
      const pad=Math.max(5,Math.round(Math.max(candidate.x1-candidate.x0,candidate.y1-candidate.y0)*.42));
      const x0=Math.max(0,Math.floor(candidate.x0-pad)),y0=Math.max(0,Math.floor(candidate.y0-pad));
      const x1=Math.min(source.width,Math.ceil(candidate.x1+pad)),y1=Math.min(source.height,Math.ceil(candidate.y1+pad));
      const patch=document.createElement("canvas");const scale=7;
      patch.width=Math.max(70,(x1-x0)*scale);patch.height=Math.max(70,(y1-y0)*scale);
      const pctx=patch.getContext("2d",{willReadFrequently:true})!;
      pctx.fillStyle="#fff";pctx.fillRect(0,0,patch.width,patch.height);
      pctx.drawImage(source,x0,y0,x1-x0,y1-y0,0,0,patch.width,patch.height);
      const res=await worker.recognize(patch,{}, {text:true});
      const label=String(res.data?.text||"").replace(/\D/g,"").slice(0,2);
      if(label)found.push({candidate,label});
    }
  }finally{await worker?.terminate().catch(()=>undefined);}
  return found;
}

async function detectDiagram(canvas: HTMLCanvasElement, region: { x0: number; x1: number; y0: number; y1: number }, index: number): Promise<AiExerciseDiagram> {
  const w = Math.max(1, Math.round(region.x1-region.x0));
  const h = Math.max(1, Math.round(region.y1-region.y0));
  const sourceCtx=canvas.getContext("2d",{willReadFrequently:true})!;
  const sourceImage=sourceCtx.getImageData(Math.round(region.x0),Math.round(region.y0),w,h);
  const sourceCrop=document.createElement("canvas");sourceCrop.width=w;sourceCrop.height=h;
  sourceCrop.getContext("2d")!.drawImage(canvas,region.x0,region.y0,w,h,0,0,w,h);

  const crop=document.createElement("canvas");
  const upscale=Math.min(5, Math.max(2.5, 1600/Math.max(w,h)));
  crop.width=Math.max(1,Math.round(w*upscale)); crop.height=Math.max(1,Math.round(h*upscale));
  crop.getContext("2d")!.drawImage(canvas,region.x0,region.y0,w,h,0,0,crop.width,crop.height);

  let cropOCR: OCRResult={text:"",lines:[],words:[],confidence:0};
  try { cropOCR=await runOCR(crop); } catch {}

  const players: AiDiagramPlayer[]=[];
  const objects: AiDiagramObject[]=[];
  const actions: AiDiagramAction[]=[];
  const used:Array<{x:number;y:number}>=[];

  // Les petits numéros lus DANS la zone graphique deviennent de vrais joueurs Plaquette.
  const digitWords=cropOCR.words.filter(word=>/^\d{1,2}$/.test(word.text.trim()));
  for(const word of digitWords){
    const cx=((word.x0+word.x1)/2)/upscale, cy=((word.y0+word.y1)/2)/upscale;
    if(cx<2||cy<2||cx>w-2||cy>h-2)continue;
    if(used.some(p=>Math.hypot(p.x-cx,p.y-cy)<Math.min(w,h)*.025))continue;
    const visual=playerVisual(sourceImage.data,w,h,cx,cy);
    players.push({
      key:`s${index+1}p${players.length+1}`,
      label:word.text.trim(),
      team:"att",
      x:Math.max(.015,Math.min(.985,cx/w)),
      y:Math.max(.015,Math.min(.985,cy/h)),
      hasBall:visual.hasBall,
      color:visual.color,
    } as AiDiagramPlayer);
    used.push({x:cx,y:cy});
  }

  // Si l'OCR global rate les très petits numéros (cas fréquent sur les captures FIBA),
  // on repère les marqueurs graphiques puis on relit chaque marqueur isolément.
  if(players.length < 2){
    const candidates=markerCandidatesFromImage(sourceImage.data,w,h);
    let labels:Array<{candidate:MarkerCandidate;label:string}>=[];
    try{labels=await recognizeMarkerLabels(sourceCrop,candidates);}catch{}
    for(const item of labels){
      const {candidate,label}=item;
      if(used.some(p=>Math.hypot(p.x-candidate.cx,p.y-candidate.cy)<Math.min(w,h)*.035))continue;
      const visual=playerVisual(sourceImage.data,w,h,candidate.cx,candidate.cy);
      players.push({key:`s${index+1}p${players.length+1}`,label,team:"att",x:Math.max(.015,Math.min(.985,candidate.cx/w)),y:Math.max(.015,Math.min(.985,candidate.cy/h)),hasBall:visual.hasBall,color:visual.color} as AiDiagramPlayer);
      used.push({x:candidate.cx,y:candidate.cy});
    }
  }

  const excluded=used.map(p=>({x:p.x,y:p.y,r:Math.max(12,Math.min(w,h)*.045)}));
  const comps=connectedInkComponents(sourceImage.data,w,h,excluded);
  for(const comp of comps){
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    comp.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);});
    const bw=maxX-minX,bh=maxY-minY,area=bw*bh;
    // Rejette les grosses bordures/icônes du terrain source; garde les trajectoires et petits symboles.
    if(bw>w*.55||bh>h*.30||area>w*h*.08)continue;
    if((minX<4||maxX>w-5)&&(bh>h*.12||bw>w*.12))continue;
    const poly=componentPolyline(comp,w,h);
    if(poly.length<2)continue;
    actions.push({action:"freedraw",from:poly[0],to:poly[poly.length-1],points:poly,order:actions.length+1});
    if(actions.length>=80)break;
  }

  const full = h / Math.max(1,w) > 1.12;
  return {
    detected: players.length>0 || actions.length>0,
    courtType: full ? "full" : "half",
    players, objects, actions,
    notes: "Import photo/vidéo — objets reconstruits dans Plaquette. Vérifie puis modifie si nécessaire avant création.",
  };
}

function inferMeta(text: string) {
  const n = norm(text);
  const firstNum = (pattern: RegExp) => {
    const m = n.match(pattern);
    return m ? Number(m[1]) : null;
  };
  const categorie = (n.match(/\b(u9|u11|u13|u15|u18|u21|senior)\b/i)?.[1] || "— Choisir —").toUpperCase();
  const themes = ALLOWED_THEMES.filter((theme) => n.includes(norm(theme))).slice(0, 5);
  return {
    plots: firstNum(/(\d{1,2})\s*(?:plots?|cones?)/),
    ballons: firstNum(/(\d{1,2})\s*(?:ballons?|balles?|balls?)/),
    paniers: firstNum(/(\d{1,2})\s*(?:paniers?|baskets?)/),
    joueurs: firstNum(/(\d{1,2})\s*(?:joueurs?|players?)/),
    temps: firstNum(/(\d{1,3})\s*(?:min|minutes?)/),
    categorie: ["U9", "U11", "U13", "U15", "U18", "U21", "SENIOR"].includes(categorie) ? (categorie === "SENIOR" ? "Senior" : categorie) : "— Choisir —",
    themes,
  };
}

export async function scanExerciseLocally(file: File, onStatus?: (message: string) => void): Promise<AiExerciseImport> {
  onStatus?.(file.type.startsWith("video/") ? "Extraction des vues utiles de la vidéo…" : "Préparation de la photo…");
  const canvases = file.type.startsWith("video/") ? await videoFrames(file) : [await fileToCanvas(file)];
  const parsedFrames: Array<{ parsed: ReturnType<typeof parseText>; text: string; lines: OCRLine[]; words: OCRWord[]; confidence: number; canvas: HTMLCanvasElement }> = [];

  for (let i = 0; i < canvases.length; i++) {
    onStatus?.(`Lecture gratuite du texte${canvases.length > 1 ? ` — vue ${i + 1}/${canvases.length}` : ""}…`);
    const ocr = await runOCR(canvases[i]);
    parsedFrames.push({ parsed: parseText(ocr.lines, ocr.text), text: ocr.text, lines: ocr.lines, words: ocr.words, confidence: ocr.confidence, canvas: canvases[i] });
  }

  const best = [...parsedFrames].sort((a, b) => (b.text.length + b.lines.length * 30) - (a.text.length + a.lines.length * 30) || b.confidence - a.confidence)[0];
  const allText = parsedFrames.map((f) => f.text || f.lines.map((l) => l.text).join("\n")).join("\n");
  const meta = inferMeta(allText);

  onStatus?.("Reconstruction des schémas dans Plaquette…");
  const diagrams: AiExerciseDiagram[] = [];
  for (const frame of parsedFrames) {
    const regions = detectDiagramRegions(frame.canvas, frame.lines);
    for (const region of regions) {
      const diagram = await detectDiagram(frame.canvas, region, diagrams.length);
      if (diagram.detected) diagrams.push(diagram);
      if (diagrams.length >= 8) break;
    }
    if (diagrams.length >= 8) break;
  }

  const warnings: string[] = [];
  if (!best.text.trim() && !best.lines.length) warnings.push("Aucun texte lisible n'a été détecté : complète les champs manuellement.");
  if (!diagrams.length) warnings.push("Aucun schéma exploitable n'a été reconnu : tu peux l'ajouter avec Plaquette.");
  else warnings.push("Les schémas ont été reconstruits localement : vérifie positions, joueurs et trajectoires avant de créer l'exercice.");

  const diagram = diagrams[0] || { detected: false, courtType: "half" as const, players: [], objects: [], actions: [], notes: "" };
  const organisationFallback = [
    meta.ballons !== null ? `${meta.ballons} ballon${meta.ballons > 1 ? "s" : ""}` : "",
    meta.paniers !== null ? `${meta.paniers} panier${meta.paniers > 1 ? "s" : ""}` : "",
    meta.plots !== null && meta.plots > 0 ? `${meta.plots} plot${meta.plots > 1 ? "s" : ""}` : "",
    meta.joueurs !== null ? `${meta.joueurs} joueur${meta.joueurs > 1 ? "s" : ""}` : "",
  ].filter(Boolean).join("\n");
  return {
    title: best.parsed.title || "",
    organisation: best.parsed.organisation || organisationFallback,
    deroulement: best.parsed.deroulement || [],
    consignes: best.parsed.consignes || [],
    variantes: best.parsed.variantes || [],
    plots: meta.plots,
    ballons: meta.ballons,
    paniers: meta.paniers,
    joueurs: meta.joueurs,
    categorie: meta.categorie as AiExerciseImport["categorie"],
    type: "Collectif",
    niveau: "Intermédiaire",
    temps: meta.temps,
    themes: meta.themes,
    diagram,
    diagrams,
    confidence: { text: best.confidence, diagram: diagrams.length ? 0.55 : 0 },
    warnings,
    source: "local",
  };
}
