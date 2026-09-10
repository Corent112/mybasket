/**
 * Bouchon OCR pour la batterie de tests.
 * Tesseract ne tourne pas dans ce harnais : la batterie mesure la VISION
 * (géométrie, jetons, tracés), pas la lecture de texte. C'est une limite
 * assumée et documentée, pas un contournement silencieux.
 */
import type { AiRect } from "../lib/import/types";

export type OcrBox = { text: string; x0: number; y0: number; x1: number; y1: number; confidence: number };
export type OcrResult = { text: string; lines: OcrBox[]; words: OcrBox[]; confidence: number };

export async function releaseOcr(): Promise<void> {}
export async function ocrCanvas(_canvas: HTMLCanvasElement): Promise<OcrResult> {
  return { text: "", lines: [], words: [], confidence: 0 };
}
export async function ocrRegion(_c: HTMLCanvasElement, _r: AiRect, _t = 1900): Promise<OcrResult> {
  return { text: "", lines: [], words: [], confidence: 0 };
}
export async function ocrToken(_c: HTMLCanvasElement, _rect: AiRect): Promise<{ text: string; confidence: number } | null> {
  return null;
}
