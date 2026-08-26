import type {
  AiDiagramObject,
  AiDiagramPlayer,
  AiExerciseDiagram,
  AiExerciseImport,
  AiDiagramStroke,
} from "./types";

type Box = { x0: number; y0: number; x1: number; y1: number };
type OCRLine = Box & { text: string; confidence: number; height: number };
type OCRWord = Box & { text: string; confidence: number };

type TesseractLike = {
  createWorker: (lang?: string) => Promise<{
    recognize: (image: HTMLCanvasElement | HTMLImageElement) => Promise<{ data: any }>;
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
  "Fondamentaux individuel", "Fondamentaux pré collectif", "Collectif", "Défense",
  "Surnombre", "Jeu rapide", "Repli", "Rebond", "Physique", "Adresse",
];

const FIELD_HEADINGS: Array<{
  field: "title" | "organisation" | "deroulement" | "consignes" | "variantes";
  aliases: string[];
}> = [
  { field: "title", aliases: ["titre", "nom de l'exercice", "nom exercice", "exercice"] },
  { field: "organisation", aliases: ["organisation", "mise en place", "installation", "dispositif"] },
  { field: "deroulement", aliases: ["déroulement", "deroulement", "déroulé", "deroule", "description", "consigne de jeu"] },
  { field: "consignes", aliases: ["consignes techniques", "consignes", "consigne", "points clés", "points cles", "critères", "criteres"] },
  { field: "variantes", aliases: ["évolution / variantes", "evolution / variantes", "évolution", "evolution", "variantes", "variante"] },
];

const norm = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[•●▪■►→:;|]/g, " ").replace(/\s+/g, " ").trim();

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const boxArea = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);

async function ensureTesseract(): Promise<TesseractLike> {
  if (window.Tesseract) return window.Tesseract;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-mb-tesseract="1"]');
    if (existing) {
      if ((existing as any).dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Chargement OCR impossible")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = TESSERACT_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.mbTesseract = "1";
    script.onload = () => { script.dataset.loaded = "1"; resolve(); };
    script.onerror = () => reject(new Error("Le moteur OCR gratuit n'a pas pu être chargé."));
    document.head.appendChild(script);
  });
  if (!window.Tesseract) throw new Error("Moteur OCR indisponible.");
  return window.Tesseract;
}

function imageToCanvas(source: CanvasImageSource, width: number, height: number, maxSide = 2200) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function preprocessForOCR(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hist = new Uint32Array(256);
  for (let i = 0; i < img.data.length; i += 4) {
    const g = Math.round(img.data[i] * .299 + img.data[i + 1] * .587 + img.data[i + 2] * .114);
    hist[g]++;
  }
  const total = canvas.width * canvas.height;
  let acc = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * .01) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * .01) { hi = i; break; } }
  const span = Math.max(30, hi - lo);
  for (let i = 0; i < img.data.length; i += 4) {
    const g0 = img.data[i] * .299 + img.data[i + 1] * .587 + img.data[i + 2] * .114;
    let g = clamp((g0 - lo) / span) * 255;
    // Contraste doux : garde les accents / traits fins, éclaircit le papier.
    g = g < 210 ? Math.max(0, (g - 128) * 1.35 + 128) : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
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
  } finally { URL.revokeObjectURL(url); }
}

async function videoFrames(file: File): Promise<HTMLCanvasElement[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.preload = "metadata"; video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Vidéo invalide"));
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    // Davantage de vues : une fiche filmée peut montrer plusieurs pages/schémas.
    const samples = duration <= 2 ? [.25, .7] : [.06, .18, .34, .5, .66, .82, .95];
    const frames: HTMLCanvasElement[] = [];
    let previous = "";
    for (const ratio of samples) {
      video.currentTime = Math.min(duration - .03, Math.max(0, duration * ratio));
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        video.addEventListener("seeked", done, { once: true });
        window.setTimeout(done, 1000);
      });
      const frame = imageToCanvas(video, video.videoWidth || 1280, video.videoHeight || 720);
      const signature = canvasSignature(frame);
      if (!previous || signatureDistance(previous, signature) > 5) {
        frames.push(frame); previous = signature;
      }
      if (frames.length >= 5) break;
    }
    return frames.length ? frames : [imageToCanvas(video, video.videoWidth || 1280, video.videoHeight || 720)];
  } finally { URL.revokeObjectURL(url); }
}

