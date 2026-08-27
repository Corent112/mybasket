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

const BALL_ACTIONS = new Set(["pass", "dribble", "shoot"]);

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
      // La Plaquette crée TOUJOURS ses défenseurs en 'circle'
      // (PlaquetteClient.tsx L1959) et drawDefenderShape ignore `shape`.
      // On s'aligne : seuls les attaquants peuvent être 'square'.
      shape: player.team !== "def" && player.shape === "square" ? "square" : "circle",
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
        : {}),
      ...(sourcePlayerId ? { sourcePlayerId } : {}),
      ...(targetPlayerId ? { targetPlayerId } : {}),
      ...(isShoot ? { target: "basket" as const } : {}),
      order: index + 1,
      startMode: "afterPrevious" as const,
      duration: 1,
    };
  });

  // Cohérence de possession : une passe, un dribble ou un tir suppose que le
  // joueur source a le ballon. Si aucun porteur n'a été détecté, on le donne au
  // premier joueur qui en a besoin — l'utilisateur peut le déplacer ensuite.
  if (!players.some((player) => player.ballCount > 0)) {
    const firstBallAction = lines.find((line) => BALL_ACTIONS.has(line.action) && line.sourcePlayerId);
    const carrier = firstBallAction
      ? players.find((player) => player.id === firstBallAction.sourcePlayerId)
      : undefined;
    if (carrier) {
      carrier.hasBall = true;
      carrier.ballCount = 1;
    }
  }

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
/* Miniature : terrain vectoriel aux cotes officielles                        */
/* -------------------------------------------------------------------------- */
/**
 * La miniature n'est qu'un APERÇU affiché dans le formulaire. Dès que
 * l'utilisateur ouvre le schéma dans la Plaquette et l'enregistre, elle est
 * remplacée par la vraie capture du canvas Plaquette (captureAllPhaseImages).
 *
 * Elle est dessinée avec EXACTEMENT le même repère que la Plaquette :
 *   - x d'affichage = x canonique ;
 *   - y d'affichage = y canonique en terrain complet, y / 0.5 en demi-terrain ;
 *   - le terrain occupe la bande définie par les constantes de calibration.
 * Un joueur importé apparaît donc au même endroit ici et dans la Plaquette.
 */

// Mêmes proportions que le canvas de la Plaquette (900 × 704 et 704 × 1100),
// pour que la miniature soit cadrée exactement comme l'éditeur.
const PREVIEW = {
  half: { w: 810, h: 634 },
  full: { w: 563, h: 880 },
};

const COLORS = {
  page: "#FFFFFF",
  floor: "#F4EDE1",
  lines: "#6B1A2C",
  ink: "#0F0F12",
  defense: "#D4A24C",
  ball: "#E8743C",
  cone: "#E87722",
};

