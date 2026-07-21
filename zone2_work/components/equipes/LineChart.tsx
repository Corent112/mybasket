"use client";

type ChartPoint = {
  label?: string;
  date?: string;
  value?: number | string | null;
  points?: number | string | null;
  rebonds?: number | string | null;
  passes?: number | string | null;
  [key: string]: unknown;
};

type LineChartSerie = {
  key: string;
  label: string;
  color?: string;
};

type LineChartProps = {
  data?: ChartPoint[] | null;
  series?: LineChartSerie[];
};

const DEFAULT_SERIES: LineChartSerie[] = [
  { key: "points", color: "#f47b20", label: "Points" },
  { key: "rebonds", color: "#1f6fb2", label: "Rebonds" },
  { key: "passes", color: "#22a06b", label: "Passes" },
];

const FALLBACK_COLORS = ["#6b1a2c", "#d4a24c", "#1f6fb2", "#22a06b", "#f47b20"];

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getLabel(point: ChartPoint, index: number): string {
  return String(point.label ?? point.date ?? index + 1);
}

function normalizeSeries(data: ChartPoint[], explicitSeries?: LineChartSerie[]): LineChartSerie[] {
  if (explicitSeries?.length) {
    return explicitSeries.map((serie, index) => ({
      ...serie,
      color: serie.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    }));
  }

  const hasValue = data.some((point) => point.value !== undefined && point.value !== null);
  if (hasValue) {
    return [{ key: "value", label: "Points", color: "#6b1a2c" }];
  }

  return DEFAULT_SERIES;
}

export default function LineChart({ data = [], series }: LineChartProps) {
  const cleanData = Array.isArray(data) ? data : [];
  const cleanSeries = normalizeSeries(cleanData, series);

  const W = 520;
  const H = 230;
  const padL = 34;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const values = cleanData.flatMap((point) =>
    cleanSeries.map((serie) => safeNumber(point[serie.key]))
  );

  const maxVal = Math.max(5, ...values) * 1.12;
  const x = (index: number) =>
    padL + (cleanData.length <= 1 ? innerW / 2 : (innerW * index) / (cleanData.length - 1));
  const y = (value: number) => padT + innerH - (safeNumber(value) / maxVal) * innerH;
  const yTicks = 5;

  if (!cleanData.length) {
    return (
      <div className="lc-empty">
        Aucune donnée d'évolution pour le moment.
        <style jsx>{`
          .lc-empty {
            min-height: 180px;
            display: grid;
            place-items: center;
            border-radius: 18px;
            background: rgba(107, 26, 44, 0.05);
            color: #766b6f;
            font-size: 0.9rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="line-chart-wrap">
      <div className="legend">
        {cleanSeries.map((serie) => (
          <span key={serie.key}>
            <i style={{ background: serie.color }} />
            {serie.label}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Évolution statistiques joueur">
        {Array.from({ length: yTicks + 1 }).map((_, index) => {
          const value = (maxVal / yTicks) * index;
          const yy = y(value);

          return (
            <g key={index}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(107,26,44,.09)" strokeWidth={1} />
              <text x={padL - 8} y={yy + 3} textAnchor="end" fontSize={9} fill="#7a7174">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        {cleanData.map((point, index) => (
          <text key={`${getLabel(point, index)}-${index}`} x={x(index)} y={H - 9} textAnchor="middle" fontSize={9} fill="#7a7174">
            {getLabel(point, index)}
          </text>
        ))}

        {cleanSeries.map((serie) => {
          const path = cleanData
            .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(safeNumber(point[serie.key]))}`)
            .join(" ");

          return (
            <g key={serie.key}>
              <path d={path} fill="none" stroke={serie.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

              {cleanData.map((point, index) => {
                const cy = y(safeNumber(point[serie.key]));
                const cx = x(index);

                return (
                  <circle
                    key={`${serie.key}-${index}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={serie.color}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      <style jsx>{`
        .line-chart-wrap {
          width: 100%;
        }

        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 1rem;
          margin-bottom: 0.5rem;
        }

        .legend span {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          color: #4a4144;
          font-size: 0.8rem;
          font-weight: 800;
        }

        .legend i {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          display: inline-block;
        }
      `}</style>
    </div>
  );
}