function canvasSignature(canvas: HTMLCanvasElement) {
  const c = document.createElement("canvas"); c.width = 10; c.height = 10;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, 10, 10);
  const d = ctx.getImageData(0, 0, 10, 10).data;
  let mean = 0; const vals: number[] = [];
  for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; vals.push(v); mean += v; }
  mean /= vals.length;
  return vals.map(v => v < mean ? "0" : "1").join("");
}
function signatureDistance(a: string, b: string) {
  let diff = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
  return diff;
}

function extractLinesAndWords(data: any): { lines: OCRLine[]; words: OCRWord[] } {
  const rawLines = Array.isArray(data?.lines) ? data.lines :
    Array.isArray(data?.blocks) ? data.blocks.flatMap((b: any) => b?.paragraphs?.flatMap((p: any) => p?.lines || []) || []) : [];
  const lines: OCRLine[] = rawLines.map((line: any) => ({
    text: String(line?.text || "").trim(),
    x0: Number(line?.bbox?.x0 || 0), y0: Number(line?.bbox?.y0 || 0),
    x1: Number(line?.bbox?.x1 || 0), y1: Number(line?.bbox?.y1 || 0),
    height: Math.max(1, Number(line?.bbox?.y1 || 0) - Number(line?.bbox?.y0 || 0)),
    confidence: clamp(Number(line?.confidence || 0) / 100),
  })).filter((l: OCRLine) => l.text.length > 1 && l.confidence > .12);

  let rawWords = Array.isArray(data?.words) ? data.words : [];
  if (!rawWords.length && Array.isArray(data?.blocks)) {
    rawWords = data.blocks.flatMap((b: any) => b?.paragraphs?.flatMap((p: any) =>
      p?.lines?.flatMap((l: any) => l?.words || []) || []) || []);
  }
  const words: OCRWord[] = rawWords.map((w: any) => ({
    text: String(w?.text || "").trim(),
    x0: Number(w?.bbox?.x0 || 0), y0: Number(w?.bbox?.y0 || 0),
    x1: Number(w?.bbox?.x1 || 0), y1: Number(w?.bbox?.y1 || 0),
    confidence: clamp(Number(w?.confidence || 0) / 100),
  })).filter((w: OCRWord) => w.text && w.confidence > .2);
  return { lines, words };
}

async function runOCR(canvas: HTMLCanvasElement): Promise<{ lines: OCRLine[]; words: OCRWord[]; confidence: number }> {
  const tesseract = await ensureTesseract();
  let worker: Awaited<ReturnType<TesseractLike["createWorker"]>> | null = null;
  try {
    try { worker = await tesseract.createWorker("fra"); }
    catch { worker = await tesseract.createWorker("eng"); }
    await worker.setParameters?.({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "3",
      user_defined_dpi: "300",
    }).catch(() => undefined);

    // L'OCR reçoit une version corrigée, mais les bbox gardent exactement les mêmes dimensions.
    const cleaned = preprocessForOCR(canvas);
    const result = await worker.recognize(cleaned);
    const parsed = extractLinesAndWords(result.data);
    const confidence = parsed.lines.length
      ? parsed.lines.reduce((s, l) => s + l.confidence, 0) / parsed.lines.length
      : 0;
    return { ...parsed, confidence };
  } finally { await worker?.terminate().catch(() => undefined); }
}

function headingMatch(text: string) {
  const n = norm(text);
  for (const item of FIELD_HEADINGS) {
    for (const alias of item.aliases) {
      const a = norm(alias);
      const idx = n.indexOf(a);
      if (idx === 0 || (idx > 0 && idx < 4)) return { field: item.field, alias, aliasNorm: a };
    }
  }
  return null;
}

function cleanHeadingRemainder(text: string, alias: string) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`^\\s*${escaped}\\s*[:\\-–—]?\\s*`, "i"), "").trim();
}

