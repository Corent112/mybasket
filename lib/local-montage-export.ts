export type ExportAnnotation = {
  id?: string;
  kind: "arrow" | "line" | "circle" | "zone" | "freehand" | "text" | "tracker";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  text?: string;
  start?: number;
  end?: number;
  fillOpacity?: number;
  points?: Array<{ x: number; y: number }>;
};

export type LocalExportSource = {
  id?: string;
  type?: "clip" | "freeze";
  url: string;
  start: number;
  end: number;
  timelineStart?: number;
  duration?: number;
  playbackRate?: number;
  repeatCount?: number;
  freezeTime?: number | null;
  annotations?: ExportAnnotation[];
  transition?: "none" | "fade";
};

export type LocalExportOverlay = {
  id?: string;
  type: "title" | "text" | "image";
  timelineStart: number;
  duration: number;
  text?: string;
  imageUrl?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAlign?: "left" | "center" | "right";
  background?: string;
  hidden?: boolean;
};

export type LocalExportResult = {
  blob: Blob;
  file: File;
  mimeType: string;
  extension: "mp4" | "webm";
};

const bestMimeType = () => {
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "video/webm";
};

const waitFor = (target: EventTarget, event: string) =>
  new Promise<void>((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error(`Erreur média pendant ${event}.`)); };
    const cleanup = () => {
      target.removeEventListener(event, ok);
      target.removeEventListener("error", bad);
    };
    target.addEventListener(event, ok, { once: true });
    target.addEventListener("error", bad, { once: true });
  });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("Image impossible à charger pendant l'export."));
  image.src = url;
});

const drawArrowHead = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size: number) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - 0.48), y2 - size * Math.sin(angle - 0.48));
  ctx.lineTo(x2 - size * Math.cos(angle + 0.48), y2 - size * Math.sin(angle + 0.48));
  ctx.closePath();
  ctx.fill();
};

