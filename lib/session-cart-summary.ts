export const SESSION_CART_TYPES = ["exercise", "system", "session"] as const;

/** Same default as the generated practice sheet. */
export function sessionCartMinutes(row: { duration_minutes: number | null }): number {
  const minutes = Number(row.duration_minutes ?? 15);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : 15;
}

export function sessionCartTotal(rows: { duration_minutes: number | null }[]): number {
  return rows.reduce((sum, row) => sum + sessionCartMinutes(row), 0);
}
