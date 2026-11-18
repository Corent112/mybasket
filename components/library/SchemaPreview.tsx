'use client';
import { useEffect, useState } from 'react';
import { previewVideoSource } from '@/lib/library/video-previews';
import HoverVideo from './HoverVideo';
import styles from './SchemaPreview.module.css';
export default function SchemaPreview({ images, video, alt = 'Schéma', showCount = true }: { images: string[]; video?:string; alt?: string; showCount?: boolean }) {
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0), [failed, setFailed] = useState<Set<string>>(new Set());
  const [failedVideo,setFailedVideo]=useState(''),[visible,setVisible]=useState(true);
  const media=video&&video!==failedVideo?previewVideoSource(video):null;
  const hasVideo=Boolean(media);
  const active = (hovered || focused)&&visible,playing=active&&hasVideo;
  const count = images.length, current = count ? index % count : 0;
  const source = images[current];
  useEffect(()=>{const update=()=>setVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update)},[]);
  useEffect(() => {
    if (!active || hasVideo || count < 2) return;
    const timer = window.setInterval(() => setIndex(previous => (previous + 1) % count), 2000);
    return () => window.clearInterval(timer);
  }, [active, hasVideo, count]);
  useEffect(() => {
    if (!active || hasVideo || count < 2) return;
    const next = images[(current + 1) % count];
    if (next && !failed.has(next)) { const image = new Image(); image.src = next; }
  }, [active, hasVideo, count, current, images, failed]);
  return <div className={styles.preview} tabIndex={count > 1 || media ? 0 : undefined} role="group" aria-label={`${alt}${media?' · aperçu vidéo au survol':count > 1 ? ` · ${count} schémas, aperçu au survol` : ''}`}
    onPointerEnter={event => {if(event.pointerType!=='touch')setHovered(true)}} onPointerLeave={() => { setHovered(false); if (!focused) setIndex(0); }}
    onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); if (!hovered) setIndex(0); } }}
    onKeyDown={event => { if (!media && count > 1 && ['ArrowRight', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); setIndex(previous => (previous + (event.key === 'ArrowRight' ? 1 : count - 1)) % count); } }}>
    {source && !failed.has(source) ? <img src={source} alt={`${alt} — schéma ${current + 1} sur ${count}`} loading="lazy" decoding="async" onError={() => setFailed(previous => new Set(previous).add(source))} /> : <span className={styles.empty} aria-label="Aperçu indisponible">🏀</span>}
    {playing&&media&&<div className={styles.video}><HoverVideo source={media} title={alt} onFailure={()=>setFailedVideo(video||'')}/></div>}
    {media?<span className={styles.counter} aria-hidden="true">▶ Vidéo</span>:showCount && count > 1 && <span className={styles.counter} aria-hidden="true">{current + 1} / {count}</span>}
  </div>;
}
