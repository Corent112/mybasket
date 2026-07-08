'use client';

/**
 * ShotChart — carte de tir par zones (type Hudl / Synergy), réutilisable.
 * -------------------------------------------------------------------------
 * Une SEULE source de vérité pour le découpage des zones (SHOT_ZONES), le
 * rendu du terrain (polygones + libellés), la coloration par adresse, et les
 * deux modes :
 *   - mode="pick"     : codage live. Zones cliquables filtrées par shotType
 *                       (2PTS/3PTS). Renvoie zone + court_x/court_y (centroïde).
 *   - mode="analysis" : fiche joueur / équipe. Chaque zone affiche %, made/att,
 *                       points générés, pts/tir. Clic → onZoneClick(zoneId).
 *
 * Terrain demi-court, panier EN HAUT, repère 0..100 (x: gauche→droite,
 * y: 0 au panier → 100 loin). Cohérent avec court_x/court_y normalisés 0..1
 * du wizard : on multiplie par 100 pour se placer dans le même repère.
 *
 * Ce composant ne touche à AUCUNE donnée : il lit des tirs et émet des events.
 */

import { useMemo, useState } from 'react';

/* ============================ Découpage des zones ============================ */
export type ShotZoneType = '2PTS' | '3PTS';
export type ShotZone = {
  id: string;
  label: string;
  shortLabel: string;
  type: ShotZoneType;
  polygon: [number, number][]; // points en repère 0..100 (x,y)
  cx: number;                  // centroïde x (0..100)
  cy: number;                  // centroïde y (0..100)
};

// Repère : 0,0 = coin haut-gauche ; panier vers le haut (y faible = près du panier).
export const SHOT_ZONES: ShotZone[] = [
  // --- 2 points ---
  { id: 'rim', label: 'Cercle', shortLabel: 'Cercle', type: '2PTS',
    polygon: [[38, 4], [62, 4], [62, 20], [38, 20]], cx: 50, cy: 13 },
  { id: 'paint', label: 'Raquette', shortLabel: 'Raquette', type: '2PTS',
    polygon: [[38, 20], [62, 20], [62, 40], [38, 40]], cx: 50, cy: 31 },
  { id: 'mid_left', label: 'Mi-distance gauche', shortLabel: 'Mi G', type: '2PTS',
    polygon: [[8, 8], [38, 12], [38, 46], [10, 52]], cx: 24, cy: 32 },
  { id: 'mid_axis', label: 'Mi-distance axe', shortLabel: 'Mi axe', type: '2PTS',
    polygon: [[38, 40], [62, 40], [64, 60], [36, 60]], cx: 50, cy: 50 },
  { id: 'mid_right', label: 'Mi-distance droite', shortLabel: 'Mi D', type: '2PTS',
    polygon: [[62, 12], [92, 8], [90, 52], [62, 46]], cx: 76, cy: 32 },
  // --- 3 points ---
  { id: 'corner_left', label: 'Corner gauche', shortLabel: 'Corner G', type: '3PTS',
    polygon: [[0, 6], [8, 8], [10, 52], [0, 54]], cx: 4, cy: 30 },
  { id: 'wing_left', label: 'Aile gauche', shortLabel: 'Aile G', type: '3PTS',
    polygon: [[0, 54], [10, 52], [30, 74], [8, 88]], cx: 12, cy: 68 },
  { id: 'top_three', label: '3PTS axe', shortLabel: 'Axe 3', type: '3PTS',
    polygon: [[30, 74], [36, 60], [64, 60], [70, 74], [50, 96]], cx: 50, cy: 76 },
  { id: 'wing_right', label: 'Aile droite', shortLabel: 'Aile D', type: '3PTS',
    polygon: [[70, 74], [90, 52], [100, 54], [100, 88], [92, 88]], cx: 88, cy: 68 },
  { id: 'corner_right', label: 'Corner droite', shortLabel: 'Corner D', type: '3PTS',
    polygon: [[92, 8], [100, 6], [100, 54], [90, 52]], cx: 96, cy: 30 },
];

export const zoneById = (id: string | null | undefined): ShotZone | undefined =>
  id ? SHOT_ZONES.find((z) => z.id === id) : undefined;

/* ============================ Couleur par adresse ============================ */
export function zoneTier(pct: number, att: number): 'elite' | 'good' | 'avg' | 'low' | 'none' {
  if (!att) return 'none';
  if (pct >= 60) return 'elite';
  if (pct >= 45) return 'good';
  if (pct >= 35) return 'avg';
  return 'low';
}
const TIER_FILL: Record<string, string> = {
  elite: 'rgba(38,142,84,0.62)',
  good: 'rgba(96,168,74,0.5)',
  avg: 'rgba(212,162,76,0.5)',
  low: 'rgba(192,57,43,0.5)',
  none: 'rgba(255,255,255,0.05)',
};

