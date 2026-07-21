'use client';

import { type MouseEvent, useMemo } from 'react';
import styles from './ShotChartCourt.module.css';

export type ShotType = '2PTS' | '3PTS';

export type ShotZone = {
  id: string;
  number: number;
  label: string;
  shortLabel: string;
  type: ShotType;
  cx: number;
  cy: number;
  d: string;
};

// volontairement permissif : le composant reçoit directement tes StatA[]
// depuis PriseStatsPro sans imposer un type externe incompatible.
export type ShotDot = any;

type Props = {
  mode?: 'pick' | 'analysis';
  shotType?: ShotType | '';
  selectedZone?: string | null;
  actions?: ShotDot[];
  showLabels?: boolean;
  showStats?: boolean;
  showShots?: boolean;
  onSelectZone?: (zone: ShotZone, point?: { x: number; y: number }) => void;
  onShotClick?: (shot: ShotDot) => void;
  className?: string;
};

/**
 * Shot chart MyBasket — CALÉE SUR L'IMAGE ORIGINALE.
 *
 * Règle importante : l'image de fond et les zones SVG utilisent le même repère
 * 1048 x 664. Si la fenêtre rétrécit, le SVG et l'image se réduisent ensemble :
 * les zones restent donc exactement au même endroit sur le parquet.
 */
export const SHOT_CHART_VIEWBOX = { width: 1048, height: 664 } as const;

const ZONES: ShotZone[] = [
  // ===================== 2PTS : zones 1 à 9 =====================
  {
    number: 1,
    id: 'rim',
    label: 'Cercle / finition',
    shortLabel: 'Cercle',
    type: '2PTS',
    cx: 524,
    cy: 118,
    d: 'M407 0 H648 V190 C624 213 581 224 524 224 C468 224 428 213 407 190 Z',
  },
  {
    number: 2,
    id: 'paint',
    label: 'Raquette',
    shortLabel: 'Raquette',
    type: '2PTS',
    cx: 524,
    cy: 292,
    d: 'M407 190 C430 213 468 224 524 224 C581 224 624 213 648 190 L648 352 H407 Z',
  },
  {
    number: 3,
    id: 'mid-right-inside',
    label: 'Mid droite intérieur',
    shortLabel: 'Mid D int.',
    type: '2PTS',
    cx: 728,
    cy: 196,
    d: 'M648 0 H824 C831 92 843 175 863 247 C826 285 787 316 684 359 C676 289 662 229 648 190 Z',
  },
  {
    number: 4,
    id: 'mid-left-inside',
    label: 'Mid gauche intérieur',
    shortLabel: 'Mid G int.',
    type: '2PTS',
    cx: 320,
    cy: 196,
    d: 'M224 0 H407 V190 C394 229 376 289 364 359 C261 316 222 285 185 247 C205 175 217 92 224 0 Z',
  },
  {
    number: 5,
    id: 'mid-left-outside',
    label: 'Mid gauche extérieur',
    shortLabel: 'Mid G ext.',
    type: '2PTS',
    cx: 145,
    cy: 258,
    d: 'M107 0 H224 C217 92 205 175 185 247 C140 292 105 342 65 399 C31 350 10 290 0 230 V126 H107 Z',
  },
  {
    number: 6,
    id: 'short-left',
    label: 'Short corner / baseline gauche',
    shortLabel: 'Short G',
    type: '2PTS',
    cx: 322,
    cy: 430,
    d: 'M65 399 C105 342 140 292 185 247 C222 285 261 316 364 359 L407 352 L366 664 H0 V480 C21 452 43 424 65 399 Z',
  },
  {
    number: 7,
    id: 'mid-axis',
    label: 'Mid axe',
    shortLabel: 'Mid axe',
    type: '2PTS',
    cx: 524,
    cy: 520,
    d: 'M407 352 H648 L686 664 H366 Z',
  },
  {
    number: 8,
    id: 'short-right',
    label: 'Short corner / baseline droite',
    shortLabel: 'Short D',
    type: '2PTS',
    cx: 726,
    cy: 430,
    d: 'M648 352 L684 359 C787 316 826 285 863 247 C908 292 943 342 983 399 C1005 424 1027 452 1048 480 V664 H686 Z',
  },
  {
    number: 9,
    id: 'mid-right-outside',
    label: 'Mid droite extérieur',
    shortLabel: 'Mid D ext.',
    type: '2PTS',
    cx: 903,
    cy: 258,
    d: 'M824 0 H941 V126 H1048 V230 C1038 290 1017 350 983 399 C943 342 908 292 863 247 C843 175 831 92 824 0 Z',
  },

  // ===================== 3PTS : zones 10 à 16 =====================
  {
    number: 10,
    id: 'corner-right-top',
    label: 'Corner droit haut',
    shortLabel: 'Corner D haut',
    type: '3PTS',
    cx: 995,
    cy: 64,
    d: 'M941 0 H1048 V126 H941 Z',
  },
  {
    number: 11,
    id: 'wing-right-3',
    label: 'Aile droite 3PTS',
    shortLabel: 'Aile D 3',
    type: '3PTS',
    cx: 980,
    cy: 420,
    d: 'M941 126 H1048 V664 H686 L648 352 L684 359 C787 316 826 285 863 247 C843 175 831 92 824 0 H941 Z',
  },
  {
    number: 12,
    id: 'corner-right-bottom',
    label: 'Corner droit bas',
    shortLabel: 'Corner D bas',
    type: '3PTS',
    cx: 815,
    cy: 596,
    d: 'M686 664 L648 352 C707 414 760 513 840 664 Z',
  },
  {
    number: 13,
    id: 'top-three',
    label: 'Axe 3PTS',
    shortLabel: 'Axe 3',
    type: '3PTS',
    cx: 524,
    cy: 612,
    d: 'M366 664 L407 352 H648 L686 664 Z',
  },
  {
    number: 14,
    id: 'corner-left-bottom',
    label: 'Corner gauche bas',
    shortLabel: 'Corner G bas',
    type: '3PTS',
    cx: 233,
    cy: 596,
    d: 'M208 664 C288 513 341 414 407 352 L366 664 Z',
  },
  {
    number: 15,
    id: 'wing-left-3',
    label: 'Aile gauche 3PTS',
    shortLabel: 'Aile G 3',
    type: '3PTS',
    cx: 70,
    cy: 420,
    d: 'M0 126 H107 V0 H224 C217 92 205 175 185 247 C222 285 261 316 364 359 L407 352 L366 664 H0 Z',
  },
  {
    number: 16,
    id: 'corner-left-top',
    label: 'Corner gauche haut',
    shortLabel: 'Corner G haut',
    type: '3PTS',
    cx: 54,
    cy: 64,
    d: 'M0 0 H107 V126 H0 Z',
  },
];

