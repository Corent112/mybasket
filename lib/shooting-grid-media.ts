/** Reads legacy single drawings and native Plaquette multi-phase results. */
export function shootingGridImages(grid: { court_schema_url?: string | null; court_schema_data?: any }): string[] {
  const images = grid.court_schema_data?.schemaImages;
  const candidates = Array.isArray(images) && images.length ? images : [grid.court_schema_url];
  return [...new Set(candidates.filter((image): image is string => typeof image === 'string' && !!image))];
}
export function appendShootingGridSchemas(existing: any, incoming: any) {
  const schemaImages = [...shootingGridImages(existing), ...shootingGridImages({ court_schema_data: incoming })];
  return {
    ...(existing.court_schema_data || {}),
    ...incoming,
    schemaImages,
    schemaDataList: [...(existing.court_schema_data?.schemaDataList || []), ...(incoming.schemaDataList || [])],
  };
}
