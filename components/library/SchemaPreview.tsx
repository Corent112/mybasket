'use client';
import { useEffect, useState } from 'react';
import styles from './SchemaPreview.module.css';
export default function SchemaPreview({ images, alt = 'Schéma', showCount = true }: { images: string[]; alt?: string; showCount?: boolean }) {
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0), [failed, setFailed] = useState<Set<string>>(new Set());
  const active = hovered || focused;
  const count = images.length, current = count ? index % count : 0;
  const source = images[current];
  useEffect(() => {
    if (!active || count < 2) return;
    const timer = window.setInterval(() => setIndex(previous => (previous + 1) % count), 2000);
    return () => window.clearInterval(timer);
  }, [active, count]);
  useEffect(() => {
    if (!active || count < 2) return;
    const next = images[(current + 1) % count];
    if (next && !failed.has(next)) { const image = new Image(); image.src = next; }
  }, [active, count, current, images, failed]);
  return <div className={styles.preview} tabIndex={count > 1 ? 0 : undefined} role="group" aria-label={`${alt}${count > 1 ? ` · ${count} schémas, aperçu au survol` : ''}`}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => { setHovered(false); if (!focused) setIndex(0); }}
    onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); if (!hovered) setIndex(0); } }}
    onKeyDown={event => { if (count > 1 && ['ArrowRight', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); setIndex(previous => (previous + (event.key === 'ArrowRight' ? 1 : count - 1)) % count); } }}>
    {source && !failed.has(source) ? <img src={source} alt={`${alt} — schéma ${current + 1} sur ${count}`} loading="lazy" decoding="async" onError={() => setFailed(previous => new Set(previous).add(source))} /> : <span className={styles.empty} aria-label="Aperçu indisponible">🏀</span>}
    {showCount && count > 1 && <span className={styles.counter} aria-hidden="true">{current + 1} / {count}</span>}
  </div>;
}