function arrowHead(ctx: CanvasRenderingContext2D, from: AiPoint, to: AiPoint, size: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

/**
 * Miniature d'une phase importée.
 * Synchrone : aucune image externe n'est chargée.
 */
export function renderPlaquettePhasePreview(
  courtType: "half" | "full",
  phase: PlaquettePhase
): string {
  if (typeof document === "undefined") return "";

  const size = PREVIEW[courtType];
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, W, H);

  // Bande occupée par le terrain, dans le repère d'AFFICHAGE de la Plaquette.
  const left = (courtType === "half" ? HALF_COURT_LEFT : FULL_COURT_LEFT) * W;
  const right = (courtType === "half" ? HALF_COURT_RIGHT : FULL_COURT_RIGHT) * W;
  const top = (courtType === "half" ? HALF_COURT_TOP : FULL_COURT_TOP) * H;
  const bottom = (courtType === "half" ? HALF_COURT_BOTTOM : FULL_COURT_BOTTOM) * H;
  const courtW = right - left;
  const courtH = bottom - top;

  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(left, top, courtW, courtH);

  ctx.save();
  ctx.translate(left, top);
  ctx.strokeStyle = COLORS.lines;
  strokeCourtLines(ctx, courtW, courtH, courtType, Math.max(1.4, courtW * 0.004));
  ctx.restore();

  // Mapping canonique → pixels, identique à toPx() de la Plaquette.
  const toPx = (point: { x: number; y: number }) => ({
    x: (Number(point?.x) || 0) * W,
    y: (courtType === "full" ? Number(point?.y) || 0 : (Number(point?.y) || 0) / 0.5) * H,
  });

  const scale = courtW;
  const stroke = Math.max(2, scale * 0.007);

  for (const line of phase.lines || []) {
    const from = toPx(line.from);
    const to = toPx(line.to);
    ctx.strokeStyle = COLORS.ink;
    ctx.fillStyle = COLORS.ink;
    ctx.lineWidth = stroke;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (line.action === "freedraw" && Array.isArray(line.points) && line.points.length > 1) {
      ctx.setLineDash([]);
      ctx.beginPath();
      line.points.forEach((point: AiPoint, index: number) => {
        const p = toPx(point);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      continue;
    }

    if (line.action === "dribble") {
      ctx.setLineDash([]);
      const total = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const waves = Math.max(3, Math.round(total / 20));
      const nx = -(to.y - from.y) / total;
      const ny = (to.x - from.x) / total;
      ctx.beginPath();
      const steps = waves * 8;
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const offset = Math.sin(t * Math.PI * 2 * waves) * stroke * 1.8;
        const x = from.x + (to.x - from.x) * t + nx * offset;
        const y = from.y + (to.y - from.y) * t + ny * offset;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      ctx.setLineDash(line.action === "pass" ? [stroke * 3, stroke * 2.4] : []);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (line.action === "screen") {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const bar = stroke * 3.6;
      ctx.beginPath();
      ctx.moveTo(to.x - bar * Math.sin(angle), to.y + bar * Math.cos(angle));
      ctx.lineTo(to.x + bar * Math.sin(angle), to.y - bar * Math.cos(angle));
      ctx.stroke();
    } else {
      arrowHead(ctx, from, to, stroke * 3.2);
    }
  }

  for (const object of phase.objects || []) {
    const p = toPx(object);
    const r = scale * 0.018;
    if (object.kind === "ball") {
      ctx.fillStyle = COLORS.ball;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (object.kind === "cone") {
      ctx.fillStyle = COLORS.cone;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r * 1.3);
      ctx.lineTo(p.x - r, p.y + r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.closePath();
      ctx.fill();
    } else if (object.kind === "text" && object.text) {
      ctx.fillStyle = COLORS.ink;
      ctx.font = `700 ${Math.round(scale * 0.03)}px Roboto, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(object.text), p.x, p.y);
    } else {
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = stroke;
      ctx.beginPath();
      if (object.kind === "square") ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
      else if (object.kind === "triangle") {
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x - r, p.y + r);
        ctx.lineTo(p.x + r, p.y + r);
        ctx.closePath();
      } else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (const player of phase.players || []) {
    const p = toPx(player);
    const r = scale * 0.026;
    ctx.lineWidth = Math.max(2, scale * 0.006);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (player.team === "def") {
      ctx.strokeStyle = COLORS.defense;
      ctx.beginPath();
      ctx.moveTo(p.x - r, p.y - r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.moveTo(p.x + r, p.y - r);
      ctx.lineTo(p.x - r, p.y + r);
      ctx.stroke();
      ctx.fillStyle = COLORS.defense;
      ctx.font = `900 ${Math.round(scale * 0.026)}px Oswald, Arial, sans-serif`;
      ctx.fillText(String(player.label ?? ""), p.x, p.y - r * 1.8);
    } else {
      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = player.color || COLORS.lines;
      ctx.beginPath();
      if (player.shape === "square") ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
      else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.font = `900 ${Math.round(scale * 0.03)}px Oswald, Arial, sans-serif`;
      ctx.fillText(String(player.label ?? ""), p.x, p.y);
    }

    if (Number(player.ballCount) > 0 || player.hasBall) {
      ctx.fillStyle = COLORS.ball;
      ctx.beginPath();
      ctx.arc(p.x + r * 1.15, p.y - r * 1.15, r * 0.44, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas.toDataURL("image/png");
}

/** Miniatures de toutes les phases d'un schéma importé. */
export function renderSchemaPreviews(result: PlaquetteImportResult): string[] {
  return result.phases.map((phase) => renderPlaquettePhasePreview(result.courtType, phase));
}
