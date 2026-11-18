/** Reuse existing previews only: no drawing rendering or extra database read per card. */
export function schemaPreviewImages(input: unknown): string[] {
  const schemas: string[] = [], photos: string[] = [];
  const seen = new WeakSet<object>();
  const add = (list: string[], value: unknown) => {
    if (typeof value === 'string' && value.trim()) list.push(value);
    else if (Array.isArray(value)) value.forEach(image => { if (typeof image === 'string' && image.trim()) list.push(image); });
  };
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return; }
    const row = value as Record<string, unknown>;
    // Keep the exercise diagram order, then collect all exported phase images.
    if (Array.isArray(row.diagrams)) row.diagrams.forEach(diagram => visit(diagram, depth + 1));
    for (const key of ['schemaImages', 'schema_images', 'schemaImage', 'schema_image', 'imageData', 'imageUrl', 'situation_image_url']) add(schemas, row[key]);
    for (const key of ['schemaDataList', 'schema_data_list', 'phases', 'practice_session_exercises', 'exercises', 'exercise_snapshot', 'snapshot']) visit(row[key], depth + 1);
    for (const key of ['images', 'image', 'image_url']) add(photos, row[key]);
  };
  visit(input, 0);
  return [...new Set(schemas.length ? schemas : photos)];
}
