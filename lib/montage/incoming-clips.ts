export const MONTAGE_INCOMING_EVENT = "mybasket:montage-incoming";
export type IncomingMontageClip = {
  transferId: string; actionId: string; matchId?: string | null;
  clipStart: number | null; clipEnd: number | null; title?: string; note?: string;
};
type QueueStorage = Pick<Storage, "getItem" | "setItem">;
export const incomingMontageKey = (userId: string, teamId: string) =>
  `mybasket:montage-incoming:${userId}:${teamId}`;

export function readIncomingClips(userId: string, teamId: string, storage: QueueStorage = window.localStorage): IncomingMontageClip[] {
  const raw = storage.getItem(incomingMontageKey(userId, teamId));
  if (!raw) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error("Le transfert Montage est illisible.");
  return rows as IncomingMontageClip[];
}
export function enqueueIncomingClip(userId: string, teamId: string, clip: Omit<IncomingMontageClip, "transferId">, storage?: QueueStorage) {
  const target = storage ?? window.localStorage;
  const rows = readIncomingClips(userId, teamId, target);
  // Repeated clicks before the receiving window opens update the same request.
  const previous = rows.find(row => row.actionId === clip.actionId);
  const next = { ...clip, transferId: previous?.transferId ?? crypto.randomUUID() };
  target.setItem(incomingMontageKey(userId, teamId), JSON.stringify([...rows.filter(row => row.actionId !== clip.actionId), next]));
  if (!storage) window.dispatchEvent(new Event(MONTAGE_INCOMING_EVENT));
}
export function acknowledgeIncomingClip(userId: string, teamId: string, transferId: string, storage: QueueStorage = window.localStorage) {
  const rows = readIncomingClips(userId, teamId, storage);
  storage.setItem(incomingMontageKey(userId, teamId), JSON.stringify(rows.filter(row => row.transferId !== transferId)));
}
