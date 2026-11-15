export const COURT_FLOOR_PATTERNS = [
  { id: 'original', preview: '/plaquette/parquets/original-preview.webp', label: 'Original' },
  { id: 'straight', preview: '/plaquette/parquets/straight-preview.webp', label: 'Lames droites' },
  { id: 'honeycomb', preview: '/plaquette/parquets/honeycomb-preview.webp', label: 'Nid d’abeille' },
  { id: 'pale-maple', label: 'Érable pâle · lames droites', url: '/plaquette/parquets/erable-pale.webp' },
  { id: 'milwaukee', label: 'Milwaukee · grand losange en bois clair', url: '/plaquette/parquets/milwaukee-clair.webp' },
  { id: 'boston', label: 'Boston', url: '/plaquette/parquets/boston.webp' },
  { id: 'brooklyn', label: 'Brooklyn', url: '/plaquette/parquets/brooklyn.webp' },
] as const;

export type CourtFloorPattern = typeof COURT_FLOOR_PATTERNS[number]['id'];

export function floorPatternShade(pattern: CourtFloorPattern, x: number, y: number): number {
  if (pattern !== 'straight' && pattern !== 'honeycomb') return 0;

  // Coordinates are in full-court units, with the same scale on both axes.
  const row = Math.floor(y * 150);
  const joint = (x * 11 + (row % 3) / 3) % 1;
  const grain = (Math.sin(row * 17.13) + Math.sin(row * 3.17)) * 2;
  const planks = grain - (joint < 0.018 ? 6 : 0);
  if (pattern === 'straight') return planks + (y * 150 % 1 < 0.12 ? -9 : 1);

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