/* ============================ Types de tir en entrée ============================ */
// Forme minimale attendue d'un tir (compatible match_actions ET StatA local).
export type ShotLike = {
  shot_type?: string | null; shotType?: string | null;
  shot_result?: string | null; shotResult?: string | null;
  shot_zone_id?: string | null; zone?: string | null;
  court_x?: number | null; courtX?: number | null;
  court_y?: number | null; courtY?: number | null;
  ft_made?: number | null; ftMade?: number | null;
};

const sType = (s: ShotLike) => (s.shot_type ?? s.shotType ?? '') as string;
const sRes = (s: ShotLike) => (s.shot_result ?? s.shotResult ?? '') as string;
const sZone = (s: ShotLike) => (s.shot_zone_id ?? s.zone ?? '') as string;
const sX = (s: ShotLike) => (s.court_x ?? s.courtX ?? null);
const sY = (s: ShotLike) => (s.court_y ?? s.courtY ?? null);

// Rattache un tir à une zone : d'abord par id stocké, sinon par géométrie.
export function resolveShotZone(s: ShotLike): string | null {
  const stored = sZone(s);
  if (stored && zoneById(stored)) return stored;
  if (sType(s) === 'LF') return null;
  const x = sX(s), y = sY(s);
  if (x == null || y == null) return null;
  // court_x/court_y normalisés 0..1 → 0..100
  const px = (x as number) * (x as number > 1 ? 1 : 100);
  const py = (y as number) * (y as number > 1 ? 1 : 100);
  return pointZone(px, py, sType(s) === '3PTS' ? '3PTS' : sType(s) === '2PTS' ? '2PTS' : null);
}

// Point → zone (test polygone), optionnellement contraint au type.
export function pointZone(px: number, py: number, type: ShotZoneType | null): string | null {
  const cands = SHOT_ZONES.filter((z) => (type ? z.type === type : true));
  for (const z of cands) if (inPoly(px, py, z.polygon)) return z.id;
  // fallback : zone la plus proche du centroïde
  let best: string | null = null, bd = Infinity;
  for (const z of cands) { const d = (z.cx - px) ** 2 + (z.cy - py) ** 2; if (d < bd) { bd = d; best = z.id; } }
  return best;
}

function inPoly(x: number, y: number, poly: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) c = !c;
  }
  return c;
}

/* ============================ Agrégats par zone ============================ */
export type ZoneAgg = { made: number; att: number; pct: number; pts: number; ppa: number; tier: string };

export function aggregateZones(shots: ShotLike[]): Record<string, ZoneAgg> {
  const out: Record<string, ZoneAgg> = {};
  for (const z of SHOT_ZONES) out[z.id] = { made: 0, att: 0, pct: 0, pts: 0, ppa: 0, tier: 'none' };
  for (const s of shots) {
    if (sType(s) === 'LF') continue;
    const zid = resolveShotZone(s);
    if (!zid || !out[zid]) continue;
    const made = sRes(s) === 'made';
    out[zid].att += 1;
    if (made) { out[zid].made += 1; out[zid].pts += sType(s) === '3PTS' ? 3 : 2; }
  }
  for (const z of SHOT_ZONES) {
    const a = out[z.id];
    a.pct = a.att ? Math.round((a.made / a.att) * 100) : 0;
    a.ppa = a.att ? Math.round((a.pts / a.att) * 100) / 100 : 0;
    a.tier = zoneTier(a.pct, a.att);
  }
  return out;
}

/* ============================ Composant ============================ */
type CommonProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

type PickProps = CommonProps & {
  mode: 'pick';
  shotType: '2PTS' | '3PTS';          // filtre les zones actives
  selectedZone?: string | null;
  onPick: (zone: ShotZone) => void;    // renvoie la zone choisie (id/label/centroïde)
};

type AnalysisProps = CommonProps & {
  mode: 'analysis';
  shots: ShotLike[];
  showPoints?: boolean;                // affiche pts + pts/tir
  onZoneClick?: (zoneId: string) => void;
};

export type ShotChartProps = PickProps | AnalysisProps;

