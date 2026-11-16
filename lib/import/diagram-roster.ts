import type { AiDiagramAction, AiDiagramPlayer, AiPoint, AiExerciseDiagram } from "./types";

export function numberedPlayerKey(player: Pick<AiDiagramPlayer, "label" | "team" | "coach">): string | undefined {
  const number = /^(?:[AX]\s*)?(\d+)$/i.exec(player.label.trim())?.[1];
  return number && !player.coach ? `${player.team}:${Number(number)}` : undefined;
}

export function deduplicateDiagramPlayers(diagram: AiExerciseDiagram): AiExerciseDiagram {
  const groups = new Map<string, AiDiagramPlayer[]>();
  for (const player of diagram.players) {
    const key = numberedPlayerKey(player);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(player);
    groups.set(key, group);
  }

  const aliases = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const score = (player: AiDiagramPlayer) => {
      const starts = diagram.actions.filter(action => action.fromPlayer === player.key && action.from);
      return (player.labelConfident === true ? 2 : 0) + (player.confidence ?? .5)
        + (starts.some(action => Math.hypot(action.from!.x - player.x, action.from!.y - player.y) < .035) ? 1 : 0);
    };
    const [keep, ...duplicates] = group.slice().sort((a, b) => score(b) - score(a));
    for (const duplicate of duplicates) aliases.set(duplicate.key, keep.key);
  }
  if (!aliases.size) return diagram;
  const resolve = (key: string | undefined) => key === undefined ? undefined : aliases.get(key) ?? key;
  return {
    ...diagram,
    players: diagram.players.filter(player => !aliases.has(player.key)),
    actions: diagram.actions.map(action => {
      const fromPlayer = resolve(action.fromPlayer), toPlayer = resolve(action.toPlayer);
      return { ...action, fromPlayer, toPlayer: toPlayer === fromPlayer ? undefined : toPlayer };
    }),
  };
}

const distance = (a: AiPoint, b: AiPoint) => Math.hypot(a.x - b.x, (a.y - b.y) * 1.35);
const travels = (action: AiDiagramAction) => ["cut", "screen", "dribble"].includes(action.action);

function finalPosition(diagram: AiExerciseDiagram, player: AiDiagramPlayer): AiPoint | undefined {
  let position: AiPoint = player;
  const actions = diagram.actions;
  for (const action of actions) {
    if (!travels(action) || action.continuationChoice?.alternate) continue;
    if (action.fromPlayer !== player.key) {
      if (!action.fromPlayer && action.from && distance(position, action.from) < .04) return undefined;
      continue;
    }
    // A disputed movement cannot establish where the player finished.
    if ((action.confidence ?? 1) < .65 || !action.from || distance(position, action.from) > .055) return undefined;
    position = action.to;
  }
  return position;
}

/** Recover unread numbers from neighbouring phases before merging players by number. */
export function reconcileDiagramRosters(diagrams: AiExerciseDiagram[]): AiExerciseDiagram[] {
  let phases = diagrams.map(diagram => {
    const players = diagram.players.map(player => {
      const key = numberedPlayerKey(player);
      const separateDuplicate = key && diagram.players.some(other =>
        other !== player && numberedPlayerKey(other) === key && distance(other, player) > .045);
      return player.labelConfident === false || separateDuplicate || (!player.label.trim() && !player.coach)
        ? { ...player, label: "", labelConfident: false }
        : player;
    });
    return deduplicateDiagramPlayers({ ...diagram, players });
  });

  // Use both directions and apply each round simultaneously so two conflicting
  // readings on either side leave the middle phase marked for review.
  for (let round = 0; round < phases.length; round++) {
    const evidence = phases.map(() => new Map<string, AiDiagramPlayer[]>());
    const propose = (index: number, player: AiDiagramPlayer, known: AiDiagramPlayer) => {
      if (player.labelConfident !== false || !numberedPlayerKey(known) || known.labelConfident === false) return;
      const map = evidence[index];
      map.set(player.key, [...(map.get(player.key) ?? []), known]);
    };
    for (let i = 0; i + 1 < phases.length; i++) {
      const previous = phases[i], next = phases[i + 1];
      if (previous.courtType !== next.courtType) continue;
      const edges = previous.players.flatMap(from => {
        const end = finalPosition(previous, from);
        if (!end || from.coach) return [];
        return next.players.filter(to => !to.coach && (from.team === to.team || from.type === "unknown" || to.type === "unknown"))
          .map(to => ({ from, to, gap: distance(end, to) }));
      });
      for (const edge of edges) {
        if (edge.gap > .045 || edges.some(other => other !== edge &&
          (other.from === edge.from || other.to === edge.to) && other.gap < edge.gap + .022)) continue;
        propose(i, edge.from, edge.to);
        propose(i + 1, edge.to, edge.from);
      }
    }
    let changed = false;
    phases = phases.map((diagram, index) => {
      const choices = new Map<string, AiDiagramPlayer>();
      for (const [key, candidates] of evidence[index]) {
        const number = numberedPlayerKey(candidates[0]);
        if (candidates.every(candidate => numberedPlayerKey(candidate) === number)) choices.set(key, candidates[0]);
      }
      const players = diagram.players.map(player => {
        const match = choices.get(player.key);
        if (!match) return player;
        const number = numberedPlayerKey(match);
        if (diagram.players.some(other => numberedPlayerKey(other) === number)
          || [...choices].some(([key, other]) => key !== player.key && numberedPlayerKey(other) === number)) return player;
        changed = true;
        return { ...player, label: match.label, labelConfident: true, team: match.team,
          ...(player.type === "unknown" ? { type: match.team === "def" ? "defender" as const : "attacker" as const, typeConfidence: .75 } : {}),
          source: "Numéro retrouvé par continuité entre les schémas" };
      });
      return { ...diagram, players };
    });
    if (!changed) break;
  }
  return phases.map((diagram, index) => {
    const next = phases[index + 1];
    if (!next || diagram.courtType !== next.courtType) return diagram;
    const actions = diagram.actions.map((action, actionIndex) => {
      if (action.action !== "cut" || (action.confidence ?? 1) >= .5 || !action.from || !action.fromPlayer) return action;
      const player = diagram.players.find(candidate => candidate.key === action.fromPlayer);
      const number = player && player.labelConfident !== false && numberedPlayerKey(player);
      if (!number) return action;
      const previous = diagram.actions.slice(0, actionIndex).findLast(candidate =>
        candidate.fromPlayer === action.fromPlayer && travels(candidate));
      if (previous?.action !== "screen" || (previous.confidence ?? 1) < .65
        || distance(previous.to, action.from) > .012) return action;
      const arrivals = next.players.filter(candidate => candidate.labelConfident !== false
        && numberedPlayerKey(candidate) === number && distance(candidate, action.to) < .04);
      const competing = diagram.actions.some(candidate => candidate !== action && candidate.action === "cut"
        && candidate.fromPlayer === action.fromPlayer && candidate.from && distance(candidate.from, previous.to) < .015);
      if (arrivals.length !== 1 || competing) return action;
      return { ...action, confidence: .78, source: "Coupe après écran confirmée par la position sur la phase suivante" };
    });
    return { ...diagram, actions };
  });
}
