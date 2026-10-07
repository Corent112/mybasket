"use client";
import { useEffect, useRef, useState } from "react";

const cache = new Map<string, string>();
let tasks = Promise.resolve();
function snapshot(src: string, time: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true; video.preload = "metadata"; video.crossOrigin = "anonymous";
    let done = false;
    const finish = (url?: string) => {
      if (done) return; done = true; clearTimeout(timer);
      video.removeAttribute("src"); video.load();
      if (url) resolve(url); else reject(new Error("Miniature indisponible"));
    };
    const timer = window.setTimeout(() => finish(), 8000);
    const draw = () => {
      if (video.readyState < 2) return;
      try {
        const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 135;
        canvas.getContext("2d")!.drawImage(video, 0, 0, 240, 135);
        finish(canvas.toDataURL("image/jpeg", .65));
      } catch { finish(); }
    };
    video.onloadedmetadata = () => { video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - .05)); };
    video.onseeked = draw;
    video.onloadeddata = () => { if (time === 0) draw(); };
    video.onerror = () => finish(); video.src = src;
  });
}

/** Lazy, serialized frame extraction avoids decoding hundreds of sources together. */
export default function ClipThumbnail({ src, time }: { src?: string | null; time: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl(""); if (!src || !ref.current) return;
    const key = `${src}:${time.toFixed(1)}`;
    let active = true;
    if (cache.has(key)) { setUrl(cache.get(key)!); return; }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      tasks = tasks.then(async () => {
        if (!active) return;
        try {
          const frame = cache.get(key) || await snapshot(src, time);
          if (cache.size > 300) cache.delete(cache.keys().next().value!);
          cache.set(key, frame); if (active) setUrl(frame);
        } catch { /* The unavailable-video placeholder stays visible. */ }
      });
    });
    observer.observe(ref.current);
    return () => { active = false; observer.disconnect(); };
  }, [src, time]);
  return <span ref={ref} style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
    {url ? <img src={url} alt="Miniature du clip source" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 11 }}>{src ? "▶" : "Vidéo indisponible"}</span>}
  </span>;
}
