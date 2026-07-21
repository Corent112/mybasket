'use client';

import { useState } from 'react';

type Props = {
  schemaImages?: string[];
  images?: string[];
  alt?: string;
};

/**
 * Vignette d'exercice pour la bibliothèque.
 * - Affiche une pastille "📷 n" en haut à droite du cadre.
 * - Au survol de la carte, les schémas défilent (slide horizontal).
 *
 * Intégration dans bibliotheque/page.tsx, dans le map des exercices :
 *   <ExerciceVignette schemaImages={ex.schemaImages} images={ex.images} alt={ex.title} />
 */
export default function ExerciceVignette({ schemaImages = [], images = [], alt = '' }: Props) {
  // On privilégie les schémas, puis les images uploadées
  const slides = [...(schemaImages || []), ...(images || [])].filter(Boolean);
  const count = slides.length;
  const [hover, setHover] = useState(false);

  // Décalage pour faire glisser jusqu'au dernier schéma au survol
  const offset = count > 1 ? ((count - 1) / count) * 100 : 0;

  return (
    <div
      className="exv"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {count === 0 ? (
        <div className="exv-empty">🏀</div>
      ) : (
        <div
          className="exv-track"
          style={{
            width: `${count * 100}%`,
            transform: hover && count > 1 ? `translateX(-${offset}%)` : 'translateX(0)',
            transitionDuration: `${Math.min(4, Math.max(0.7, count * 0.8))}s`,
          }}
        >
          {slides.map((src, i) => (
            <div className="exv-slide" key={i} style={{ width: `${100 / count}%` }}>
              <img src={src} alt={alt ? `${alt} — vue ${i + 1}` : `vue ${i + 1}`} />
            </div>
          ))}
        </div>
      )}

      {count > 0 && (
        <span className="exv-pastille">
          📷 {count}
        </span>
      )}

      <style jsx>{`
        .exv {
          position: relative;
          width: 100%;
          height: 150px;
          border-radius: 14px;
          overflow: hidden;
          background: #f4f4f4;
          border: 1px solid #e6e6e6;
        }
        .exv-track {
          display: flex;
          height: 100%;
          transition-property: transform;
          transition-timing-function: ease-in-out;
        }
        .exv-slide {
          height: 100%;
          flex: 0 0 auto;
        }
        .exv-slide img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          background: #fff;
        }
        .exv-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          font-size: 2.2rem;
          opacity: 0.45;
        }
        .exv-pastille {
          position: absolute;
          top: 8px;
          right: 8px;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          background: #6B1A2C;
          color: #fff;
          font-size: 0.72rem;
          font-weight: 800;
          line-height: 1;
          padding: 0.28rem 0.5rem;
          border-radius: 999px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
          z-index: 2;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}