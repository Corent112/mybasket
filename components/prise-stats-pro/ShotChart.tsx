/**
 * ShotChart — MyBasket
 * ---------------------------------------------------------------------------
 * Découpage OFFICIEL en 16 zones, calqué au pixel sur l'image de référence
 * (public/shot-chart-mybasket.png). Les contours ont été extraits directement
 * des traits noirs de l'image : chaque zone est délimitée exactement par ces
 * traits, ni plus ni moins.
 *
 * Repère : viewBox "0 0 1577 997" = dimensions natives de l'image.
 * L'image sert de fond, le calque de zones est dans le MÊME viewBox : il suit
 * donc l'image à n'importe quelle taille (le SVG scale, pas de recalage).
 *
 * IDs STABLES (z1..z16) : le label peut être renommé sans casser les stats.
 *   2PTS : z1..z9      3PTS : z10..z16
 *
 * cx/cy restent exprimés en repère 0..100 (comme avant) : `zonePick` du moteur
 * fait `zone.cx / 100` pour stocker courtX/courtY. NE PAS changer.
 * px/py sont les centroïdes en pixels image (rendu des libellés uniquement).
 */

import { type MouseEvent as ReactMouseEvent, useMemo, useRef, useState } from 'react';

/* ============================ Découpage des zones ============================ */
import { SHOT_ZONES, COURT_W, COURT_H, type ShotZone, type ShotZoneType } from "@/lib/shot-chart-zones";
export { SHOT_ZONES, COURT_W, COURT_H } from "@/lib/shot-chart-zones";
export type { ShotZone, ShotZoneType } from "@/lib/shot-chart-zones";

export const zoneById = (id: string | null | undefined): ShotZone | undefined =>
  id ? SHOT_ZONES.find((z) => z.id === id) : undefined;

/** Anciens ids (découpage 10 zones) → nouveaux ids. Les stats déjà enregistrées
 *  restent lisibles : on ne renomme jamais un id, on l'aliase. */
export const LEGACY_ZONE_ALIASES: Record<string, string> = {
  rim: 'z1', paint: 'z2',
  mid_left: 'z4', mid_right: 'z3', mid_axis: 'z7',
  corner_left: 'z16', corner_right: 'z10',
  wing_left: 'z15', wing_right: 'z11',
  top_three: 'z13',
};

/* ============================ Couleur par adresse ============================ */
export function zoneTier(pct: number, att: number): 'elite' | 'good' | 'avg' | 'low' | 'none' {
  if (!att) return 'none';
  if (pct >= 60) return 'elite';
  if (pct >= 45) return 'good';
  if (pct >= 35) return 'avg';
  return 'low';
}

const TIER_FILL: Record<string, string> = {
  elite: 'rgba(54,179,126,0.62)',
  good: 'rgba(120,190,90,0.52)',
  avg: 'rgba(217,164,65,0.52)',
  low: 'rgba(229,72,77,0.50)',
  none: 'rgba(255,255,255,0.05)',
};

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

// Rattache un tir à une zone : id stocké → alias legacy → géométrie.
export function resolveShotZone(s: ShotLike): string | null {
  const stored = sZone(s);
  if (stored && zoneById(stored)) return stored;
  if (stored && LEGACY_ZONE_ALIASES[stored]) return LEGACY_ZONE_ALIASES[stored];
  if (sType(s) === 'LF') return null;
  const x = sX(s), y = sY(s);
  if (x == null || y == null) return null;
  const px = (x as number) * ((x as number) > 1 ? 1 : 100);
  const py = (y as number) * ((y as number) > 1 ? 1 : 100);
  return pointZone(px, py, sType(s) === '3PTS' ? '3PTS' : sType(s) === '2PTS' ? '2PTS' : null);
}

// Point (0..100) → zone, optionnellement contraint au type.
export function pointZone(px: number, py: number, type: ShotZoneType | null): string | null {
  const cands = SHOT_ZONES.filter((z) => (type ? z.type === type : true));
  for (const z of cands) if (inPoly(px, py, z.polygon)) return z.id;
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
    out[zid].att++;
    if (sRes(s) === 'made') {
      out[zid].made++;
      out[zid].pts += sType(s) === '3PTS' ? 3 : 2;
    }
  }
  for (const z of SHOT_ZONES) {
    const a = out[z.id];
    a.pct = a.att ? Math.round((a.made / a.att) * 100) : 0;
    a.ppa = a.att ? a.pts / a.att : 0;
    a.tier = zoneTier(a.pct, a.att);
  }
  return out;
}

/* ============================ Composant ============================ */
type CommonProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Image de fond. À déposer dans /public. */
  imageSrc?: string;
};