function parseText(linesInput: OCRLine[], pageW: number, pageH: number) {
  const lines = [...linesInput].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const sections: Record<"title" | "organisation" | "deroulement" | "consignes" | "variantes", string[]> = {
    title: [], organisation: [], deroulement: [], consignes: [], variantes: [],
  };
  let active: keyof typeof sections | null = null;
  const unassigned: OCRLine[] = [];
  let firstHeadingY = pageH;

  for (const line of lines) {
    const match = headingMatch(line.text);
    if (match) {
      active = match.field;
      firstHeadingY = Math.min(firstHeadingY, line.y0);
      const rest = cleanHeadingRemainder(line.text, match.alias);
      if (rest && norm(rest) !== norm(match.alias)) sections[active].push(rest);
      continue;
    }
    if (active) sections[active].push(line.text);
    else unassigned.push(line);
  }

  // Titre : priorité à une ligne située au-dessus des sections, centrée/large,
  // et jamais à un libellé générique.
  if (!sections.title.length) {
    const generic = /^(exercice|basket|basketball|fiche|entrainement|entraînement)$/i;
    const candidates = lines
      .filter(l => l.y0 < Math.min(firstHeadingY, pageH * .38))
      .filter(l => l.text.length >= 3 && l.text.length <= 120 && !generic.test(l.text.trim()))
      .map(l => ({
        line: l,
        score: l.height * 2.2 + l.confidence * 35 +
          ((l.x1 - l.x0) / pageW) * 25 -
          (l.y0 / pageH) * 20,
      }))
      .sort((a, b) => b.score - a.score);
    if (candidates[0]) {
      sections.title.push(candidates[0].line.text.trim());
      const idx = unassigned.indexOf(candidates[0].line);
      if (idx >= 0) unassigned.splice(idx, 1);
    }
  }

  // Si aucun heading n'est reconnu, on ne laisse plus le formulaire vide :
  // titre = meilleur candidat, reste = déroulement brut.
  if (!sections.deroulement.length && unassigned.length) {
    sections.deroulement.push(...unassigned.map(l => l.text));
  }

  return {
    title: sections.title.join(" ").replace(/\s+/g, " ").trim(),
    organisation: sections.organisation.join("\n").trim(),
    deroulement: sections.deroulement.filter(Boolean),
    consignes: sections.consignes.filter(Boolean),
    variantes: sections.variantes.filter(Boolean),
  };
}

function makeDarkMask(canvas: HTMLCanvasElement, threshold = 165) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const d = ctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114;
    mask[p] = g < threshold ? 1 : 0;
  }
  return mask;
}

function eraseBoxes(mask: Uint8Array, W: number, H: number, boxes: Box[], pad = 7) {
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x0 - pad)), y0 = Math.max(0, Math.floor(b.y0 - pad));
    const x1 = Math.min(W - 1, Math.ceil(b.x1 + pad)), y1 = Math.min(H - 1, Math.ceil(b.y1 + pad));
    for (let y = y0; y <= y1; y++) mask.fill(0, y * W + x0, y * W + x1 + 1);
  }
}

