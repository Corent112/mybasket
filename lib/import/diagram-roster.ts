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
    const recovered: AiDiagramAction[] = [];
    const actions = diagram.actions.map((action, actionIndex) => {
      if (action.action !== "cut" || (action.confidence ?? 1) >= .5 || !action.from) return action;
      const candidates = diagram.actions.slice(0, actionIndex).filter(screen =>
        screen.action === "screen" && screen.fromPlayer && (screen.confidence ?? 1) >= .65
        && distance(screen.to, action.from!) < (screen.fromPlayer === action.fromPlayer ? .012 : .03));
      const corroborated = candidates.filter(screen => {
        const player = diagram.players.find(candidate => candidate.key === screen.fromPlayer);
        const number = player && player.labelConfident !== false && numberedPlayerKey(player);
        if (!number) return false;
        return next.players.filter(candidate => candidate.labelConfident !== false
          && numberedPlayerKey(candidate) === number && distance(candidate, action.to) < .04).length === 1
          && !diagram.actions.some(candidate => candidate !== action && candidate.action === "cut"
            && candidate.fromPlayer === screen.fromPlayer && candidate.from && distance(candidate.from, screen.to) < .015)
          && !diagram.actions.slice(diagram.actions.indexOf(screen) + 1, actionIndex).some(candidate =>
            candidate.fromPlayer === screen.fromPlayer && travels(candidate));
      });
      if (corroborated.length !== 1) return action;
      const screen = corroborated[0];
      const cut = { ...action, from: screen.to, fromPlayer: screen.fromPlayer,
        points: action.points?.length ? [screen.to, ...action.points.slice(1)] : undefined,
        confidence: .78, source: "Coupe après écran confirmée par la position sur la phase suivante" };
      recovered.push(cut);
      return cut;
    });
    for (const pass of actions.filter(action => action.action === "pass")) {
      const receivers = recovered.filter(cut => cut.fromPlayer !== pass.fromPlayer && distance(cut.to, pass.to) < .025);
      if (receivers.length !== 1) continue;
      const cut = receivers[0];
      const oldReceiver = diagram.players.find(player => player.key === pass.toPlayer);
      if (oldReceiver && oldReceiver.key !== cut.fromPlayer && distance(oldReceiver, pass.to) < .035) continue;
      const passIndex = actions.indexOf(pass);
      const cutIndex = actions.indexOf(cut);
      const linked = { ...pass, toPlayer: cut.fromPlayer };
      actions.splice(passIndex, 1);
      actions.splice(Math.max(passIndex, cutIndex), 0, linked);
    }
    return { ...diagram, actions: recovered.length ? actions.map((action, index) => ({ ...action, order: index + 1 })) : actions };
  });
}
