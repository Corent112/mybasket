/**
 * lib/import/plaquette-converter.ts
 * ---------------------------------------------------------------------------
 * Conversion « schémas détectés » → DONNÉES PLAQUETTE NATIVES.
 *
 * Le résultat doit être STRICTEMENT identique à ce que produirait la Plaquette
 * si l'utilisateur avait reproduit le dessin à la main :
 *   - mêmes champs sur Player / Obj / Line ;
 *   - mêmes valeurs d'action (cut, dribble, screen, pass, shoot, giveball,
 *     freedraw) et de kind (ball, cone, triangle, square, circle, text,
 *     handoff) ;
 *   - mêmes coordonnées canoniques (y ∈ [0, 0.5] en demi-terrain).
 *
 * Aucune re-normalisation ici : les coordonnées arrivent déjà en canonique
 * depuis lib/import/court-geometry.ts. On se contente de borner.
 *
 * Structure produite (conforme à buildPlaquetteResult de la Plaquette) :
 * UN schéma = UN schemaGroupId + N phases → N entrées schemaImages /
 * schemaDataList partageant le même tableau `phases`.
 */

import type {
  AiExerciseDiagram,
  AiExerciseImport,
  AiPoint,
  PlaquettePhase,
  PlaquetteSchemaData,
} from "./types";
import {
  FULL_COURT_BOTTOM,
  FULL_COURT_LEFT,
  FULL_COURT_RIGHT,
  FULL_COURT_TOP,
  HALF_COURT_BOTTOM,
  HALF_COURT_LEFT,
  HALF_COURT_RIGHT,
  HALF_COURT_TOP,
  strokeCourtLines,
} from "./court-geometry";

export type PlaquetteImportResult = {
  schemaGroupId: string;
  courtType: "half" | "full";
  phases: PlaquettePhase[];
  entries: PlaquetteSchemaData[];
};

