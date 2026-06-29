// components/equipe/Sparkline.tsx
"use client";

export function Sparkline({ values, color = "#22A06B" }: { values: number[]; color?: string }) {
  const W = 120;
  const H = 32;
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (values.length <= 1 ? 0 : (W * i) / (values.length - 1));
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 6);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: "block" }}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={1.6} fill={color} />
      ))}
    </svg>
  );
}

/** Maillot stylisé (carte de droite du hero). */
export function Jersey({ name, num }: { name: string; num: number | null }) {
  return (
    <svg viewBox="0 0 160 170" width="150" style={{ display: "block", margin: "0 auto" }}>
      <defs>
        <linearGradient id="jersey" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F4F4F6" />
          <stop offset="1" stopColor="#D9D9DE" />
        </linearGradient>
      </defs>
      <path
        d="M52 14 L34 26 L20 46 L34 60 L44 52 L44 150 Q44 158 52 158 L108 158 Q116 158 116 150 L116 52 L126 60 L140 46 L126 26 L108 14 Q96 30 80 30 Q64 30 52 14 Z"
        fill="url(#jersey)"
        stroke="#0F0F14"
        strokeWidth={2}
      />
      <text x="80" y="50" textAnchor="middle" fontSize="9" fontWeight={700} fill="#0F0F14" letterSpacing="1">
        {(name || "").toUpperCase()}
      </text>
      <text x="80" y="120" textAnchor="middle" fontSize="52" fontWeight={900} fill="#0F0F14" fontFamily="Oswald, sans-serif">
        {num ?? ""}
      </text>
    </svg>
  );
}
