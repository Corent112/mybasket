import type { DrawingOptionPhase } from "../drawing-options";
import type { AiPoint } from "./types";
import { numberedPlayerKey } from "./diagram-roster";

type Player = AiPoint & { id: string; label: string; team: "att" | "def"; coach?: boolean; hasBall?: boolean; ballCount?: number };
type Line = { action: string; from: AiPoint; to: AiPoint; order?: number; sourcePlayerId?: string; targetPlayerId?: string;
  returnPlayerId?: string; points?: AiPoint[]; ctrls?: AiPoint[]; ctrl?: AiPoint; importSource?: string };
type Phase = DrawingOptionPhase & { photoImported?: boolean; players: Player[]; lines: Line[] };

const isImported = (phase: Phase) => phase.photoImported || phase.lines.some(line => Boolean(line.importSource))
  || phase.players.some(player => "importType" in player || "importConfidence" in player);

export function linkImportedDrawingPhases<T extends Phase>(phases: T[]): T[] {
  if (!phases.some(isImported)) return phases;
  const linked: T[] = [];
  for (const [index, phase] of phases.entries()) {
    if (!isImported(phase)) { linked.push(phase); continue; }
    const adjacent = linked[index - 1];
    const previous = adjacent && adjacent.option?.id === phase.option?.id ? adjacent : undefined;
    const previousPlayers = new Map(previous?.players.flatMap(player => {
      const key = numberedPlayerKey(player);
      return key ? [[key, { ...player }] as const] : [];
    }));
    const previousById = new Map([...previousPlayers.values()].map(player => [player.id, player]));
    for (const line of previous?.lines.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) ?? []) {
      const player = line.sourcePlayerId ? previousById.get(line.sourcePlayerId) : undefined;
      if (player && ["cut", "screen", "dribble"].includes(line.action)) Object.assign(player, line.to);
    }

    const aliases = new Map<string, string>();
    const seen = new Map<string, string>();
    const players = phase.players.flatMap(player => {
      const key = numberedPlayerKey(player);
      if (!key) return [player];
      const prior = previousPlayers.get(key);
      const duplicate = seen.get(key);
      const id = duplicate ?? prior?.id ?? player.id;
      aliases.set(player.id, id);
      if (duplicate) return [];
      seen.set(key, id);
      return [{ ...player, id, ...(prior ? { x: prior.x, y: prior.y } : {}) }];
    });
    for (const [key, player] of previousPlayers) {
      if (!seen.has(key)) players.push({ ...player, hasBall: false, ballCount: 0 });
    }

    const resolve = (id: string | undefined) => id === undefined ? undefined : aliases.get(id) ?? id;
    const positions = new Map(players.map(player => [player.id, { x: player.x, y: player.y }]));
    const lines = phase.lines.slice();
    for (const { line, i } of lines.map((line, i) => ({ line, i })).sort((a, b) => (a.line.order ?? a.i) - (b.line.order ?? b.i))) {
      const sourcePlayerId = resolve(line.sourcePlayerId), targetPlayerId = resolve(line.targetPlayerId);
      const from = sourcePlayerId ? positions.get(sourcePlayerId) ?? line.from : line.from;
      const to = line.to;
      const dx = from.x - line.from.x, dy = from.y - line.from.y;
      const shift = (point: AiPoint, fraction: number) => ({ x: point.x + dx * fraction, y: point.y + dy * fraction });
      lines[i] = {
        ...line, from, sourcePlayerId, targetPlayerId, returnPlayerId: resolve(line.returnPlayerId),
        ...(dx || dy ? {
          points: line.points?.map((point, j, all) => shift(point, 1 - j / Math.max(1, all.length - 1))),
          ctrls: line.ctrls?.map((point, j, all) => shift(point, 1 - (j + 1) / (all.length + 1))),
          ctrl: line.ctrl && shift(line.ctrl, .5),
        } : {}),
      };
      if (sourcePlayerId && ["cut", "screen", "dribble"].includes(line.action)) positions.set(sourcePlayerId, to);
    }
    linked.push({ ...phase, photoImported: true, players, lines });
  }
  return linked;
}
