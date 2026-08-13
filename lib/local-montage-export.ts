export type LocalExportSource = {
  url: string;
  start: number;
  end: number;
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
    const ok = () => {
      cleanup();
      resolve();
    };
    const bad = () => {
      cleanup();
      reject(new Error(`Erreur média pendant ${event}.`));
    };
    const cleanup = () => {
      target.removeEventListener(event, ok);
      target.removeEventListener("error", bad);
    };
    target.addEventListener(event, ok, { once: true });
    target.addEventListener("error", bad, { once: true });
  });

export const exportSequentialClipsLocally = async (
  sources: LocalExportSource[],
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

  // Try to capture the local video's audio track when supported.
  const capture = (video as any).captureStream?.bind(video);
  let videoMediaStream: MediaStream | null = null;

  const mimeType = bestMimeType();
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(500);

  let raf = 0;
  const renderFrame = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const vw = video.videoWidth || 1920;
    const vh = video.videoHeight || 1080;
    const scale = Math.min(canvas.width / vw, canvas.height / vh);
    const width = vw * scale;
    const height = vh * scale;
    ctx.drawImage(
      video,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
    raf = requestAnimationFrame(renderFrame);
  };
  raf = requestAnimationFrame(renderFrame);

  try {
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      video.src = source.url;
      video.load();
      await waitFor(video, "loadedmetadata");

      video.currentTime = source.start;
      await waitFor(video, "seeked");

      if (capture) {
        try {
          const capturedStream = capture() as MediaStream | null;
          videoMediaStream = capturedStream;
          if (capturedStream) {
            for (const track of capturedStream.getAudioTracks()) {
              if (!stream.getAudioTracks().some((t) => t.id === track.id)) {
                stream.addTrack(track);
              }
            }
          }
        } catch {
          // Video export remains available without audio on unsupported browsers.
        }
      }

      await video.play();

      await new Promise<void>((resolve) => {
        const tick = () => {
          const relative = (video.currentTime - source.start) / Math.max(0.1, source.end - source.start);
          onProgress?.(((index + Math.max(0, Math.min(1, relative))) / sources.length) * 100);

          if (video.currentTime >= source.end - 0.025 || video.ended) {
            video.pause();
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      });
    }
  } finally {
    cancelAnimationFrame(raf);
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    videoMediaStream?.getTracks().forEach((track) => track.stop());
  }

  const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  const blob = new Blob(chunks, { type: mimeType });
  const file = new File([blob], `${fileName}.${extension}`, { type: mimeType });

  return { blob, file, mimeType, extension };
};

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

  const data: ShareData = {
    title: "Montage MyBasket",
    text: "Montage vidéo MyBasket",
    files: [result.file],
  };

  if (nav.share && (!nav.canShare || nav.canShare(data))) {
    await nav.share(data);
    return true;
  }

  return false;
};
