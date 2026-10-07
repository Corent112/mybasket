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
  const received = previous && target.getItem(`${incomingMontageKey(userId, teamId)}:received:${previous.transferId}`) === "1";
  const next = { ...clip, transferId: previous && !received ? previous.transferId : crypto.randomUUID() };
  if (!storage) window.localStorage.removeItem(`${incomingMontageKey(userId, teamId)}:received:${next.transferId}`);
  target.setItem(incomingMontageKey(userId, teamId), JSON.stringify([...rows.filter(row => row.actionId !== clip.actionId), next]));
  if (!storage) window.dispatchEvent(new Event(MONTAGE_INCOMING_EVENT));
}
export function acknowledgeIncomingClip(userId: string, teamId: string, transferId: string, storage: QueueStorage = window.localStorage) {
  const rows = readIncomingClips(userId, teamId, storage);
  storage.setItem(incomingMontageKey(userId, teamId), JSON.stringify(rows.filter(row => row.transferId !== transferId)));
}

// A single named destination; reusing it must not reload an unsaved timeline.
export function openMontageDestination(teamId: string): Window | null {
  const destination = window.open("", "mybasket-montage-studio");
  if (!destination) return null;
  const url = `/montages?${new URLSearchParams({ teamId })}`;
  try {
    if (destination.location.pathname !== "/montages" || new URLSearchParams(destination.location.search).get("teamId") !== teamId) destination.location.assign(url);
    destination.focus();
  } catch { destination.location.assign(url); }
  return destination;
}
export function markIncomingReceived(userId: string, teamId: string, transferId: string) {
  window.localStorage.setItem(`${incomingMontageKey(userId, teamId)}:received:${transferId}`, "1");
}
export async function waitForIncomingReceipt(userId: string, teamId: string, transferId: string, timeoutMs = 15000): Promise<boolean> {
  const key = `${incomingMontageKey(userId, teamId)}:received:${transferId}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (window.localStorage.getItem(key) === "1") return true;
    await new Promise(resolve => window.setTimeout(resolve, 250));
  }
  return false;
}