function detectDiagramRegions(canvas: HTMLCanvasElement, lines: OCRLine[]) {
  const W = canvas.width, H = canvas.height;
  const raw = makeDarkMask(canvas, 180);
  eraseBoxes(raw, W, H, lines, Math.max(5, Math.round(Math.min(W, H) * .006)));

  // Grille de densité + dilatation : regroupe un terrain et tous ses symboles,
  // mais sépare naturellement deux dessins côte à côte.
  const cell = Math.max(8, Math.round(Math.min(W, H) / 105));
  const gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
  const grid = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let dark = 0, total = 0;
      for (let y = gy * cell; y < Math.min(H, (gy + 1) * cell); y += 2) {
        for (let x = gx * cell; x < Math.min(W, (gx + 1) * cell); x += 2) {
          dark += raw[y * W + x]; total++;
        }
      }
      if (total && dark / total > .018) grid[gy * gw + gx] = 1;
    }
  }
  // dilatation 2 cellules pour relier les éléments d'un même schéma.
  let dil = grid;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(dil);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (dil[y * gw + x]) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < gw && ny < gh) next[ny * gw + nx] = 1;
      }
    }
    dil = next;
  }

  const seen = new Uint8Array(gw * gh);
  const boxes: Box[] = [];
  for (let sy = 0; sy < gh; sy++) for (let sx = 0; sx < gw; sx++) {
    const si = sy * gw + sx;
    if (!dil[si] || seen[si]) continue;
    const q = [[sx, sy]]; seen[si] = 1;
    let minX = sx, maxX = sx, minY = sy, maxY = sy, count = 0;
    while (q.length) {
      const [x, y] = q.pop()!; count++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx, ny=y+dy;
        if (nx<0||ny<0||nx>=gw||ny>=gh) continue;
        const ni=ny*gw+nx;
        if (dil[ni]&&!seen[ni]) { seen[ni]=1; q.push([nx,ny]); }
      }
    }
    const b = {
      x0: Math.max(0, (minX - 2) * cell),
      y0: Math.max(0, (minY - 2) * cell),
      x1: Math.min(W, (maxX + 3) * cell),
      y1: Math.min(H, (maxY + 3) * cell),
    };
    const bw=b.x1-b.x0, bh=b.y1-b.y0;
    const area=boxArea(b)/(W*H);
    if (count >= 7 && bw > W*.14 && bh > H*.11 && area > .018 && area < .62) boxes.push(b);
  }

  // On favorise les zones qui ressemblent à des schémas (pas des paragraphes résiduels).
  return boxes
    .sort((a,b) => a.y0-b.y0 || a.x0-b.x0)
    .filter((b, i, arr) => !arr.some((other,j) => j!==i && boxArea(other)<boxArea(b) &&
      other.x0>=b.x0 && other.y0>=b.y0 && other.x1<=b.x1 && other.y1<=b.y1))
    .slice(0, 8);
}

function ringScore(mask: Uint8Array, W: number, H: number, cx: number, cy: number, r: number) {
  let dark = 0, total = 0;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
    for (const rr of [r*.8, r, r*1.2]) {
      const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr);
      if (x>=0&&y>=0&&x<W&&y<H) { dark += mask[y*W+x]; total++; }
    }
  }
  return total ? dark / total : 0;
}

function traceRegion(canvas: HTMLCanvasElement, region: Box, textBoxes: Box[]): AiDiagramStroke[] {
  const W=canvas.width, H=canvas.height;
  const mask=makeDarkMask(canvas, 145);
  // Enlève uniquement le texte extérieur / descriptif ; les petits numéros du dessin restent.
  const relevantText = textBoxes.filter(b => boxArea(b) > Math.max(80, (region.x1-region.x0)*(region.y1-region.y0)*.006));
  eraseBoxes(mask,W,H,relevantText,3);

  const rw=Math.max(1, region.x1-region.x0), rh=Math.max(1, region.y1-region.y0);
  const step=Math.max(2, Math.round(Math.max(rw,rh)/220));
  const strokes: AiDiagramStroke[] = [];
  const minRun=Math.max(2, step);

  for (let y=Math.floor(region.y0); y<region.y1; y+=step) {
    let run=-1;
    for (let x=Math.floor(region.x0); x<=region.x1; x+=step) {
      let ink=0;
      for (let yy=y; yy<Math.min(H,y+step); yy++) {
        for (let xx=x; xx<Math.min(W,x+step); xx++) ink += mask[yy*W+xx];
      }
      const active=ink >= Math.max(1, Math.floor(step*step*.12));
      if (active && run<0) run=x;
      if ((!active || x>=region.x1) && run>=0) {
        const end=active ? x : x-step;
        if (end-run>=minRun) {
          const toPoint=(px:number,py:number) => ({
            x: clamp((px-region.x0)/rw,.01,.99),
            y: clamp(((py-region.y0)/rh) * .5,.01,.49),
          });
          strokes.push({points:[toPoint(run,y+step/2),toPoint(end+step,y+step/2)]});
        }
        run=-1;
      }
      if (strokes.length>=420) return strokes;
    }
  }
  return strokes;
}