type PickProps = CommonProps & {
  mode: 'pick';
  shotType: '2PTS' | '3PTS';           // filtre les zones actives
  selectedZone?: string | null;
  /** true = aucune zone cliquable (avant le choix du tir, ou lancer franc). */
  locked?: boolean;
  /** Résultat du tir en cours : décide la couleur du point posé (vert/rouge). */
  shotResult?: 'made' | 'missed' | null;
  /** Point du tir en cours (repère 0..100), affiché en gros. */
  pendingPoint?: { x: number; y: number } | null;
  /** Tirs déjà codés : affichés en petits points verts/rouges. */
  shots?: ShotLike[];
  /** false = aucun libellé de zone affiché pendant le codage. */
  showLabels?: boolean;
  /** Limite le clic aux zones compatibles avec le type de tir déjà choisi. */
  allowedZoneIds?: string[];
  /** Reçoit la zone ET le point exact cliqué (repère 0..100). */
  onPick: (zone: ShotZone, point: { x: number; y: number }) => void;
};

type AnalysisProps = CommonProps & {
  mode: 'analysis';
  shots: ShotLike[];
  showPoints?: boolean;
  /** false = aucune coloration ni %/fraction par zone (chart "nue" pour le live). */
  showStats?: boolean;
  /** false = aucun libellé de zone (Aile G, 3PTS axe…). */
  showLabels?: boolean;
  /** Affiche chaque tir comme un point vert/rouge à sa position exacte. */
  showDots?: boolean;
  onZoneClick?: (zoneId: string) => void;
  onShotClick?: (shot: ShotLike) => void;
};

export type ShotChartProps = PickProps | AnalysisProps;