const uid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `mb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const clampX = (value: number) => Math.min(0.985, Math.max(0.015, Number.isFinite(value) ? value : 0.5));

const clampY = (value: number, courtType: "half" | "full") => {
  const max = courtType === "half" ? 0.495 : 0.985;
  const fallback = courtType === "half" ? 0.25 : 0.5;
  const n = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(0.005, n));
};

const clampPoint = (point: AiPoint | undefined, courtType: "half" | "full"): AiPoint => ({
  x: clampX(point?.x ?? 0.5),
  y: clampY(point?.y ?? (courtType === "half" ? 0.25 : 0.5), courtType),
});

/** Un diagramme détecté → une Phase Plaquette native. */
function diagramToPhase(diagram: AiExerciseDiagram, courtType: "half" | "full"): PlaquettePhase {
  const idByKey = new Map<string, string>();

  const players = diagram.players.map((player) => {
    const id = uid();
    idByKey.set(player.key, id);
    return {
      id,
      x: clampX(player.x),
      y: clampY(player.y, courtType),
      label: player.label,
      team: player.team === "def" ? "def" : "att",
      // Règle import : attaquants ET défenseurs sont toujours des ronds.
      // Le rendu défenseur spécifique dépend uniquement de team='def'.
      shape: "circle" as const,
      coach: player.coach ? true : undefined,
      rotation: 0,
      ...(player.color ? { color: player.color } : {}),
      hasBall: Boolean(player.hasBall),
      ballCount: player.hasBall ? 1 : 0,
    };
  });

  const objects = diagram.objects.map((object) => ({
    id: uid(),
    x: clampX(object.x),
    y: clampY(object.y, courtType),
    kind: object.kind,
    ...(object.kind === "text" && object.text ? { text: object.text } : {}),
    rotation: 0,
    size: 1,
    color: object.color || "#0F0F12",
  }));

  const lines = diagram.actions.map((action, index) => {
    const sourcePlayerId = action.fromPlayer ? idByKey.get(action.fromPlayer) : undefined;
    const targetPlayerId = action.toPlayer ? idByKey.get(action.toPlayer) : undefined;
    const source = players.find((player) => player.id === sourcePlayerId);
    const target = players.find((player) => player.id === targetPlayerId);

    const from = source ? { x: source.x, y: source.y } : clampPoint(action.from, courtType);
    const to = target ? { x: target.x, y: target.y } : clampPoint(action.to, courtType);
    const isShoot = action.action === "shoot";

    return {
      id: uid(),
      action: action.action,
      from,
      to,
      rotation: 0,
      ...(action.action === "freedraw" && action.points?.length
        ? { points: action.points.map((point) => clampPoint(point, courtType)) }
        : action.points && action.points.length > 2
        ? {
            ctrls: action.points
              .slice(1, -1)
              .filter((_point, i, arr) => i === 0 || i === arr.length - 1 || i % Math.max(1, Math.floor(arr.length / 5)) === 0)
              .map((point) => clampPoint(point, courtType)),
          }
        : {}),
      ...(sourcePlayerId ? { sourcePlayerId } : {}),
      ...(targetPlayerId ? { targetPlayerId } : {}),
      ...(isShoot ? { target: "basket" as const } : {}),
      order: index + 1,
      startMode: "afterPrevious" as const,
      duration: 1,
    };
  });

  return {
    players,
    objects,
    lines,
    notes: diagram.notes || "",
    duration: 1.5,
    startMode: "afterPrevious",
  };
}

/**
 * Construit LE schéma importé : un seul groupe, une phase par graphique
 * détecté, exactement comme un schéma multi-phases créé à la main.
 */
export function importToPlaquetteSchema(result: AiExerciseImport): PlaquetteImportResult | null {
  const detected = (result.diagrams?.length ? result.diagrams : [result.diagram]).filter(
    (diagram) => diagram && diagram.detected
  );
  if (!detected.length) return null;

  // Un groupe de schémas n'a qu'un seul type de terrain. Les coordonnées d'un
  // demi-terrain (y ∈ [0, 0.5]) restent valides sur un terrain complet, donc
  // dès qu'un graphique est un terrain complet, tout le groupe l'est.
  const courtType: "half" | "full" = detected.some((diagram) => diagram.courtType === "full") ? "full" : "half";

  const phases = detected.map((diagram) => diagramToPhase(diagram, courtType));
  const schemaGroupId = uid();
  const baseTitle = result.title?.trim() || "Schéma"; // idem L2593

  // Format de titre identique à buildPlaquetteResult (PlaquetteClient.tsx
  // L2593) : « <titre> - Phase N », y compris pour un schéma à une seule phase.
  const entries: PlaquetteSchemaData[] = phases.map((_phase, index) => ({
    title: `${baseTitle} - Phase ${index + 1}`,
    schemaGroupId,
    phaseIndex: index,
    courtType,
    phases,
    sheet: null,
    current: index,
    imageData: "",
    phaseImages: [],
    editable: true,
  }));

  return { schemaGroupId, courtType, phases, entries };
}

/* -------------------------------------------------------------------------- */
/* Compatibilité ascendante                                                   */
/* -------------------------------------------------------------------------- */

/** @deprecated Utiliser importToPlaquetteSchema (conservé pour les anciens appels). */
export function aiDiagramsToPlaquette(result: AiExerciseImport): PlaquetteSchemaData[] {
  return importToPlaquetteSchema(result)?.entries ?? [];
}

/** @deprecated Utiliser importToPlaquetteSchema (conservé pour les anciens appels). */
export function aiDiagramToPlaquette(result: AiExerciseImport): PlaquetteSchemaData | null {
  return aiDiagramsToPlaquette(result)[0] || null;
}

/* -------------------------------------------------------------------------- */
/* Miniatures : rendu sur LES VRAIS TERRAINS MyBasket                         */
/* -------------------------------------------------------------------------- */

const COURT_ASSETS = {
  half: "/plaquette/half-court.jpg",
  full: "/plaquette/full-court.jpg",
} as const;

const PREVIEW = {
  half: { w: 900, h: 704 },
  full: { w: 704, h: 1100 },
};

const COLORS = {
  ink: "#0F0F12",
  bord: "#6B1A2C",
  gold: "#D4A24C",
  ball: "#E8743C",
  ballStroke: "#7a3a10",
  cone: "#E87722",
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Impossible de charger ${src}`));
    img.src = src;
  });
}