function detectDiagram(canvas: HTMLCanvasElement, region: Box, words: OCRWord[], lines: OCRLine[], index: number): AiExerciseDiagram {
  const W=canvas.width,H=canvas.height;
  const rw=Math.max(1,region.x1-region.x0), rh=Math.max(1,region.y1-region.y0);
  const dark=makeDarkMask(canvas,165);
  const players: AiDiagramPlayer[]=[];
  const objects: AiDiagramObject[]=[];

  // Les numéros/lettres courts à l'intérieur d'un anneau deviennent de vrais joueurs Plaquette.
  const labelWords = words.filter(w =>
    w.x0>=region.x0 && w.x1<=region.x1 && w.y0>=region.y0 && w.y1<=region.y1 &&
    /^[0-9]{1,2}[A-Za-z]?$|^[A-E]$/i.test(w.text.trim())
  );
  for (const w of labelWords) {
    const cx=(w.x0+w.x1)/2, cy=(w.y0+w.y1)/2;
    const size=Math.max(w.x1-w.x0,w.y1-w.y0);
    const score=ringScore(dark,W,H,cx,cy,Math.max(7,size*.9));
    if (score<.16) continue;
    const x=clamp((cx-region.x0)/rw,.02,.98);
    const y=clamp(((cy-region.y0)/rh)*.5,.02,.48);
    if (players.some(p=>Math.hypot(p.x-x,(p.y-y)*2)<.035)) continue;
    players.push({
      key:`s${index+1}p${players.length+1}`,
      label:w.text.replace(/[^0-9A-Za-z]/g,"") || String(players.length+1),
      team:"att", x,y,hasBall:false,
    });
  }

  // Fallback : cercles compacts non textuels -> joueurs. On reste volontairement conservateur.
  if (players.length===0) {
    const cell=Math.max(3,Math.round(Math.min(rw,rh)/180));
    const candidates:Array<{x:number;y:number;score:number}>=[];
    for (let y=region.y0+10;y<region.y1-10;y+=cell*2) for (let x=region.x0+10;x<region.x1-10;x+=cell*2) {
      const score=ringScore(dark,W,H,x,y,Math.max(8,Math.min(rw,rh)*.027));
      if (score>.48) candidates.push({x,y,score});
    }
    candidates.sort((a,b)=>b.score-a.score);
    for (const c of candidates) {
      const x=clamp((c.x-region.x0)/rw,.02,.98), y=clamp(((c.y-region.y0)/rh)*.5,.02,.48);
      if (players.some(p=>Math.hypot(p.x-x,(p.y-y)*2)<.055)) continue;
      players.push({key:`s${index+1}p${players.length+1}`,label:String(players.length+1),team:"att",x,y,hasBall:false});
      if (players.length>=12) break;
    }
  }

  const strokes=traceRegion(canvas,region,lines);
  // Le fond du schéma est remappé sur le terrain MyBasket. Si le dessin source est long,
  // on garde le plein terrain ; sinon demi-terrain.
  const courtType: "half"|"full" = rh/rw > 1.28 ? "full" : "half";
  if (courtType==="full") {
    for (const s of strokes) for (const p of s.points) p.y=clamp(p.y*2,.01,.99);
    for (const p of players) p.y=clamp(p.y*2,.02,.98);
  }

  return {
    detected: players.length>0 || strokes.length>8,
    courtType,
    players,
    objects,
    actions: [],
    strokes,
    notes: "Reproduction locale vectorisée de la photo. Tous les éléments restent modifiables dans Plaquette.",
  };
}

function inferMeta(text: string) {
  const n=norm(text);
  const firstNum=(pattern:RegExp)=>{const m=n.match(pattern);return m?Number(m[1]):null;};
  const cat=(n.match(/\b(u9|u11|u13|u15|u18|u21|senior)\b/i)?.[1]||"— Choisir —").toUpperCase();
  return {
    plots:firstNum(/(\d{1,2})\s*(?:plots?|cones?)/),
    ballons:firstNum(/(\d{1,2})\s*(?:ballons?|balles?)/),
    paniers:firstNum(/(\d{1,2})\s*paniers?/),
    joueurs:firstNum(/(\d{1,2})\s*joueurs?/),
    temps:firstNum(/(\d{1,3})\s*(?:min|minutes?)/),
    categorie:["U9","U11","U13","U15","U18","U21","SENIOR"].includes(cat)?(cat==="SENIOR"?"Senior":cat):"— Choisir —",
    themes:ALLOWED_THEMES.filter(t=>n.includes(norm(t))).slice(0,5),
  };
}

