import type { Exercise } from '@/types/exercise';

export function exerciseDrawingEntries(exercise: Exercise): any[] {
  return exercise.schemaDataList?.length ? exercise.schemaDataList : exercise.schemaData ? [exercise.schemaData] : [];
}

export function exerciseDrawingGroups(exercise: Exercise): { index: number; title: string; editable: boolean; image: string }[] {
  const seen = new Set<string>();
  return exerciseDrawingEntries(exercise).flatMap((entry, index) => {
    const key = entry?.schemaGroupId || `entry:${index}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ index, title: entry?.title || `Schéma ${seen.size}`, editable: Array.isArray(entry?.phases) && entry.phases.length > 0,
      image: entry?.imageData || exercise.schemaImages?.[index] || exercise.schemaImage || '' }];
  });
}

/** Replace only the opened drawing group; other drawings and exercise fields stay intact. */
export function replaceExerciseDrawingGroup(exercise: Exercise, index: number, replacement: any[]) {
  const entries = exerciseDrawingEntries(exercise);
  if (!entries[index] || !replacement.length) throw new Error('Le schéma source est introuvable. Rouvre l’exercice.');
  const groupId = entries[index]?.schemaGroupId;
  const schemaDataList: any[] = [];
  const schemaImages: string[] = [];
  let inserted = false;
  entries.forEach((entry, position) => {
    if (position === index || (groupId && entry?.schemaGroupId === groupId)) {
      if (!inserted) {
        replacement.forEach(item => { schemaDataList.push(item); schemaImages.push(item.imageData); });
        inserted = true;
      }
    } else {
      schemaDataList.push(entry);
      schemaImages.push(exercise.schemaImages?.[position] || entry?.imageData || '');
    }
  });
  // Some old exercises also contain image-only drawings without editable metadata.
  for (let position = entries.length; position < (exercise.schemaImages?.length || 0); position++) schemaImages.push(exercise.schemaImages![position]);
  // updateExercise serializes schemaVideo from its camel-case field; pass it explicitly.
  return { schemaDataList, schemaData: schemaDataList[0], schemaImages, schemaImage: schemaImages[0] || '', schemaVideo: exercise.schemaVideo || '' };
}
