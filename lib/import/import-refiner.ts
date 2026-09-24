/**
 * Post-traitement conservateur de la numérisation MyBasket.
 *
 * But : transformer les détections visuelles en objets Plaquette cohérents
 * SANS réinventer le dessin. Ce module ne crée jamais une trajectoire absente.
 * Il relie seulement les extrémités déjà détectées aux joueurs proches, remet
 * l'ordre des actions au propre et signale les ambiguïtés.
 */
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
  let best: AiDiagramPlayer | undefined;
  let bestD = max;
  for (const player of players) {
    const d = dist(player, point);
    if (d < bestD) {
      bestD = d;
      best = player;
    }
  }
  return best;
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
  const liveKeys = new Set(diagram.players.map((p) => p.key));

  const actions = diagram.actions.map((original, index) => {
    const action: AiDiagramAction = { ...original, points: original.points ? [...original.points] : undefined };
    const ends = actionEndpoints(action);

    if (action.fromPlayer && !liveKeys.has(action.fromPlayer)) action.fromPlayer = undefined;
    if (action.toPlayer && !liveKeys.has(action.toPlayer)) action.toPlayer = undefined;

    // Une trajectoire MyBasket part presque toujours d'un joueur. On ne relie
    // que si l'extrémité est vraiment proche : sinon on conserve le tracé libre.
    if (!action.fromPlayer) {
      const player = nearestPlayer(diagram.players, ends.from, 0.085);
      if (player) {
        action.fromPlayer = player.key;
        action.source = `${action.source ?? "détection"} · départ relié au joueur ${player.label}`;
      }
    }

    // Une passe a une cible joueur. Pour les autres actions, la destination
    // reste une position du terrain (sinon on déforme les déplacements).
    if (action.action === "pass" && !action.toPlayer) {
      const player = nearestPlayer(diagram.players, ends.to, 0.075);
      if (player && player.key !== action.fromPlayer) {
        action.toPlayer = player.key;
        action.source = `${action.source ?? "détection"} · passe reliée au joueur ${player.label}`;
      } else if ((action.confidence ?? 1) < 0.72) {
        warnings.push(`Passe ${index + 1} : destinataire à confirmer.`);
      }
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
  const warnings = [...input.warnings, ...refined.flatMap((x) => x.warnings)];

  // Dédoublonnage des avertissements pour garder l'écran lisible.
  const uniqueWarnings = [...new Set(warnings.filter(Boolean))].slice(0, 16);

  return {
    ...input,
    diagram: diagrams[0] ?? input.diagram,
    ...(input.diagrams?.length ? { diagrams } : {}),
    warnings: uniqueWarnings,
  };
}
