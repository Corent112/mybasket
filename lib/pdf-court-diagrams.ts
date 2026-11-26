import type { jsPDF } from "jspdf";

export const DEFAULT_COURTS_PER_ROW = 2;
export const SCOUTING_COURTS_PER_ROW = [1, 2, 3, 4, 5] as const;
export type ScoutingCourtsPerRow = typeof SCOUTING_COURTS_PER_ROW[number];

export function scoutingCourtsPerRow(value: unknown): ScoutingCourtsPerRow {
  return SCOUTING_COURTS_PER_ROW.find(count => count === value) ?? DEFAULT_COURTS_PER_ROW;
}

export function courtDiagramLayout(availableWidth: number, courtsPerRow: number, showPhaseNumbers: boolean) {
  const gap = 5;
  const width = (availableWidth - gap * (courtsPerRow - 1)) / courtsPerRow;
  const height = width * 0.72;
  const rowHeight = height + (showPhaseNumbers ? 18 : 13);
  return { gap, width, height, rowHeight };
}

export function drawCourtDiagram(
  pdf: jsPDF,
  image: string | null,
  x: number,
  y: number,
  { width, height }: ReturnType<typeof courtDiagramLayout>,
  phaseNumber?: number,
) {
  let placeholder = "Schéma non disponible";
  if (image) {
    try {
      pdf.addImage(image, "PNG", x, y, width, height);
      placeholder = "";
    } catch {
      placeholder = "Schéma non exportable";
    }
  }
  if (placeholder) {
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(placeholder, x + width / 2, y + height / 2, { align: "center" });
  }
  if (phaseNumber !== undefined) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(50);
    pdf.text(`Phase ${phaseNumber}`, x + width / 2, y + height + 5, { align: "center" });
  }
}
