import type { DrawingOptionPhase } from "./drawing-options";

export type ExerciseDrawingGroup = { id: string; label: string; images: string[] };
type Schema = { current?: number; phases?: DrawingOptionPhase[] };

export function exerciseDrawingMarkers(images: string[], schemas?: Schema[] | null, legacy?: Schema | null) {
  return images.map((_, index) => {
    const schema = schemas?.[index];
    const option = schema?.phases?.[schema.current ?? index]?.option ?? (!schema ? legacy?.phases?.[index]?.option : undefined);
    return option?.id ? { id: option.id, label: option.name || "Option" } : null;
  });
}

export function exerciseDrawingGroups(images: string[], schemas?: Schema[] | null, legacy?: Schema | null): ExerciseDrawingGroup[] {
  const markers = exerciseDrawingMarkers(images, schemas, legacy);
  if (!markers.some(Boolean)) return [];
  const groups = new Map<string, ExerciseDrawingGroup>();
  images.forEach((image, index) => {
    if (!image) return;
    const marker = markers[index] ?? { id: "", label: "Début commun" };
    const group = groups.get(marker.id) ?? { ...marker, images: [] };
    if (!group.images.includes(image)) group.images.push(image);
    groups.set(marker.id, group);
  });
  return [...groups.values()].sort((a,b) => Number(Boolean(a.id)) - Number(Boolean(b.id)));
}

export function selectedDrawingGroups(groups: ExerciseDrawingGroup[], selected?: string[]): ExerciseDrawingGroup[] {
  return groups.filter(group => !group.id || selected === undefined || selected.includes(group.id));
}

export function savedExerciseDrawingGroups(notes: unknown, position: number | null | undefined): ExerciseDrawingGroup[] | undefined {
  try {
    const parsed = typeof notes === "string" ? JSON.parse(notes) : notes;
    const groups: unknown = parsed?.exercise_drawing_groups?.[String(position)];
    if (!Array.isArray(groups)) return undefined;
    return groups.flatMap(group => typeof group?.id === "string" && typeof group.label === "string" && Array.isArray(group.images)
      ? [{ id: group.id, label: group.label, images: group.images.filter((url: unknown): url is string => typeof url === "string" && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) || /^data:image\//i.test(url))) }]
      : []);
  } catch { return undefined; }
}
