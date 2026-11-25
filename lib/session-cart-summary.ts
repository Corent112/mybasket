export const SESSION_CART_TYPES = ["exercise", "system", "session"] as const;

/** Same default as the generated practice sheet. */
export function sessionCartMinutes(row: { duration_minutes: number | null }): number {
  const minutes = Number(row.duration_minutes ?? 15);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : 15;
}

export function sessionCartTotal(rows: { duration_minutes: number | null }[]): number {
  return rows.reduce((sum, row) => sum + sessionCartMinutes(row), 0);
}

/** Normalize repeated/legacy ranks after moving a row in the displayed order. */
export function reorderedSessionCart<T extends { id: string; sort_order: number | null }>(
  rows: readonly T[], id: string, direction: "up" | "down"
): T[] | null {
  const index = rows.findIndex(row => row.id === id);
  const target = index + (direction === "up" ? -1 : 1);
  if (index < 0 || target < 0 || target >= rows.length) return null;
  const ordered = [...rows];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.map((row, sort_order) => ({ ...row, sort_order }));
}
