export const closeOutColors = {
  white: { label: "blanc", fill: "#ffffff" },
  green: { label: "vert", fill: "#22834b" },
  orange: { label: "orange", fill: "#f08922" },
  red: { label: "rouge", fill: "#c73447" },
} as const;

export type CloseOutColor = keyof typeof closeOutColors;
const closeOutOrder: CloseOutColor[] = ["white", "green", "orange", "red"];
export function nextCloseOut(color?: CloseOutColor) {
  return closeOutOrder[(closeOutOrder.indexOf(color ?? "white") + 1) % closeOutOrder.length];
}

export const defensiveInk = "#087a9c";
export type CourtPoint = { x: number; y: number };
export type DefenseArrow = { from: CourtPoint; to: CourtPoint };
export type PhaseDefense = { arrows: DefenseArrow[]; includeInPdf?: boolean };
export type ScoutingDefense = Record<string, Record<number, PhaseDefense>>;

export function defensiveArrowHead(from: CourtPoint, to: CourtPoint, maxLength: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = Math.min(maxLength, Math.hypot(to.x - from.x, to.y - from.y) * .45);
  return [-.55, .55].map(offset => ({
    x: to.x - length * Math.cos(angle + offset),
    y: to.y - length * Math.sin(angle + offset),
  }));
}