function drawCourtBackground(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, courtType: "half" | "full", img: HTMLImageElement) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (courtType === "half") {
    ctx.drawImage(img, 0, 0, W, H);
    return;
  }
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.PI / 2);
  const spaceW = H;
  const spaceH = W;
  const r = img.naturalWidth / img.naturalHeight;
  const sr = spaceW / spaceH;
  let dw: number;
  let dh: number;
  if (r > sr) { dw = spaceW; dh = dw / r; }
  else { dh = spaceH; dw = dh * r; }
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function getCourtDrawRect(canvas: HTMLCanvasElement, courtType: "half" | "full", img: HTMLImageElement) {
  const W = canvas.width;
  const H = canvas.height;
  if (courtType === "half") return { x: 0, y: 0, w: W, h: H };
  const spaceW = H;
  const spaceH = W;
  const r = img.naturalWidth / img.naturalHeight;
  const sr = spaceW / spaceH;
  let dw: number;
  let dh: number;
  if (r > sr) { dw = spaceW; dh = dw / r; }
  else { dh = spaceH; dw = dh * r; }
  const wDisp = dh;
  const hDisp = dw;
  return { x: (W - wDisp) / 2, y: (H - hDisp) / 2, w: wDisp, h: hDisp };
}

function nativeToPx(point: { x: number; y: number }, rect: { x: number; y: number; w: number; h: number }, courtType: "half" | "full") {
  const displayY = courtType === "full" ? point.y : point.y / 0.5;
  return { x: rect.x + point.x * rect.w, y: rect.y + displayY * rect.h };
}

function drawArrowHead(ctx: CanvasRenderingContext2D, tan: AiPoint, tip: AiPoint, w: number) {
  const ang = Math.atan2(tip.y - tan.y, tip.x - tan.x);
  const len = Math.max(16, w * 7);
  const half = len * 0.5;
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-len, -half);
  ctx.lineTo(-len * 0.7, 0);
  ctx.lineTo(-len, half);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function catmullRom(pts: AiPoint[], perSeg = 20): AiPoint[] {
  if (pts.length <= 1) return pts.slice();
  if (pts.length === 2) {
    const out: AiPoint[] = [];
    const a = pts[0], b = pts[1];
    for (let i = 0; i <= perSeg; i++) {
      const u = i / perSeg;
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    }
    return out;
  }
  const out: AiPoint[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    for (let j = 0; j <= perSeg; j++) {
      if (i > 0 && j === 0) continue;
      const u = j / perSeg, u2 = u * u, u3 = u2 * u;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
      });
    }
  }
  return out;
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = COLORS.ball;
  ctx.strokeStyle = COLORS.ballStroke;
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
}

function drawPlayerNative(ctx: CanvasRenderingContext2D, p: any, x: number, y: number, courtWidth: number) {
  const r = courtWidth * 0.024 * (p.size || 1);
  ctx.save(); ctx.translate(x, y); ctx.rotate(((p.rotation || 0) * Math.PI) / 180);
  if (p.team === "def") {
    const red = p.color || COLORS.bord;
    const armW = Math.max(3, r * 0.52);
    ctx.strokeStyle = red; ctx.lineWidth = armW; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-r * 0.45, r * 0.05); ctx.bezierCurveTo(-r * 1.35, r * 0.55, -r * 2.45, r * 0.15, -r * 2.55, -r * 1.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.45, r * 0.05); ctx.bezierCurveTo(r * 1.35, r * 0.55, r * 2.45, r * 0.15, r * 2.55, -r * 1.05); ctx.stroke();
    ctx.fillStyle = red; ctx.beginPath(); ctx.arc(0, -r * 1.42, r * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
  } else {
    let fill = COLORS.bord, stroke = COLORS.gold, text = COLORS.gold;
    if (p.shape === "square") { fill = COLORS.gold; stroke = COLORS.ink; text = COLORS.ink; }
    if (p.color) { fill = p.color; stroke = COLORS.ink; text = "#FFFFFF"; }
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.beginPath(); if (p.shape === "square") ctx.rect(-r, -r, 2 * r, 2 * r); else ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = text;
  }
  ctx.font = `700 ${Math.round(r * (String(p.label || "").length > 1 ? 0.9 : 1.1))}px Roboto, Arial, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(p.label ?? ""), 0, 1); ctx.restore();
  if (Number(p.ballCount) > 0 || p.hasBall) drawBall(ctx, x + r * 0.78, y - r * 0.78, Math.max(5, r * 0.42));
}

function drawObjectNative(ctx: CanvasRenderingContext2D, o: any, x: number, y: number, courtWidth: number) {
  const s = courtWidth * 0.018 * (o.size || 1);
  if (o.kind === "ball") { drawBall(ctx, x, y, s); return; }
  ctx.save(); ctx.translate(x, y); ctx.rotate(((o.rotation || 0) * Math.PI) / 180); ctx.lineWidth = Math.max(2, courtWidth * 0.0035);
  if (o.kind === "cone") {
    ctx.fillStyle = o.color || COLORS.cone; ctx.beginPath(); ctx.moveTo(0, -s * 1.2); ctx.lineTo(s, s); ctx.lineTo(-s, s); ctx.closePath(); ctx.fill();
  } else if (o.kind === "text") {
    ctx.fillStyle = o.color || COLORS.ink; ctx.font = `700 ${Math.round(courtWidth * 0.024 * (o.size || 1))}px Roboto, Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(o.text || "", 0, 0);
  }
  ctx.restore();
}

