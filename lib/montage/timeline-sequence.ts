export type SequenceItem = {
  item_type: string; track?: "video" | "overlay" | "audio";
  clip_start: number; clip_end: number; duration?: number;
  freeze_duration?: number | null; playbackRate?: number; repeatCount?: number;
  sort_order: number; timeline_start?: number;
};
export function montageTrack(item: SequenceItem) {
  return item.track ?? (item.item_type === "clip" || item.item_type === "freeze" ? "video" : item.item_type === "audio" ? "audio" : "overlay");
}
export function montageItemDuration(item: SequenceItem): number {
  if (item.item_type === "clip") {
    const rate = Number.isFinite(item.playbackRate) ? Math.min(4, Math.max(.25, item.playbackRate!)) : 1;
    const repeats = Number.isFinite(item.repeatCount) ? Math.max(1, Math.round(item.repeatCount!)) : 1;
    return Math.max(.1, item.clip_end - item.clip_start) / rate * repeats;
  }
  const duration = item.duration ?? item.freeze_duration ?? (item.item_type === "audio" ? item.clip_end - item.clip_start : 4);
  return Number.isFinite(duration) ? Math.max(.1, duration) : 4;
}
// Only the video track is magnetic. Overlays/audio retain absolute positions;
// annotations are expressed in source-video time and must not be shifted.
export function enforceTimelineSequence<T extends SequenceItem>(items: T[]): T[] {
  let cursor = 0;
  return items.map((item, index) => {
    const duration = montageItemDuration(item);
    if (montageTrack(item) !== "video") return { ...item, sort_order: index, duration };
    const next = { ...item, sort_order: index, timeline_start: cursor, duration };
    cursor += duration;
    return next;
  });
}