function mergeTextResults(frames: Array<{parsed:ReturnType<typeof parseText>;lines:OCRLine[];words:OCRWord[];confidence:number;canvas:HTMLCanvasElement}>) {
  const byScore=[...frames].sort((a,b)=>{
    const aFilled=[a.parsed.title,a.parsed.organisation,...a.parsed.deroulement,...a.parsed.consignes,...a.parsed.variantes].filter(Boolean).length;
    const bFilled=[b.parsed.title,b.parsed.organisation,...b.parsed.deroulement,...b.parsed.consignes,...b.parsed.variantes].filter(Boolean).length;
    return bFilled-aFilled || b.lines.length-a.lines.length || b.confidence-a.confidence;
  });
  return byScore[0];
}

export async function scanExerciseLocally(file: File,onStatus?:(message:string)=>void):Promise<AiExerciseImport>{
  onStatus?.(file.type.startsWith("video/")?"Extraction des vues utiles de la vidéo…":"Correction de la photo…");
  const canvases=file.type.startsWith("video/")?await videoFrames(file):[await fileToCanvas(file)];
  const frames:Array<{parsed:ReturnType<typeof parseText>;lines:OCRLine[];words:OCRWord[];confidence:number;canvas:HTMLCanvasElement}>=[];
  for(let i=0;i<canvases.length;i++){
    onStatus?.(`Lecture du texte${canvases.length>1?` — vue ${i+1}/${canvases.length}`:""}…`);
    const ocr=await runOCR(canvases[i]);
    frames.push({parsed:parseText(ocr.lines,canvases[i].width,canvases[i].height),...ocr,canvas:canvases[i]});
  }
  const best=mergeTextResults(frames);
  const allText=frames.flatMap(f=>f.lines.map(l=>l.text)).join("\n");
  const meta=inferMeta(allText);

  onStatus?.("Détection et reproduction des schémas sur le terrain MyBasket…");
  const diagrams:AiExerciseDiagram[]=[];
  for(const frame of frames){
    const regions=detectDiagramRegions(frame.canvas,frame.lines);
    for(const region of regions){
      const diagram=detectDiagram(frame.canvas,region,frame.words,frame.lines,diagrams.length);
      if(diagram.detected) diagrams.push(diagram);
      if(diagrams.length>=8) break;
    }
    if(diagrams.length>=8) break;
  }

  // Déduplication simple des vues vidéo : même nombre de joueurs + proximité de densité.
  const unique=diagrams.filter((d,i,arr)=>!arr.slice(0,i).some(p=>
    p.courtType===d.courtType &&
    Math.abs((p.players?.length||0)-(d.players?.length||0))<=0 &&
    Math.abs((p.strokes?.length||0)-(d.strokes?.length||0))<12
  ));

  const warnings:string[]=[];
  if(!best.parsed.title) warnings.push("Titre non certain : vérifie le champ avant création.");
  if(!best.lines.length) warnings.push("Aucun texte suffisamment lisible n'a été trouvé.");
  if(!unique.length) warnings.push("Aucun dessin exploitable détecté : la photo peut être recadrée plus près de la fiche.");
  else warnings.push(`${unique.length} schéma${unique.length>1?"s":""} vectorisé${unique.length>1?"s":""} sur le terrain MyBasket — vérifie puis ajuste si nécessaire.`);

  const empty:AiExerciseDiagram={detected:false,courtType:"half",players:[],objects:[],actions:[],strokes:[],notes:""};
  return {
    title:best.parsed.title||"",
    organisation:best.parsed.organisation||"",
    deroulement:best.parsed.deroulement||[],
    consignes:best.parsed.consignes||[],
    variantes:best.parsed.variantes||[],
    plots:meta.plots,ballons:meta.ballons,paniers:meta.paniers,joueurs:meta.joueurs,
    categorie:meta.categorie as AiExerciseImport["categorie"],
    type:"Collectif",niveau:"Intermédiaire",temps:meta.temps,themes:meta.themes,
    diagram:unique[0]||empty,diagrams:unique,source:"local",
    confidence:{text:best.confidence,diagram:unique.length?.72:0},
    warnings,
  };
}
