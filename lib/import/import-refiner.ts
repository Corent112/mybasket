/**
 * Post-traitement conservateur de la numérisation MyBasket.
 *
 * But : transformer les détections visuelles en objets Plaquette cohérents
 * SANS réinventer le dessin. Ce module ne crée jamais une trajectoire absente.
 * Il relie seulement les extrémités déjà détectées aux joueurs proches, remet
 * l'ordre des actions au propre et signale les ambiguïtés.
 */
import { courtToCanonical } from "./court-geometry";
import type {
  AiDiagramAction,
  AiDiagramPlayer,
  AiExerciseDiagram,
  AiExerciseImport,
  AiPoint,
} from "./types";

const Y_WEIGHT = 1.35;
const dist = (a: AiPoint, b: AiPoint) =>
  Math.hypot(a.x - b.x, (a.y - b.y) * Y_WEIGHT);

function nearestPlayer(players: AiDiagramPlayer[], point: AiPoint | undefined, max: number) {
  if (!point || !players.length) return undefined;
  const ranked = players.map(player => ({ player, gap: dist(player, point) })).sort((a,b) => a.gap-b.gap);
  const best = ranked[0];
  return best && best.gap < max && (!ranked[1] || ranked[1].gap-best.gap >= .018) ? best.player : undefined;
}

function actionEndpoints(action: AiDiagramAction): { from?: AiPoint; to: AiPoint } {
  const points = action.points?.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  return {
    from: action.from ?? points?.[0],
    to: action.to ?? points?.[points.length - 1] ?? { x: 0.5, y: 0.25 },
  };
}

function refineDiagram(diagram: AiExerciseDiagram): { diagram: AiExerciseDiagram; warnings: string[] } {
  const warnings: string[] = [];
  const byKey = new Map(diagram.players.map(player => [player.key,player]));

  const finite = (p: AiPoint | undefined): p is AiPoint => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const candidates = diagram.actions.filter(action => {
    const points = action.points?.filter(finite) ?? [];
    const from = finite(action.from) ? action.from : points[0] ?? byKey.get(action.fromPlayer ?? "");
    if (!finite(from) || !finite(action.to)) return false;
    return dist(from, action.to) >= .006 || points.some(p => dist(from,p) >= .018);
  });
  const topLeft = courtToCanonical({ x:0, y:0 }, diagram.courtType);
  const bottomRight = courtToCanonical({ x:1, y:1 }, diagram.courtType);
  const runsAlongCourtEdge = (from: AiPoint, to: AiPoint, trace?: AiPoint[]) => {
    if (dist(from,to)<.16) return false;
    const points = [from,...(trace ?? []),to];
    const nearLine = (axis: "x" | "y", value: number) =>
      points.every(p => Math.abs(p[axis]-value)<.022);
    const outside = points.every(p=>p.x<topLeft.x-.012) || points.every(p=>p.x>bottomRight.x+.012)
      || points.every(p=>p.y<topLeft.y-.012) || points.every(p=>p.y>bottomRight.y+.012);
    return outside || nearLine("x",topLeft.x) || nearLine("x",bottomRight.x)
      || nearLine("y",topLeft.y) || nearLine("y",bottomRight.y);
  };
  const actions = candidates.map((original, index) => {
    const action: AiDiagramAction = { ...original, points: original.points?.filter(finite) };
    const ends = actionEndpoints(action);

    if (action.fromPlayer && !byKey.has(action.fromPlayer)) action.fromPlayer = undefined;
    if (action.toPlayer && !byKey.has(action.toPlayer)) action.toPlayer = undefined;

    // Une trajectoire MyBasket part presque toujours d'un joueur. On ne relie
    // que si l'extrémité est vraiment proche : sinon on conserve le tracé libre.
    if (!action.fromPlayer) {
      const player = nearestPlayer(diagram.players, ends.from, 0.055);
      if (player) {
        action.fromPlayer = player.key;
        action.source = `${action.source ?? "détection"} · départ relié au joueur ${player.label}`;
      }
    }

    // Une passe a une cible joueur. Pour les autres actions, la destination
    // reste une position du terrain (sinon on déforme les déplacements).
    if (action.action === "pass" && !action.toPlayer) {
      const player = nearestPlayer(diagram.players.filter(p => p.key !== action.fromPlayer), ends.to, 0.045);
      if (player && player.key !== action.fromPlayer) {
        action.toPlayer = player.key;
        action.source = `${action.source ?? "détection"} · passe reliée au joueur ${player.label}`;
      } else if ((action.confidence ?? 1) < 0.72) {
        warnings.push(`Passe ${index + 1} : destinataire à confirmer.`);
      }
    }

    // An automatically detected line needs a plausible departure. Court
    // boundaries can be mistaken for paths even when a player stands nearby.
    if (!action.fromPlayer || action.action === "freedraw" ||
      (ends.from && runsAlongCourtEdge(ends.from, ends.to, action.points))) {
      action.confidence = Math.min(action.confidence ?? 1, .49);
    }

    action.order = index + 1;
    return action;
  });

  // Ballon : si le scanner a détecté un porteur, un seul ballon suffit. On ne
  // force jamais un porteur quand aucun indice n'existe.
  const carriers = diagram.players.filter((p) => p.hasBall);
  if (carriers.length > 1) warnings.push("Plusieurs porteurs de balle détectés : vérifie le ballon dans l’aperçu.");

  const uncertainPlayers = diagram.players.filter(
    (p) => p.type === "unknown" || (p.typeConfidence ?? 1) < 0.5 || (p.confidence ?? 1) < 0.5
  ).length;
  const uncertainActions = actions.filter((a) => (a.confidence ?? 1) < 0.5).length;
  if (uncertainPlayers) warnings.push(`${uncertainPlayers} joueur${uncertainPlayers > 1 ? "s" : ""} à confirmer.`);
  if (uncertainActions) warnings.push(`${uncertainActions} trajectoire${uncertainActions > 1 ? "s" : ""} à confirmer.`);

  return { diagram: { ...diagram, actions }, warnings };
}

export function refineImportedExercise(input: AiExerciseImport): AiExerciseImport {
  const source = input.diagrams?.length ? input.diagrams : [input.diagram];
  const refined = source.map(refineDiagram);
  const diagrams = refined.map((x) => x.diagram);
  const fallback = input.referenceFallback ? refineDiagram(input.referenceFallback) : undefined;
  const warnings = [...input.warnings, ...refined.flatMap((x) => x.warnings), ...(fallback?.warnings ?? [])];

  // Dédoublonnage des avertissements pour garder l'écran lisible.
  const uniqueWarnings = [...new Set(warnings.filter(Boolean))].slice(0, 16);

  return {
    ...input,
    diagram: diagrams[0] ?? input.diagram,
    ...(input.diagrams?.length ? { diagrams } : {}),
    ...(fallback ? { referenceFallback: fallback.diagram } : {}),
    warnings: uniqueWarnings,
  };
}
