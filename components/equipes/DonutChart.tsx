// components/equipe/DonutChart.tsx
"use client";

/** Donut "temps de jeu moyen" : pct au centre, anneau orange/bleu. */
export default function DonutChart({
  pct,
  centerTop,
  centerBottom,
}: {
  pct: number;
  centerTop: string;
  centerBottom: string;
}) {
  const size = 170;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * c;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1F6FB2" strokeWidth={stroke} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#F47B20"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c - filled}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={30} fontWeight={800} fill="#fff">
        {pct}%
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={10} fill="#9A9AA6">
        {centerTop}
      </text>
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize={10} fill="#9A9AA6">
        {centerBottom}
      </text>
    </svg>
  );
}
