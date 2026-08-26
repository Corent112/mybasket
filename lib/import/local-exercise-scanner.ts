import type {
  AiDiagramAction,
  AiDiagramObject,
  AiDiagramPlayer,
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
  { field: "deroulement", aliases: ["déroulement", "deroulement", "déroulé", "deroule", "description", "consigne de jeu"] },
  { field: "consignes", aliases: ["consignes", "consigne", "points clés", "points cles", "critères", "criteres"] },
  { field: "variantes", aliases: ["variantes", "variante", "évolution", "evolution", "évolutions", "evolutions"] },
  { field: "title", aliases: ["titre", "nom de l'exercice", "nom exercice", "exercice"] },
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
  const sections: Record<string, string[]> = { title: [], organisation: [], deroulement: [], consignes: [], variantes: [] };
  let active: keyof typeof sections | null = null;
  const unassigned: string[] = [];

  const identifyHeading = (text: string) => {
    const n = norm(text);
    for (const item of FIELD_HEADINGS) {
      for (const alias of item.aliases) {
        const a = norm(alias);
        if (n === a || n.startsWith(`${a} `) || n.startsWith(`${a}-`)) return { field: item.field, alias: a };
      }
    }
    return null;
  };

  for (const line of lines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const heading = identifyHeading(line.text);
    if (heading) {
      active = heading.field;
      const n = norm(line.text);
      const rest = n === heading.alias ? "" : line.text.replace(/^.*?(?:[:\-–—]\s*)/, "").trim();
      if (rest && norm(rest) !== n) sections[active].push(rest);
      continue;
    }
    if (active) sections[active].push(line.text);
    else unassigned.push(line.text);
  }

  if (!sections.title.length && unassigned.length) {
    const candidate = unassigned.find((line) => line.length >= 3 && line.length <= 100);
    if (candidate) {
      sections.title.push(candidate);
      unassigned.splice(unassigned.indexOf(candidate), 1);
    }
  }
  if (!sections.deroulement.length && unassigned.length) sections.deroulement.push(...unassigned);

  return {
    title: sections.title.join(" ").trim(),
    organisation: sections.organisation.join("\n").trim(),
    deroulement: sections.deroulement.filter(Boolean),
    consignes: sections.consignes.filter(Boolean),
    variantes: sections.variantes.filter(Boolean),
  };
}

function detectDiagramRegions(canvas: HTMLCanvasElement, ocrLines: OCRLine[]) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, W, H).data;
  const occupancy = new Float32Array(H);

  for (let y = 0; y < H; y += 3) {
    let dark = 0;
    for (let x = 0; x < W; x += 3) {
      const i = (y * W + x) * 4;
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (gray < 190) dark++;
    }
    occupancy[y] = dark / Math.ceil(W / 3);
  }

  const textMask = (y: number) => ocrLines.some((l) => y >= l.y0 - 8 && y <= l.y1 + 8 && l.x1 - l.x0 > W * 0.15);
  const activeRows: number[] = [];
  for (let y = 0; y < H; y += 3) {
    if (occupancy[y] > 0.025 && !textMask(y)) activeRows.push(y);
  }

  const bands: Array<{ y0: number; y1: number }> = [];
  let start = -1;
  let prev = -1;
  for (const y of activeRows) {
    if (start < 0) start = y;
    if (prev >= 0 && y - prev > Math.max(18, H * 0.025)) {
      if (prev - start > H * 0.10) bands.push({ y0: Math.max(0, start - 15), y1: Math.min(H, prev + 15) });
      start = y;
    }
    prev = y;
  }
  if (start >= 0 && prev - start > H * 0.10) bands.push({ y0: Math.max(0, start - 15), y1: Math.min(H, prev + 15) });

  const likely = bands.filter((b) => b.y1 - b.y0 > H * 0.12).slice(0, 6);
  if (likely.length) return likely.map((b) => ({ x0: 0, x1: W, ...b }));

  // fallback : zone non textuelle la plus importante, souvent le croquis.
  const maxTextY = ocrLines.reduce((m, l) => Math.max(m, l.y1), 0);
  if (maxTextY < H * 0.78) return [{ x0: 0, x1: W, y0: Math.max(0, maxTextY + 12), y1: H }];
  return [];
}