function drawLineNative(ctx: CanvasRenderingContext2D, l: any, toPx: (p: AiPoint) => AiPoint, courtWidth: number) {
  const w = Math.max(2, courtWidth * 0.0035);
  ctx.lineWidth = w; ctx.strokeStyle = COLORS.ink; ctx.fillStyle = COLORS.ink; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.setLineDash([]);
  if (l.action === "freedraw" && Array.isArray(l.points) && l.points.length > 1) {
    ctx.beginPath(); l.points.forEach((point: AiPoint, index: number) => { const q = toPx(point); if (index === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }); ctx.stroke(); return;
  }
  const raw = [l.from, ...(Array.isArray(l.ctrls) ? l.ctrls : l.ctrl ? [l.ctrl] : []), l.to].filter(Boolean).map((p: AiPoint) => toPx(p));
  const poly = catmullRom(raw); if (poly.length < 2) return;
  if (l.action === "pass") ctx.setLineDash([w * 3, w * 2.4]);
  if (l.action === "dribble") {
    const total = poly.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - poly[i].x, p.y - poly[i].y), 0) || 1;
    const waves = Math.max(3, Math.round(total / 18));
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], prev = poly[Math.max(0, i - 1)], next = poly[Math.min(poly.length - 1, i + 1)];
      const dx = next.x - prev.x, dy = next.y - prev.y, dl = Math.hypot(dx, dy) || 1;
      const off = Math.sin((i / Math.max(1, poly.length - 1)) * Math.PI * 2 * waves) * w * 2.2;
      const x = p.x + (-dy / dl) * off, y = p.y + (dx / dl) * off;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else {
    ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  }
  ctx.setLineDash([]);
  const tip = poly[poly.length - 1], tan = poly[poly.length - 2] || poly[0];
  if (l.action === "screen") {
    const angle = Math.atan2(tip.y - tan.y, tip.x - tan.x), bar = w * 4;
    ctx.beginPath(); ctx.moveTo(tip.x - bar * Math.sin(angle), tip.y + bar * Math.cos(angle)); ctx.lineTo(tip.x + bar * Math.sin(angle), tip.y - bar * Math.cos(angle)); ctx.stroke();
  } else drawArrowHead(ctx, tan, tip, w);
}

export async function renderPlaquettePhasePreview(courtType: "half" | "full", phase: PlaquettePhase): Promise<string> {
  if (typeof document === "undefined") return "";
  const size = PREVIEW[courtType];
  const canvas = document.createElement("canvas"); canvas.width = size.w; canvas.height = size.h;
  const ctx = canvas.getContext("2d"); if (!ctx) return "";
  let img: HTMLImageElement;
  try { img = await loadImage(COURT_ASSETS[courtType]); }
  catch { ctx.fillStyle = COLORS.bord; ctx.fillRect(0, 0, canvas.width, canvas.height); return canvas.toDataURL("image/png"); }
  drawCourtBackground(ctx, canvas, courtType, img);
  const rect = getCourtDrawRect(canvas, courtType, img);
  const toPx = (p: AiPoint) => nativeToPx(p, rect, courtType);
  for (const line of phase.lines || []) drawLineNative(ctx, line, toPx, rect.w);
  for (const object of phase.objects || []) { const p = toPx(object); drawObjectNative(ctx, object, p.x, p.y, rect.w); }
  for (const player of phase.players || []) { const p = toPx(player); drawPlayerNative(ctx, player, p.x, p.y, rect.w); }
  return canvas.toDataURL("image/png");
}

export async function renderSchemaPreviews(result: PlaquetteImportResult): Promise<string[]> {
  return Promise.all(result.phases.map((phase) => renderPlaquettePhasePreview(result.courtType, phase)));
}