export function zoneById(id?: string | null): ShotZone | undefined {
  if (!id) return undefined;
  return ZONES.find((zone) => zone.id === id || String(zone.number) === String(id));
}

export function resolveShotZone(action: {
  zone?: string | null;
  shot_zone_id?: string | null;
  courtX?: number | null;
  courtY?: number | null;
  court_x?: number | null;
  court_y?: number | null;
  shotType?: string | null;
  shot_type?: string | null;
}): ShotZone | undefined {
  const existing = zoneById(action.zone ?? action.shot_zone_id);
  if (existing) return existing;

  const rawX = action.courtX ?? action.court_x;
  const rawY = action.courtY ?? action.court_y;
  if (rawX == null || rawY == null) return undefined;

  const x = rawX * SHOT_CHART_VIEWBOX.width;
  const y = rawY * SHOT_CHART_VIEWBOX.height;
  const type = action.shotType ?? action.shot_type;
  const allowed = ZONES.filter((zone) => !type || type === 'LF' || zone.type === type);

  let best: ShotZone | undefined;
  let bestDist = Number.POSITIVE_INFINITY;

  allowed.forEach((zone) => {
    const dx = x - zone.cx;
    const dy = y - zone.cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      best = zone;
      bestDist = dist;
    }
  });

  return best;
}

function pct(made: number, attempts: number) {
  return attempts ? Math.round((made / attempts) * 100) : 0;
}