function detectDiagram(canvas: HTMLCanvasElement, region: { x0: number; x1: number; y0: number; y1: number }, index: number) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const w = Math.max(1, region.x1 - region.x0);
  const h = Math.max(1, region.y1 - region.y0);
  const img = ctx.getImageData(region.x0, region.y0, w, h);
  const visited = new Uint8Array(w * h);
  const dark = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3 < 115;
  };
  const comps: Array<{ minX: number; minY: number; maxX: number; maxY: number; count: number }> = [];
  const step = Math.max(1, Math.round(Math.min(w, h) / 700));

  for (let sy = 0; sy < h; sy += step) {
    for (let sx = 0; sx < w; sx += step) {
      const si = sy * w + sx;
      if (visited[si] || !dark(sx, sy)) continue;
      const q: Array<[number, number]> = [[sx, sy]];
      visited[si] = 1;
      let minX = sx, maxX = sx, minY = sy, maxY = sy, count = 0;
      while (q.length && count < 15000) {
        const [x, y] = q.pop()!;
        count++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        const ns = [[x + step, y], [x - step, y], [x, y + step], [x, y - step]];
        for (const [nx, ny] of ns) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!visited[ni] && dark(nx, ny)) { visited[ni] = 1; q.push([nx, ny]); }
        }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (count >= 6 && bw >= 5 && bh >= 5) comps.push({ minX, minY, maxX, maxY, count });
    }
  }

  const players: AiDiagramPlayer[] = [];
  const objects: AiDiagramObject[] = [];
  const actions: AiDiagramAction[] = [];
  const maxObj = Math.min(w, h) * 0.16;

  comps
    .filter((c) => {
      const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
      const ratio = bw / bh;
      return bw >= 9 && bh >= 9 && bw <= maxObj && bh <= maxObj && ratio > 0.55 && ratio < 1.8;
    })
    .sort((a, b) => a.minY - b.minY || a.minX - b.minX)
    .slice(0, 20)
    .forEach((c, i) => {
      const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
      const fill = c.count / Math.max(1, bw * bh / (step * step));
      const x = (c.minX + c.maxX) / 2 / w;
      const yRaw = (c.minY + c.maxY) / 2 / h;
      const y = Math.max(0.03, Math.min(0.47, yRaw * 0.5));
      if (fill > 0.12 && fill < 0.82) {
        players.push({ key: `s${index + 1}p${i + 1}`, label: String(players.length + 1), team: "att", x, y, hasBall: false });
      } else if (fill >= 0.82 && Math.max(bw, bh) < maxObj * 0.55) {
        objects.push({ kind: "cone", x, y });
      }
    });

  // Detect long, thin connected components as trajectories. Court borders are ignored by size/location filters.
  comps
    .filter((c) => {
      const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
      const long = Math.max(bw, bh), short = Math.max(1, Math.min(bw, bh));
      return long > Math.min(w, h) * 0.12 && long < Math.max(w, h) * 0.68 && long / short > 4;
    })
    .slice(0, 24)
    .forEach((c, i) => {
      const from = { x: c.minX / w, y: Math.max(0.03, Math.min(0.47, (c.minY / h) * 0.5)) };
      const to = { x: c.maxX / w, y: Math.max(0.03, Math.min(0.47, (c.maxY / h) * 0.5)) };
      actions.push({ action: "cut", from, to, order: i + 1 });
    });

  return {
    detected: players.length > 0 || actions.length > 0 || objects.length > 0,
    courtType: "half" as const,
    players,
    objects,
    actions,
    notes: "Reconstruction locale automatique — à vérifier avant création.",
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
      const diagram = detectDiagram(frame.canvas, region, diagrams.length);
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
