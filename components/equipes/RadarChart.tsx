// components/equipe/RadarChart.tsx
"use client";

import type { RadarCompetences } from "../../types/player";

const AXES: { key: keyof RadarCompetences; label: string }[] = [
  { key: "tir", label: "Tir" },
  { key: "dribble", label: "Dribble" },
  { key: "passe", label: "Passe" },
  { key: "lectureJeu", label: "Lecture de jeu" },
  { key: "defense", label: "Défense" },
  { key: "rebond", label: "Rebond" },
  { key: "mental", label: "Mental" },
  { key: "athletisme", label: "Athlét." },
];

export default function RadarChart({ data }: { data: RadarCompetences }) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const R = 95;
  const max = 10;
  const n = AXES.length;

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => ({
    x: cx + Math.cos(angle(i)) * r,
    y: cy + Math.sin(angle(i)) * r,
  });

  // anneaux de la grille
  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    AXES.map((_, i) => {
      const p = pt(i, R * f);
      return `${p.x},${p.y}`;
    }).join(" ")
  );

  // polygone des valeurs
  const valuePoly = AXES.map((a, i) => {
    const v = Math.max(0, Math.min(max, data[a.key] ?? 0));
    const p = pt(i, (R * v) / max);
    return `${p.x},${p.y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 300, margin: "0 auto", display: "block" }}>
      {rings.map((r, i) => (
        <polygon key={i} points={r} fill="none" stroke="rgba(255,255,255,.10)" strokeWidth={1} />
      ))}
      {AXES.map((_, i) => {
        const p = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,.10)" strokeWidth={1} />;
      })}
      <polygon points={valuePoly} fill="rgba(244,123,32,.30)" stroke="#F47B20" strokeWidth={2} strokeLinejoin="round" />
      {AXES.map((a, i) => {
        const v = data[a.key] ?? 0;
        const p = pt(i, (R * Math.max(0, Math.min(max, v))) / max);
        return <circle key={i} cx={p.x} cy={p.y} r={3.2} fill="#F47B20" stroke="#0F0F14" strokeWidth={1.5} />;
      })}
      {AXES.map((a, i) => {
        const p = pt(i, R + 22);
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            fontSize={10.5}
            fontWeight={600}
            fill="#C7C7D1"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {a.label}
            <tspan x={p.x} dy={12} fill="#F47B20" fontWeight={800} fontSize={11}>
              {data[a.key] ?? 0}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