export default function ShotChart(props: ShotChartProps) {
  const size = props.size ?? 'md';
  const [hover, setHover] = useState<string | null>(null);

  const agg = useMemo(
    () => (props.mode === 'analysis' ? aggregateZones(props.shots) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.mode, props.mode === 'analysis' ? props.shots : null]
  );

  return (
    <div className={`sc sc-${size} ${props.className ?? ''}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="sc-svg">
        {/* fond terrain */}
        <rect x="0" y="0" width="100" height="100" rx="2" className="sc-floor" />
        {/* panier + raquette repères (décoratifs) */}
        <rect x="40" y="0" width="20" height="30" className="sc-key" />
        <circle cx="50" cy="6" r="2.4" className="sc-hoop" />

        {SHOT_ZONES.map((z) => {
          const pts = z.polygon.map((p) => p.join(',')).join(' ');
          if (props.mode === 'pick') {
            const active = z.type === props.shotType;
            const sel = props.selectedZone === z.id;
            return (
              <polygon
                key={z.id}
                points={pts}
                className={`sc-zone ${active ? 'act' : 'off'} ${sel ? 'sel' : ''} ${hover === z.id && active ? 'hov' : ''}`}
                onMouseEnter={() => active && setHover(z.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => active && props.onPick(z)}
              />
            );
          }
          const a = agg![z.id];
          return (
            <polygon
              key={z.id}
              points={pts}
              className={`sc-zone an ${a.att ? 'has' : ''} ${hover === z.id ? 'hov' : ''}`}
              style={{ fill: TIER_FILL[a.tier] }}
              onMouseEnter={() => setHover(z.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => a.att && props.mode === 'analysis' && props.onZoneClick?.(z.id)}
            />
          );
        })}

        {/* libellés / stats par zone */}
        {SHOT_ZONES.map((z) => {
          if (props.mode === 'pick') {
            const active = z.type === props.shotType;
            return (
              <text key={z.id} x={z.cx} y={z.cy} className={`sc-lbl ${active ? '' : 'dim'}`} textAnchor="middle">
                {z.shortLabel}
              </text>
            );
          }
          const a = agg![z.id];
          return (
            <g key={z.id} className="sc-stat" style={{ pointerEvents: 'none' }}>
              {a.att ? (
                <>
                  <text x={z.cx} y={z.cy - 2} className="sc-pct" textAnchor="middle">{a.pct}%</text>
                  <text x={z.cx} y={z.cy + 4} className="sc-frac" textAnchor="middle">{a.made}/{a.att}</text>
                  {props.showPoints && (
                    <text x={z.cx} y={z.cy + 9} className="sc-pts" textAnchor="middle">{a.pts} pts · {a.ppa.toFixed(2)}</text>
                  )}
                </>
              ) : (
                <text x={z.cx} y={z.cy + 1.5} className="sc-frac dim" textAnchor="middle">{z.shortLabel}</text>
              )}
            </g>
          );
        })}
      </svg>

      <style>{`
        .sc { --bord:#6b1a2c; --gold:#d4a24c; width: 100%; }
        .sc-sm { max-width: 300px; }
        .sc-md { max-width: 460px; }
        .sc-lg { max-width: 680px; }
        .sc-svg { width: 100%; aspect-ratio: 1 / 1; display: block; }
        .sc-floor { fill: #12223a; }
        .sc-key { fill: rgba(212,162,76,0.10); stroke: rgba(255,255,255,0.18); stroke-width: 0.4; }
        .sc-hoop { fill: none; stroke: var(--gold); stroke-width: 0.6; }
        .sc-zone { stroke: rgba(255,255,255,0.35); stroke-width: 0.4; transition: fill .12s, opacity .12s; }
        .sc-zone.act { fill: rgba(255,255,255,0.06); cursor: pointer; }
        .sc-zone.act.hov, .sc-zone.hov { fill: rgba(212,162,76,0.22); }
        .sc-zone.sel { fill: rgba(212,162,76,0.5); stroke: var(--gold); stroke-width: 0.9; }
        .sc-zone.off { fill: rgba(255,255,255,0.03); opacity: 0.25; pointer-events: none; }
        .sc-zone.an.has { cursor: pointer; }
        .sc-lbl { fill: #dfe6f5; font-size: 3.1px; font-weight: 700; }
        .sc-lbl.dim { fill: rgba(223,230,245,0.35); }
        .sc-pct { fill: #fff; font-size: 4.4px; font-weight: 900; }
        .sc-frac { fill: #eaf0ff; font-size: 3.1px; font-weight: 700; }
        .sc-frac.dim { fill: rgba(223,230,245,0.4); font-weight: 600; }
        .sc-pts { fill: var(--gold); font-size: 2.7px; font-weight: 800; }
      `}</style>
    </div>
  );
}
