export type GamePlanMontageExportItem = {
  id: string;
  type: "title" | "text" | "image" | "system" | "data" | "clip";
  title: string;
  subtitle?: string;
  duration?: number;
  imageUrl?: string;
  videoUrl?: string;
  clipStart?: number;
  clipEnd?: number;
  lines?: string[];
};

export type GamePlanMontageExportResult = {
  blob: Blob;
  file: File;
  extension: "mp4" | "webm";
  mimeType: string;
};

const supportedMime = () => {
  const choices = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return choices.find((x) => MediaRecorder.isTypeSupported(x)) || "video/webm";
};

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image impossible à charger."));
    image.src = src;
  });

const drawCover = (ctx: CanvasRenderingContext2D, image: CanvasImageSource, sw: number, sh: number, cw: number, ch: number) => {
  const scale = Math.max(cw / sw, ch / sh);
  const width = sw * scale;
  const height = sh * scale;
  ctx.drawImage(image, (cw - width) / 2, (ch - height) / 2, width, height);
};

const drawTextScreen = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  item: GamePlanMontageExportItem,
) => {
  ctx.fillStyle = "#12080c";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#d4a24c";
  ctx.fillRect(0, 0, width, 18);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 72px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const title = item.title || "GAME PLAN";
  ctx.fillText(title.toUpperCase(), width / 2, height * 0.42, width * 0.82);
  if (item.subtitle) {
    ctx.font = "500 34px Arial";
    ctx.fillStyle = "#e8ddd9";
    ctx.fillText(item.subtitle, width / 2, height * 0.54, width * 0.78);
  }
  if (item.lines?.length) {
    ctx.textAlign = "left";
    ctx.font = "600 30px Arial";
    ctx.fillStyle = "#ffffff";
    item.lines.slice(0, 7).forEach((line, index) => {
      ctx.fillText(`• ${line}`, width * 0.18, height * 0.62 + index * 46, width * 0.64);
    });
  }
};

export async function exportGamePlanMontage(
  items: GamePlanMontageExportItem[],
  fileName = "game-plan-mybasket",
  onProgress?: (value: number) => void,
): Promise<GamePlanMontageExportResult> {
  if (!items.length) throw new Error("Le montage est vide.");

  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible.");

  const stream = canvas.captureStream(30);
  const mimeType = supportedMime();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start(500);

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.crossOrigin = "anonymous";

  try {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const base = index / items.length;

      if (item.type === "clip" && item.videoUrl) {
        video.src = item.videoUrl;
        video.load();
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error(`Vidéo impossible à charger : ${item.title}`));
        });
        const start = Math.max(0, Number(item.clipStart || 0));
        const end = Math.max(start + 0.25, Number(item.clipEnd || start + 5));
        video.currentTime = start;
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        });
        await video.play();
        await new Promise<void>((resolve) => {
          const frame = () => {
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (video.videoWidth && video.videoHeight) {
              drawCover(ctx, video, video.videoWidth, video.videoHeight, canvas.width, canvas.height);
            }
            if (item.title) {
              ctx.fillStyle = "rgba(12,6,9,.82)";
              ctx.fillRect(0, canvas.height - 150, canvas.width, 150);
              ctx.fillStyle = "#fff";
              ctx.font = "900 46px Arial";
              ctx.textAlign = "left";
              ctx.fillText(item.title, 70, canvas.height - 82, canvas.width - 140);
            }
            const local = Math.max(0, Math.min(1, (video.currentTime - start) / Math.max(0.25, end - start)));
            onProgress?.((base + local / items.length) * 100);
            if (video.currentTime >= end - 0.03 || video.ended) {
              video.pause();
              resolve();
              return;
            }
            requestAnimationFrame(frame);
          };
          frame();
        });
      } else if ((item.type === "image" || item.type === "system") && item.imageUrl) {
        const image = await loadImage(item.imageUrl);
        const duration = Math.max(1, Number(item.duration || 4));
        const started = performance.now();
        while ((performance.now() - started) / 1000 < duration) {
          ctx.fillStyle = "#0b0809";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          drawCover(ctx, image, image.naturalWidth, image.naturalHeight, canvas.width, canvas.height);
          ctx.fillStyle = "rgba(15,8,12,.78)";
          ctx.fillRect(0, canvas.height - 150, canvas.width, 150);
          ctx.fillStyle = "#fff";
          ctx.font = "900 46px Arial";
          ctx.textAlign = "left";
          ctx.fillText(item.title, 70, canvas.height - 82, canvas.width - 140);
          const local = Math.min(1, (performance.now() - started) / 1000 / duration);
          onProgress?.((base + local / items.length) * 100);
          await sleep(33);
        }
      } else {
        const duration = Math.max(1, Number(item.duration || 3));
        const started = performance.now();
        while ((performance.now() - started) / 1000 < duration) {
          drawTextScreen(ctx, canvas.width, canvas.height, item);
          const local = Math.min(1, (performance.now() - started) / 1000 / duration);
          onProgress?.((base + local / items.length) * 100);
          await sleep(33);
        }
      }
    }
  } finally {
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    video.pause();
    video.removeAttribute("src");
  }

  const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  const blob = new Blob(chunks, { type: mimeType });
  const file = new File([blob], `${fileName}.${extension}`, { type: mimeType });
  onProgress?.(100);
  return { blob, file, extension, mimeType };
}
