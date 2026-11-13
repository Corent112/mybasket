export const COURT_FLOOR_PATTERNS = [
  { id: 'original', label: 'Original' },
  { id: 'straight', label: 'Lames droites' },
  { id: 'honeycomb', label: 'Nid d’abeille' },
  { id: 'diamonds', label: 'Losanges' },
] as const;

export type CourtFloorPattern = typeof COURT_FLOOR_PATTERNS[number]['id'];

export function floorPatternShade(pattern: CourtFloorPattern, x: number, y: number): number {
  if (pattern === 'original') return 0;

  // Coordinates are in full-court units, with the same scale on both axes.
  const row = Math.floor(y * 150);
  const joint = (x * 11 + (row % 3) / 3) % 1;
  const grain = (Math.sin(row * 17.13) + Math.sin(row * 3.17)) * 2;
  const planks = grain - (joint < 0.018 ? 6 : 0);
  if (pattern === 'straight') return planks + (y * 150 % 1 < 0.12 ? -9 : 1);

  if (pattern === 'diamonds') {
    const stripe = Math.floor(y * 5 + x * 2) + Math.floor(y * 5 - x * 2);
    return planks + (stripe % 2 === 0 ? 9 : -13);
  }

  const radius = 0.029;
  const cellHeight = Math.sqrt(3) * radius;
  const column = Math.round(x / (1.5 * radius));
  const offset = (col: number) => Math.abs(col % 2) * cellHeight / 2;
  const cellDistance = (col: number) => {
    const cellRow = Math.round((y - offset(col)) / cellHeight);
    return { col, row: cellRow, distance: (x - col * 1.5 * radius) ** 2 +
      (y - cellRow * cellHeight - offset(col)) ** 2 };
  };
  const cells = [cellDistance(column - 1), cellDistance(column), cellDistance(column + 1)];
  const nearest = cells.reduce((best, cell) => cell.distance < best.distance ? cell : best);
  return planks + [-17, -5, 9][Math.abs((nearest.col * 2 + nearest.row) % 3)];
}