const drawAnnotation = (
  ctx: CanvasRenderingContext2D,
  annotation: ExportAnnotation,
  localTime: number,
  sourceWidth = 960,
  sourceHeight = 540,
  targetWidth = 1920,
  targetHeight = 1080,
) => {
  const start = Number(annotation.start ?? 0);
  const end = Number(annotation.end ?? Number.POSITIVE_INFINITY);
  if (localTime < start || localTime > end) return;

  const sx = targetWidth / sourceWidth;
  const sy = targetHeight / sourceHeight;
  const x1 = annotation.x1 * sx;
  const y1 = annotation.y1 * sy;
  const x2 = annotation.x2 * sx;
  const y2 = annotation.y2 * sy;
  const width = Math.max(2, annotation.width * ((sx + sy) / 2));

  ctx.save();
  ctx.strokeStyle = annotation.color || "#f6c344";
  ctx.fillStyle = annotation.color || "#f6c344";
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (annotation.kind === "circle") {
    const radius = Math.hypot(x2 - x1, y2 - y1);
    ctx.beginPath();
    ctx.arc(x1, y1, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (annotation.kind === "zone") {
    ctx.save();
    ctx.globalAlpha = annotation.fillOpacity ?? 0.18;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.restore();
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  } else if (annotation.kind === "freehand") {
    const points = annotation.points || [];
    if (points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(points[0].x * sx, points[0].y * sy);
      points.slice(1).forEach((point) => ctx.lineTo(point.x * sx, point.y * sy));
      ctx.stroke();
    }
  } else if (annotation.kind === "text") {
    ctx.font = `900 ${Math.max(30, 30 * sy)}px Arial`;
    ctx.fillText(annotation.text || "Texte", x1, y1);
  } else if (annotation.kind === "tracker") {
    const span = Math.max(0.001, end - start);
    const t = clamp((localTime - start) / span, 0, 1);
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    const radius = 42 * ((sx + sy) / 2);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5 * ((sx + sy) / 2), 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (annotation.kind === "arrow") drawArrowHead(ctx, x1, y1, x2, y2, Math.max(18, width * 5));
  }
  ctx.restore();
};

const drawOverlay = async (
  ctx: CanvasRenderingContext2D,
  overlay: LocalExportOverlay,
  timelineTime: number,
  cache: Map<string, HTMLImageElement>,
  canvasWidth = 1920,
  canvasHeight = 1080,
) => {
  if (overlay.hidden) return;
  const local = timelineTime - overlay.timelineStart;
  if (local < 0 || local > overlay.duration) return;

  const xPct = Number(overlay.x ?? 50);
  const yPct = Number(overlay.y ?? 50);
  const widthPct = Number(overlay.width ?? (overlay.type === "image" ? 30 : 70));
  const heightPct = Number(overlay.height ?? 20);
  const x = (xPct / 100) * canvasWidth;
  const y = (yPct / 100) * canvasHeight;
  const w = (widthPct / 100) * canvasWidth;
  const h = (heightPct / 100) * canvasHeight;
  const fade = Math.min(1, local / 0.18, Math.max(0, overlay.duration - local) / 0.18);

  ctx.save();
  ctx.globalAlpha = clamp(Number(overlay.opacity ?? 1) * fade, 0, 1);
  ctx.translate(x, y);
  ctx.rotate((Number(overlay.rotation ?? 0) * Math.PI) / 180);

  if (overlay.type === "image" && overlay.imageUrl) {
    let image = cache.get(overlay.imageUrl);
    if (!image) {
      image = await loadImage(overlay.imageUrl);
      cache.set(overlay.imageUrl, image);
    }
    const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
    let drawW = w;
    let drawH = h || w / ratio;
    if (!overlay.height) drawH = drawW / ratio;
    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
  } else {
    const fontSize = Number(overlay.fontSize ?? (overlay.type === "title" ? 48 : 30)) * 2;
    ctx.font = `${Number(overlay.fontWeight ?? 800)} ${fontSize}px ${overlay.fontFamily || "Arial"}`;
    ctx.textAlign = overlay.textAlign || "center";
    ctx.textBaseline = "middle";
    if (overlay.background && overlay.background !== "transparent") {
      ctx.fillStyle = overlay.background;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillText(overlay.text || "", 0, 0, w);
  }
  ctx.restore();
};

/**
 * Export navigateur non destructif du montage. Rend les clips, ralentis,
 * répétitions, freezes, annotations et overlays dans un Canvas puis capture
 * le résultat via MediaRecorder. MP4 est utilisé quand Safari/Chrome le
 * supporte, sinon WebM reste le fallback sûr.
 */
export const exportTimelineLocally = async (
  sources: LocalExportSource[],
  overlays: LocalExportOverlay[],
  fileName = "montage-mybasket",
  onProgress?: (value: number) => void,
): Promise<LocalExportResult> => {
  if (!sources.length) throw new Error("Aucun clip à exporter.");

  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible.");

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = false;
  video.crossOrigin = "anonymous";

  const stream = canvas.captureStream(30);
  const mimeType = bestMimeType();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start(500);

  const imageCache = new Map<string, HTMLImageElement>();
  const total = sources.reduce((sum, source) => {
    const base = source.type === "freeze"
      ? Math.max(0.1, Number(source.duration ?? 2))
      : Math.max(0.1, Number(source.end) - Number(source.start)) / clamp(Number(source.playbackRate ?? 1), 0.25, 4);
    return sum + base * Math.max(1, Math.round(Number(source.repeatCount ?? 1)));
  }, 0);
  let renderedTimeline = 0;

  const drawVideoFrame = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const vw = video.videoWidth || 1920;
    const vh = video.videoHeight || 1080;
    const scale = Math.min(canvas.width / vw, canvas.height / vh);
    const width = vw * scale;
    const height = vh * scale;
    ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  };

  try {
    for (const source of sources) {
      video.src = source.url;
      video.load();
      await waitFor(video, "loadedmetadata");

      const sourceStart = Number(source.type === "freeze" ? source.freezeTime ?? source.start : source.start);
      const sourceEnd = Math.max(sourceStart, Number(source.end));
      const rate = clamp(Number(source.playbackRate ?? 1), 0.25, 4);
      const repeats = Math.max(1, Math.round(Number(source.repeatCount ?? 1)));
      const segmentDuration = source.type === "freeze"
        ? Math.max(0.1, Number(source.duration ?? 2))
        : Math.max(0.1, sourceEnd - sourceStart) / rate;

      for (let repeat = 0; repeat < repeats; repeat += 1) {
        video.currentTime = sourceStart;
        await waitFor(video, "seeked");
        video.playbackRate = rate;

        if (source.type === "freeze") {
          video.pause();
          const started = performance.now();
          while ((performance.now() - started) / 1000 < segmentDuration) {
            const elapsed = (performance.now() - started) / 1000;
            drawVideoFrame();
            const alpha = source.transition === "fade"
              ? Math.min(1, elapsed / 0.25, Math.max(0, segmentDuration - elapsed) / 0.25)
              : 1;
            if (alpha < 1) {
              ctx.fillStyle = `rgba(0,0,0,${1 - alpha})`;
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            for (const annotation of source.annotations || []) drawAnnotation(ctx, annotation, elapsed);
            for (const overlay of overlays) await drawOverlay(ctx, overlay, renderedTimeline + elapsed, imageCache);
            onProgress?.(clamp(((renderedTimeline + elapsed) / total) * 100, 0, 100));
            await sleep(1000 / 30);
          }
        } else {
          await video.play();
          await new Promise<void>((resolve) => {
            const tick = async () => {
              const localSource = Math.max(0, video.currentTime - sourceStart);
              const elapsed = localSource / rate;
              drawVideoFrame();
              const alpha = source.transition === "fade"
                ? Math.min(1, elapsed / 0.25, Math.max(0, segmentDuration - elapsed) / 0.25)
                : 1;
              if (alpha < 1) {
                ctx.fillStyle = `rgba(0,0,0,${1 - alpha})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
              }
              for (const annotation of source.annotations || []) drawAnnotation(ctx, annotation, elapsed);
              for (const overlay of overlays) await drawOverlay(ctx, overlay, renderedTimeline + elapsed, imageCache);
              onProgress?.(clamp(((renderedTimeline + elapsed) / total) * 100, 0, 100));

              if (video.currentTime >= sourceEnd - 0.02 || video.ended) {
                video.pause();
                resolve();
                return;
              }
              requestAnimationFrame(() => { void tick(); });
            };
            void tick();
          });
        }
        renderedTimeline += segmentDuration;
      }
    }
  } finally {
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  onProgress?.(100);
  const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  const blob = new Blob(chunks, { type: mimeType });
  const file = new File([blob], `${fileName}.${extension}`, { type: mimeType });
  return { blob, file, mimeType, extension };
};

// Compatibilité avec les anciens appels du Lot 1/2.
export const exportSequentialClipsLocally = async (
  sources: LocalExportSource[],
  fileName = "montage-mybasket",
  onProgress?: (value: number) => void,
) => exportTimelineLocally(sources, [], fileName, onProgress);

export const downloadLocalExport = (result: LocalExportResult) => {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const shareLocalExport = async (result: LocalExportResult) => {
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  const data: ShareData = { title: "Montage MyBasket", text: "Montage vidéo MyBasket", files: [result.file] };
  if (nav.share && (!nav.canShare || nav.canShare(data))) {
    await nav.share(data);
    return true;
  }
  return false;
};
