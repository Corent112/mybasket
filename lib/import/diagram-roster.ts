import type { AiDiagramPlayer, AiExerciseDiagram } from "./types";

export function numberedPlayerKey(player: AiDiagramPlayer): string | undefined {
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
