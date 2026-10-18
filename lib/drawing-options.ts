/** Optional metadata inside existing schema_data.phases; old linear systems stay valid. */
export type DrawingOption = { id: string; name: string; fromPhaseId: string };
export type DrawingOptionPhase = { phaseId?: string; option?: DrawingOption };

export function drawingOptions(phases: DrawingOptionPhase[]): DrawingOption[] {
  const seen = new Set<string>();
  return phases.flatMap(phase => {
    if (!phase.option || seen.has(phase.option.id)) return [];
    seen.add(phase.option.id);
    return [phase.option];
  });
}

export function drawingPath(phases: DrawingOptionPhase[], optionId?: string | null): number[] {
  const option = drawingOptions(phases).find(item => item.id === optionId);
  const anchor = option ? phases.findIndex(phase => phase.phaseId === option.fromPhaseId) : -1;
  return phases.flatMap((phase, index) => (
    option ? ((!phase.option && (anchor < 0 || index <= anchor)) || phase.option?.id === option.id)
      : !phase.option
  ) ? [index] : []);
}

export function addDrawingOption<T extends DrawingOptionPhase>(
  phases: T[], anchorIndex: number, continuation: T, name: string, makeId: () => string,
): { phases: T[]; current: number; optionId: string } {
  if (!phases[anchorIndex]) throw new Error('Phase source introuvable.');
  const next = phases.map(phase => ({ ...phase, phaseId: phase.phaseId || makeId() }));
  const existing = drawingOptions(next);
  const anchorId = existing[0]?.fromPhaseId || next[anchorIndex].phaseId;
  const anchor = next.findIndex(phase => phase.phaseId === anchorId);
  if (anchor < 0) throw new Error('Le début commun de ces options est introuvable.');
  // Existing continuation becomes the first option, preserving every phase and action.
  if (!existing.length && anchor < next.length - 1) {
    const original = { id: makeId(), name: 'Option 1', fromPhaseId: anchorId };
    for (let index = anchor + 1; index < next.length; index++) next[index] = { ...next[index], option: original };
  }
  const option = { id: makeId(), name: name.trim() || `Option ${drawingOptions(next).length + 1}`, fromPhaseId: anchorId };
  const phase = JSON.parse(JSON.stringify(continuation)) as T;
  next.push({ ...phase, phaseId: makeId(), option });
  return { phases: next, current: next.length - 1, optionId: option.id };
}

/** Delete only the chosen branch; the other branches keep their names and contents. */
export function removeDrawingOption<T extends DrawingOptionPhase>(phases: T[], optionId: string): T[] {
  return phases.filter(phase => phase.option?.id !== optionId);
}
