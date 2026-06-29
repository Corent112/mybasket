"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Exercise } from "@/types/exercise";

const formatDate = (value: string | number | undefined) => {
  if (!value) return "";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

interface Props {
  item: Exercise;
}

export default function ExerciseCard({ item }: Props) {
  const tags = item.tags ?? [];
  const schemas = item.schemaImages?.length
    ? item.schemaImages
    : item.images || [];

  const [current, setCurrent] = useState(0);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!hover || schemas.length <= 1) return;

    const interval = window.setInterval(() => {
      setCurrent((prev) => (prev + 1) % schemas.length);
    }, 900);

    return () => window.clearInterval(interval);
  }, [hover, schemas.length]);

  return (
    <Link href={`/exercices/${item.id}`} className="exercise-card">
      <div
        className="exercise-thumb"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => {
          setHover(false);
          setCurrent(0);
        }}
      >
        {schemas.length > 0 ? (
          <img
            src={schemas[current]}
            alt={item.title || "Schéma"}
            className="exercise-image"
          />
        ) : (
          <div className="exercise-thumb-empty">Aucun schéma</div>
        )}

        {schemas.length > 0 && (
          <div className="exercise-photo-badge">📷 {schemas.length}</div>
        )}
      </div>

      <div className="exercise-card-body">
        <div className="exercise-card-head">
          <span className="latest-badge">{item.type || "Exercice"}</span>
          <span className="exercise-niveau">{item.level || "—"}</span>
        </div>

        <h3 className="exercise-title">
          {item.title || "Exercice sans titre"}
        </h3>

        <p className="exercise-category">
          {item.category || "Sans catégorie"}
          {item.theme && (
            <>
              {" · "}
              <span className="exercise-theme">{item.theme}</span>
            </>
          )}
        </p>

        {item.description && (
          <p className="exercise-description">{item.description}</p>
        )}

        {tags.length > 0 && (
          <div className="exercise-tags">
            {tags.map((tag) => (
              <span key={tag} className="exercise-tag">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="exercise-card-foot">
          <span className="exercise-date">{formatDate(item.createdAt)}</span>
        </div>
      </div>

      <style jsx>{`
        .exercise-card {
          display: block;
          overflow: hidden;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: #fff;
          color: inherit;
          text-decoration: none;
        }

        .exercise-thumb {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          background: #6b1a2c;
        }

        .exercise-image {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #6b1a2c;
          display: block;
        }

        .exercise-photo-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          background: #f4f4f4;
          color: #6b1a2c;
          border-radius: 999px;
          padding: 6px 9px;
          font-size: 0.8rem;
          font-weight: 900;
          z-index: 2;
        }

        .exercise-thumb-empty {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 900;
        }

        .exercise-card-body {
          padding: 14px;
        }

        .exercise-card-head {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 10px;
        }

        .latest-badge,
        .exercise-niveau {
          font-size: 0.75rem;
          font-weight: 900;
        }

        .exercise-title {
          margin: 0 0 6px;
          font-size: 1rem;
          font-weight: 900;
        }

        .exercise-category,
        .exercise-description,
        .exercise-date {
          color: #555;
          font-size: 0.85rem;
        }

        .exercise-description {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .exercise-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }

        .exercise-tag {
          font-size: 0.75rem;
          font-weight: 800;
          color: #6b1a2c;
        }

        .exercise-card-foot {
          margin-top: 12px;
        }
      `}</style>
    </Link>
  );
}