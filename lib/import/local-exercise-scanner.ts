import type {
  AiDiagramAction,
  AiDiagramObject,
  AiDiagramPlayer,
  AiPoint,
  AiExerciseImport,
  AiExerciseDiagram,
} from "./types";

type OCRLine = { text: string; x0: number; y0: number; x1: number; y1: number; confidence: number };
type TesseractLike = {
  createWorker: (lang?: string) => Promise<{
    recognize: (image: HTMLCanvasElement | HTMLImageElement) => Promise<{ data: any }>;
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

async function runOCR(canvas: HTMLCanvasElement): Promise<{ lines: OCRLine[]; confidence: number }> {
  const tesseract = await ensureTesseract();
  let worker: Awaited<ReturnType<TesseractLike["createWorker"]>> | null = null;
  try {
    try {
      worker = await tesseract.createWorker("fra");
    } catch {
      worker = await tesseract.createWorker("eng");
    }
    const result = await worker.recognize(canvas);
    const rawLines = Array.isArray(result.data?.lines)
      ? result.data.lines
      : Array.isArray(result.data?.blocks)
      ? result.data.blocks.flatMap((b: any) => b?.paragraphs?.flatMap((p: any) => p?.lines || []) || [])
      : [];
    const lines: OCRLine[] = rawLines
      .map((line: any) => ({
        text: String(line?.text || "").trim(),
        x0: Number(line?.bbox?.x0 || 0),
        y0: Number(line?.bbox?.y0 || 0),
        x1: Number(line?.bbox?.x1 || 0),
        y1: Number(line?.bbox?.y1 || 0),
        confidence: Math.max(0, Math.min(1, Number(line?.confidence || 0) / 100)),
      }))
      .filter((line: OCRLine) => line.text.length > 1);
    const confidence = lines.length ? lines.reduce((s, l) => s + l.confidence, 0) / lines.length : 0;
    return { lines, confidence };
  } finally {
    await worker?.terminate().catch(() => undefined);
  }
}

function parseText(lines: OCRLine[]) {
  const sorted = [...lines].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const sections: Record<"title" | "organisation" | "deroulement" | "consignes" | "variantes", string[]> = {
    title: [], organisation: [], deroulement: [], consignes: [], variantes: [],
  };
  const unassigned: string[] = [];
  let active: keyof typeof sections | null = null;

  const hardStops = [
    "goals", "purpose", "skills", "equipment", "players", "coaches", "age group", "type",
    "publishing", "author", "variations", "tips", "hints", "emphasis", "default text",
  ];
  const identifyHeading = (text: string) => {
    const n = norm(text);
    for (const item of FIELD_HEADINGS) for (const alias of item.aliases) {
      const a = norm(alias);
      if (n === a || n.startsWith(`${a} `) || n.startsWith(`${a}:`) || n.startsWith(`${a}-`)) return { field: item.field, alias: a };
    }
    return null;
  };
  const valueAfterHeading = (text: string, alias: string) => {
    const raw = text.trim();
    const idxColon = raw.search(/[:\-–—]/);
    if (idxColon >= 0) return raw.slice(idxColon + 1).trim();
    const words = alias.split(" ").length;
    return raw.split(/\s+/).slice(words).join(" ").trim();
  };

  for (const line of sorted) {
    const n = norm(line.text);
    const heading = identifyHeading(line.text);
    if (heading) {
      active = heading.field;
      const rest = valueAfterHeading(line.text, heading.alias);
      if (rest && norm(rest) !== heading.alias) sections[active].push(rest);
      continue;
    }
    if (hardStops.some((h) => n === h || n.startsWith(`${h} `) || n.startsWith(`${h} /`))) {
      active = null;
      continue;
    }
    if (active) sections[active].push(line.text.trim());
    else unassigned.push(line.text.trim());
  }

  // FIBA Europe / sites structurés : "Title: ..." est prioritaire. À défaut, cherche le nom du drill.
  if (!sections.title.length) {
    const explicit = sorted.find((l) => /^\s*(title|titre)\s*[:\-]/i.test(l.text));
    if (explicit) sections.title.push(explicit.text.replace(/^\s*(title|titre)\s*[:\-]\s*/i, "").trim());
  }
  if (!sections.title.length) {
    const drill = sorted.find((l) => /\bdrill\b/i.test(l.text) && l.text.length < 140);
    if (drill) sections.title.push(drill.text.replace(/^.*?drill\s*["“”']?/i, "").replace(/["“”']\s*$/, "").trim());
  }
  if (!sections.title.length) {
    const candidate = unassigned.find((line) => line.length >= 3 && line.length <= 100 && !/publishing|created|updated|author/i.test(line));
    if (candidate) sections.title.push(candidate);
  }

  // Ne jamais laisser Description vide si elle a été reconnue : elle alimente Déroulement telle quelle.
  return {
    title: sections.title.join(" ").replace(/^[:\-\s]+/, "").trim(),
    organisation: sections.organisation.join("\n").trim(),
    deroulement: sections.deroulement.filter((x) => x && !/^there are no data$/i.test(x)),
    consignes: sections.consignes.filter((x) => x && !/^there are no data$/i.test(x)),
    variantes: sections.variantes.filter((x) => x && !/^there are no data$/i.test(x)),
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

function detectDiagramRegions(canvas: HTMLCanvasElement, ocrLines: OCRLine[]) {
  const colored = detectColorGraphicRegions(canvas).filter((r) => r.x1-r.x0 < canvas.width*0.65);
  if (colored.length) return colored.map(({score, ...r}) => r);
  const W = canvas.width, H = canvas.height;
  const maxTextY = ocrLines.reduce((m, l) => Math.max(m, l.y1), 0);
  if (maxTextY < H * 0.78) return [{ x0: 0, x1: W, y0: Math.max(0, maxTextY + 12), y1: H }];
  return [];
}

async function detectDiagram(canvas: HTMLCanvasElement, region: { x0: number; x1: number; y0: number; y1: number }, index: number): Promise<AiExerciseDiagram> {
  const src = canvas.getContext("2d", { willReadFrequently: true })!;
  const w = Math.max(1, Math.round(region.x1-region.x0)), h=Math.max(1,Math.round(region.y1-region.y0));
  const crop=document.createElement("canvas"); const upscale=Math.min(4, Math.max(2, 1100/Math.max(w,h)));
  crop.width=Math.round(w*upscale); crop.height=Math.round(h*upscale);
  crop.getContext("2d")!.drawImage(canvas,region.x0,region.y0,w,h,0,0,crop.width,crop.height);
  let cropLines: OCRLine[]=[];
  try { cropLines=(await runOCR(crop)).lines; } catch {}

  const ctx=canvas.getContext("2d",{willReadFrequently:true})!;
  const img=ctx.getImageData(region.x0,region.y0,w,h); const data=img.data;
  const gray=(x:number,y:number)=>{const i=(y*w+x)*4;return (data[i]+data[i+1]+data[i+2])/3};
  const sat=(x:number,y:number)=>{const i=(y*w+x)*4;return saturation(data[i],data[i+1],data[i+2])};
  const players: AiDiagramPlayer[]=[]; const objects: AiDiagramObject[]=[]; const actions: AiDiagramAction[]=[];

  // Marqueurs joueurs : petits anneaux sombres/rouges/bleus sur le graphique, jamais les grandes lignes du terrain.
  const step=Math.max(1,Math.round(Math.min(w,h)/650)); const seen=new Uint8Array(w*h); const comps:any[]=[];
  const ink=(x:number,y:number)=>gray(x,y)<105 || (sat(x,y)>0.42 && gray(x,y)<185);
  for(let sy=0;sy<h;sy+=step)for(let sx=0;sx<w;sx+=step){const si=sy*w+sx;if(seen[si]||!ink(sx,sy))continue;const q=[[sx,sy]] as Array<[number,number]>;seen[si]=1;let minX=sx,maxX=sx,minY=sy,maxY=sy,count=0;
    while(q.length&&count<10000){const [x,y]=q.pop()!;count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const[nx,ny]of[[x+step,y],[x-step,y],[x,y+step],[x,y-step]])if(nx>=0&&ny>=0&&nx<w&&ny<h){const ni=ny*w+nx;if(!seen[ni]&&ink(nx,ny)){seen[ni]=1;q.push([nx,ny]);}}}
    const bw=maxX-minX+1,bh=maxY-minY+1,ratio=bw/bh;if(count>3&&bw>4&&bh>4&&bw<Math.min(w,h)*0.12&&bh<Math.min(w,h)*0.12&&ratio>.5&&ratio<1.9)comps.push({minX,maxX,minY,maxY,count});}

  const numberLines=cropLines.filter(l=>/^\s*\d{1,2}\s*$/.test(l.text));
  const markerCandidates=comps.sort((a,b)=>a.minY-b.minY||a.minX-b.minX).slice(0,30);
  markerCandidates.forEach((c:any,i:number)=>{
    const cx=(c.minX+c.maxX)/2,cy=(c.minY+c.maxY)/2;
    let label=""; let best=Infinity;
    for(const l of numberLines){const lx=((l.x0+l.x1)/2)/upscale,ly=((l.y0+l.y1)/2)/upscale;const d=Math.hypot(lx-cx,ly-cy);if(d<best&&d<Math.max(18,Math.min(w,h)*.08)){best=d;label=l.text.trim();}}
    if(!label) return; // n'invente plus de numéro : on ne crée que ce qui est réellement lu.
    players.push({key:`s${index+1}p${players.length+1}`,label,team:"att",x:Math.max(.02,Math.min(.98,cx/w)),y:Math.max(.02,Math.min(.98,cy/h)),hasBall:false});
  });

  // Trajectoires : conserve les petits segments noirs hors marqueurs comme dessin libre, donc visuellement fidèle et éditable dans Plaquette.
  const markerBoxes=markerCandidates.map((c:any)=>({x0:c.minX-8,y0:c.minY-8,x1:c.maxX+8,y1:c.maxY+8}));
  const isMarker=(x:number,y:number)=>markerBoxes.some((b:any)=>x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1);
  const sample=3; const pts: AiPoint[]=[];
  for(let y=0;y<h;y+=sample)for(let x=0;x<w;x+=sample){if(isMarker(x,y))continue; if(gray(x,y)<70 && sat(x,y)<0.28) pts.push({x:x/w,y:y/h});}
  // Ne garde que des petits groupes de points afin d'éviter de recopier les bordures/traits complets du terrain source.
  if(pts.length>3 && pts.length<2500){
    const stride=Math.max(1,Math.ceil(pts.length/350));
    const reduced=pts.filter((_,i)=>i%stride===0);
    if(reduced.length>2) actions.push({action:"freedraw" as any,from:reduced[0],to:reduced[reduced.length-1],points:reduced as any,order:1} as any);
  }

  const full = h / Math.max(1,w) > 1.15;
  return {detected:players.length>0||actions.length>0,courtType:full?"full":"half",players,objects,actions,notes:"Import fidèle local — vérifie/modifie dans Plaquette avant création."};
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
    ballons: firstNum(/(\d{1,2})\s*(?:ballons?|balles?)/),
    paniers: firstNum(/(\d{1,2})\s*paniers?/),
    joueurs: firstNum(/(\d{1,2})\s*joueurs?/),
    temps: firstNum(/(\d{1,3})\s*(?:min|minutes?)/),
    categorie: ["U9", "U11", "U13", "U15", "U18", "U21", "SENIOR"].includes(categorie) ? (categorie === "SENIOR" ? "Senior" : categorie) : "— Choisir —",
    themes,
  };
}

export async function scanExerciseLocally(file: File, onStatus?: (message: string) => void): Promise<AiExerciseImport> {
  onStatus?.(file.type.startsWith("video/") ? "Extraction des vues utiles de la vidéo…" : "Préparation de la photo…");
  const canvases = file.type.startsWith("video/") ? await videoFrames(file) : [await fileToCanvas(file)];
  const parsedFrames: Array<{ parsed: ReturnType<typeof parseText>; lines: OCRLine[]; confidence: number; canvas: HTMLCanvasElement }> = [];

  for (let i = 0; i < canvases.length; i++) {
    onStatus?.(`Lecture gratuite du texte${canvases.length > 1 ? ` — vue ${i + 1}/${canvases.length}` : ""}…`);
    const ocr = await runOCR(canvases[i]);
    parsedFrames.push({ parsed: parseText(ocr.lines), lines: ocr.lines, confidence: ocr.confidence, canvas: canvases[i] });
  }

  const best = [...parsedFrames].sort((a, b) => b.lines.length - a.lines.length || b.confidence - a.confidence)[0];
  const allText = parsedFrames.flatMap((f) => f.lines.map((l) => l.text)).join("\n");
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
  if (!best.lines.length) warnings.push("Aucun texte lisible n'a été détecté : complète les champs manuellement.");
  if (!diagrams.length) warnings.push("Aucun schéma exploitable n'a été reconnu : tu peux l'ajouter avec Plaquette.");
  else warnings.push("Les schémas ont été reconstruits localement : vérifie positions, joueurs et trajectoires avant de créer l'exercice.");

  const diagram = diagrams[0] || { detected: false, courtType: "half" as const, players: [], objects: [], actions: [], notes: "" };
  return {
    title: best.parsed.title || "",
    organisation: best.parsed.organisation || "",
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