export default function ShotChart(props: ShotChartProps) {
  const size = props.size ?? 'md';
  const imageSrc = props.imageSrc ?? '/shot-chart-clean.webp';
  const [hover, setHover] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const agg = useMemo(
    () => (props.mode === 'analysis' ? aggregateZones(props.shots) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.mode, props.mode === 'analysis' ? props.shots : null]
  );

  const locked = props.mode === 'pick' && props.locked === true;

  // Clic écran → repère du viewBox → 0..100. Passe par la matrice SVG, donc
  // reste exact quelle que soit la taille d'affichage de l'image (réduction incluse).
  const clickToPoint = (evt: ReactMouseEvent<SVGPathElement>): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg || !svg.createSVGPoint || !svg.getScreenCTM) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: (p.x / COURT_W) * 100, y: (p.y / COURT_H) * 100 };
  };

  // Points des tirs déjà codés (vert = réussi, rouge = manqué).
  const dotShots: ShotLike[] =
    props.mode === 'analysis' ? (props.showDots ? props.shots : []) : (props.shots ?? []);

  return (
    <div className={`sc sc-${size} ${props.className ?? ''}`}>
      <svg ref={svgRef} viewBox={`0 0 ${COURT_W} ${COURT_H}`} preserveAspectRatio="xMidYMid meet" className="sc-svg">
        {/* Fond : l'image de référence, dans le même repère que les zones */}
        <image href={imageSrc} x={0} y={0} width={COURT_W} height={COURT_H} preserveAspectRatio="none" />

        {/* Calque des zones : contours calqués sur les traits noirs */}
        {SHOT_ZONES.map((z) => {
          if (props.mode === 'pick') {
            const active = !locked && z.type === props.shotType &&
              (!props.allowedZoneIds?.length || props.allowedZoneIds.includes(z.id));
            const sel = props.selectedZone === z.id;
            return (
              <path
                key={z.id}
                d={z.d}
                className={`sc-zone ${active ? 'act' : 'off'} ${sel ? 'sel' : ''} ${hover === z.id && active ? 'hov' : ''}`}
                onMouseEnter={() => active && setHover(z.id)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  if (!active) return;
                  const pt = clickToPoint(e);
                  // Repli : centre de la zone si la matrice SVG est indisponible.
                  props.onPick(z, pt ?? { x: z.cx, y: z.cy });
                }}
              />
            );
          }
          const a = agg![z.id];
          const stats = props.mode === 'analysis' ? props.showStats !== false : true;
          return (
            <path
              key={z.id}
              d={z.d}
              className={`sc-zone an ${stats && a.att ? 'has' : ''} ${hover === z.id ? 'hov' : ''}`}
              style={{ fill: stats ? TIER_FILL[a.tier] : 'transparent' }}
              onMouseEnter={() => setHover(z.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => stats && a.att && props.mode === 'analysis' && props.onZoneClick?.(z.id)}
            />
          );
        })}

        {/* Libellés / stats */}
        {SHOT_ZONES.map((z) => {
          if (props.mode === 'pick') {
            if (props.showLabels === false) return null;
            const active = !locked && z.type === props.shotType &&
              (!props.allowedZoneIds?.length || props.allowedZoneIds.includes(z.id));
            return (
              <text key={z.id} x={z.px} y={z.py} className={`sc-lbl ${active ? '' : 'dim'}`} textAnchor="middle">
                {z.shortLabel}
              </text>
            );
          }
          const a = agg![z.id];
          const stats = props.showStats !== false;
          const labels = props.showLabels !== false;
          if (!stats && !labels) return null;
          return (
            <g key={z.id} className="sc-stat" style={{ pointerEvents: 'none' }}>
              {stats && a.att ? (
                <>
                  <text x={z.px} y={z.py - 8} className="sc-pct" textAnchor="middle">{a.pct}%</text>
                  <text x={z.px} y={z.py + 26} className="sc-frac" textAnchor="middle">{a.made}/{a.att}</text>
                  {props.showPoints && (
                    <text x={z.px} y={z.py + 54} className="sc-pts" textAnchor="middle">{a.pts} pts · {a.ppa.toFixed(2)}</text>
                  )}
                </>
              ) : (
                labels && <text x={z.px} y={z.py + 8} className="sc-frac dim" textAnchor="middle">{z.shortLabel}</text>
              )}
            </g>
          );
        })}

        {/* ===== Points de tir : vert = réussi, rouge = manqué =====
            Coordonnées stockées en 0..100 → converties dans le repère de l'image,
            donc le point reste collé à l'endroit cliqué à n'importe quelle taille. */}
        <g className="sc-dots" style={{ pointerEvents: props.mode === 'analysis' && props.onShotClick ? 'auto' : 'none' }}>
          {dotShots.map((s, i) => {
            if (sType(s) === 'LF') return null;
            const x = sX(s), y = sY(s);
            if (x == null || y == null) return null;
            const px = (x as number) * ((x as number) > 1 ? 1 : 100);
            const py = (y as number) * ((y as number) > 1 ? 1 : 100);
            const made = sRes(s) === 'made';
            return (
              <circle
                key={i}
                cx={(px / 100) * COURT_W}
                cy={(py / 100) * COURT_H}
                r={9}
                className={`sc-dot ${made ? 'made' : 'miss'}`}
                style={{ cursor: props.mode === 'analysis' && props.onShotClick ? 'pointer' : 'default' }}
                onClick={() => props.mode === 'analysis' && props.onShotClick?.(s)}
              />
            );
          })}

          {/* Tir en cours : point plus gros, coloré par le résultat déjà saisi */}
          {props.mode === 'pick' && props.pendingPoint && (
            <circle
              cx={(props.pendingPoint.x / 100) * COURT_W}
              cy={(props.pendingPoint.y / 100) * COURT_H}
              r={15}
              className={`sc-dot cur ${props.shotResult === 'made' ? 'made' : props.shotResult === 'missed' ? 'miss' : ''}`}
            />
          )}
        </g>
      </svg>

      <style>{`
        .sc { --gold:#d4a24c; width: 100%; }
        .sc-sm { max-width: 340px; }
        .sc-md { max-width: 520px; }
        .sc-lg { max-width: none; }
        .sc-svg { width: 100%; aspect-ratio: ${COURT_W} / ${COURT_H}; display: block; }
        .sc-zone { fill: transparent; stroke: none; transition: fill .12s, opacity .12s; }
        .sc-zone.act { fill: rgba(255,255,255,0.04); cursor: pointer; }
        .sc-zone.act.hov, .sc-zone.hov { fill: rgba(212,162,76,0.34); }
        .sc-zone.sel { fill: rgba(212,162,76,0.60); }
        .sc-zone.off { fill: rgba(10,14,26,0.55); pointer-events: none; }
        .sc-zone.an.has { cursor: pointer; }
        .sc-lbl { fill: #1b1b1b; font-size: 30px; font-weight: 800; paint-order: stroke; stroke: rgba(255,255,255,.75); stroke-width: 4px; pointer-events: none; }
        .sc-lbl.dim { fill: rgba(240,240,240,.55); stroke: none; }
        .sc-pct { fill: #fff; font-size: 44px; font-weight: 900; paint-order: stroke; stroke: rgba(0,0,0,.45); stroke-width: 5px; }
        .sc-frac { fill: #f2f6ff; font-size: 30px; font-weight: 700; paint-order: stroke; stroke: rgba(0,0,0,.40); stroke-width: 4px; }
        .sc-frac.dim { fill: #2a2a2a; stroke: rgba(255,255,255,.6); font-weight: 700; }
        .sc-pts { fill: var(--gold); font-size: 26px; font-weight: 800; paint-order: stroke; stroke: rgba(0,0,0,.45); stroke-width: 4px; }

        /* Points de tir posés au clic */
        .sc-dot { stroke: rgba(0,0,0,.55); stroke-width: 2.5px; }
        .sc-dot.made { fill: #36b37e; }
        .sc-dot.miss { fill: #e5484d; }
        .sc-dot.cur { stroke: #fff; stroke-width: 4px; fill: #d9a441; }
        .sc-dot.cur.made { fill: #36b37e; }
        .sc-dot.cur.miss { fill: #e5484d; }
      `}</style>
    </div>
  );
}