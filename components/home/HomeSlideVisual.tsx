import type { CSSProperties } from 'react';
import { decodeSlideImage, safeSlideUrl, type SliderRow } from '@/lib/home/slider';
import styles from './HomeSlideVisual.module.css';

export default function HomeSlideVisual({ slide, preview = false, sourceOverride }: { slide: SliderRow; preview?: boolean; sourceOverride?: string | null }) {
  const decoded = decodeSlideImage(slide.image_url);
  const { design } = decoded;
  const source = preview && sourceOverride !== undefined ? sourceOverride : decoded.source;
  const href = safeSlideUrl(slide.button_href, true);
  const variables = {
    '--slide-bg': design.background, '--slide-color': design.color, '--slide-accent': design.accent,
    '--title-size': `${design.titleSize}cqw`,
  } as CSSProperties;
  return <div className={`${styles.stage} ${design.layout === 'split' ? styles.split : ''}`} style={variables}>
    {source && <div className={styles.imageWrap}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={source} alt={design.layout === 'image' ? slide.title || '' : ''} style={{ objectFit: design.imageFit, objectPosition: `${design.imageX}% ${design.imageY}%`, transform: `scale(${design.zoom})` }} />
    </div>}
    {design.layout === 'image' && !source && preview && <div className={styles.placeholder}>Ajoute ton image pour commencer</div>}
    {design.layout !== 'image' && <>
      <div className={styles.shade} style={{ opacity: design.overlay / 100 }} />
      <div className={styles.content} style={{ left: `${design.textX}%`, top: `${design.textY}%`, transform: `translate(-${design.textX}%, -${design.textY}%)`, width: `${design.textWidth}%`, textAlign: design.align }}>
        <h2>{slide.title}</h2>
        {slide.subtitle && <p>{slide.subtitle}</p>}
        {slide.button_label && href && (preview ? <span className={styles.button}>{slide.button_label}</span> : <a className={styles.button} href={href}>{slide.button_label}</a>)}
      </div>
    </>}
    {design.layout === 'image' && href && !preview && <a className={styles.imageLink} href={href} aria-label={slide.button_label || slide.title || 'Découvrir'} />}
  </div>;
}