function getSvgPoint(event: MouseEvent<SVGPathElement>) {
  const svg = event.currentTarget.ownerSVGElement;
  if (!svg) return { x: 0.5, y: 0.5 };
  const rect = svg.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

export default function ShotChartCourt({
  mode = 'pick',
  shotType = '',
  selectedZone,
  actions = [],
  showLabels = false,
  showStats = true,
  showShots = true,
  onSelectZone,
  onShotClick,
  className,
}: Props) {
  const zones = useMemo(() => ZONES, []);
  const isPick = mode === 'pick';

  const shotActions = actions.filter((action) => {
    const actionType = action.actionType ?? action.action_type;
    const type = action.shotType ?? action.shot_type;
    return actionType === 'tir' && (type === '2PTS' || type === '3PTS');
  });

  const stats = new Map<string, { made: number; attempts: number }>();
  shotActions.forEach((action) => {
    const type = action.shotType ?? action.shot_type;
    const zone = resolveShotZone({
      zone: action.zone ?? action.shot_zone_id,
      courtX: action.courtX ?? action.court_x,
      courtY: action.courtY ?? action.court_y,
      shotType: type,
    });
    if (!zone) return;
    const row = stats.get(zone.id) ?? { made: 0, attempts: 0 };
    row.attempts += 1;
    if ((action.shotResult ?? action.shot_result) === 'made') row.made += 1;
    stats.set(zone.id, row);
  });

  const active = (zone: ShotZone) => mode === 'analysis' || !shotType || zone.type === shotType;

  return (
    <div className={`${styles.wrap} ${isPick ? styles.pick : styles.analysis} ${className ?? ''}`}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${SHOT_CHART_VIEWBOX.width} ${SHOT_CHART_VIEWBOX.height}`}
        preserveAspectRatio="none"
        role="group"
        aria-label="Shot chart MyBasket"
      >
        <image
          href="/shot-chart-parquet-clean.png"
          x="0"
          y="0"
          width={SHOT_CHART_VIEWBOX.width}
          height={SHOT_CHART_VIEWBOX.height}
          preserveAspectRatio="none"
          className={styles.bgImage}
        />

        {zones.map((zone) => {
          const enabled = active(zone);
          const selected = selectedZone === zone.id || selectedZone === String(zone.number);
          const row = stats.get(zone.id) ?? { made: 0, attempts: 0 };

          return (
            <g key={zone.id} className={styles.zoneGroup}>
              <path
                d={zone.d}
                className={`${styles.zone} ${enabled ? styles.active : styles.inactive} ${selected ? styles.selected : ''}`}
                onClick={(event) => {
                  if (!enabled) return;
                  onSelectZone?.(zone, getSvgPoint(event));
                }}
                aria-label={zone.label}
              />

              {showLabels && (
                <g className={styles.label}>
                  <circle cx={zone.cx} cy={zone.cy} r="22" />
                  <text x={zone.cx} y={zone.cy + 7}>{zone.number}</text>
                </g>
              )}

              {mode === 'analysis' && showStats && row.attempts > 0 && (
                <g className={styles.statLabel}>
                  <text x={zone.cx} y={zone.cy - 8}>{pct(row.made, row.attempts)}%</text>
                  <text x={zone.cx} y={zone.cy + 18}>{row.made} – {row.attempts}</text>
                </g>
              )}
            </g>
          );
        })}

        {showShots && shotActions.map((shot, index) => {
          const rawX = shot.courtX ?? shot.court_x;
          const rawY = shot.courtY ?? shot.court_y;
          const zone = resolveShotZone({
            zone: shot.zone ?? shot.shot_zone_id,
            courtX: rawX,
            courtY: rawY,
            shotType: shot.shotType ?? shot.shot_type,
          });
          const x = rawX != null ? rawX * SHOT_CHART_VIEWBOX.width : (zone?.cx ?? SHOT_CHART_VIEWBOX.width / 2);
          const y = rawY != null ? rawY * SHOT_CHART_VIEWBOX.height : (zone?.cy ?? SHOT_CHART_VIEWBOX.height / 2);
          const made = (shot.shotResult ?? shot.shot_result) === 'made';
          const key = String(shot.id ?? `${index}-${x}-${y}`);

          return (
            <circle
              key={key}
              cx={x}
              cy={y}
              r="8"
              className={`${styles.shotDot} ${made ? styles.made : styles.missed}`}
              onClick={() => onShotClick?.(shot)}
            />
          );
        })}
      </svg>
    </div>
  );
}

export { ZONES };
