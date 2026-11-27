import { IMPORT_BOX_FIELDS, normalizeBoxText, parseBoxTable, parsePdfBoxPage, type ImportedBoxRow } from "@/lib/historical-boxscores";
import { ocrCanvas, releaseOcr, type OcrBox, type OcrResult } from "./ocr";

function normalizeTableImage(source: HTMLCanvasElement, threshold: number): HTMLCanvasElement {
  const { width, height } = source;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0);
  const data = context.getImageData(0, 0, width, height);
  const histogram = new Uint32Array(256);
  const left = Math.floor(width * .08);
  const right = Math.ceil(width * .92);
  // Some exports have a dark border surrounding a light table body.
  const bodyY = Math.floor(height / 2);
  const bodyLight = (x: number) => data.data[(bodyY * width + x) * 4];
  let bodyLeft = 0;
  let bodyRight = width;
  while (bodyLeft < left && bodyLight(bodyLeft) < 100) bodyLeft++;
  while (bodyRight > right && bodyLight(bodyRight - 1) < 100) bodyRight--;
  for (let y = 0; y < height; y++) {
    histogram.fill(0);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const light = (data.data[i] * 3 + data.data[i + 1] * 6 + data.data[i + 2]) / 10 | 0;
      data.data[i] = light;
      if (x >= left && x < right) histogram[light]++;
    }
    let background = 0;
    let count = histogram[0];
    while (count < (right - left) / 2 && background < 255) count += histogram[++background];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const foreground = background > 135 ? background - data.data[i] : data.data[i] - background;
      const ink = x >= bodyLeft && x < bodyRight && foreground > threshold ? 0 : 255;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = ink;
    }
  }
  context.putImageData(data, 0, 0);
  if (width >= 2200) return canvas;
  const enlarged = document.createElement("canvas");
  enlarged.width = Math.min(2400, Math.round(width * 1.5));
  enlarged.height = Math.round(height * enlarged.width / width);
  enlarged.getContext("2d")?.drawImage(canvas, 0, 0, enlarged.width, enlarged.height);
  return enlarged;
}

const headers = /^(?:player|joueur|nom|name|(?:fg|2p|3p|ft)m-a-?|off|def|tot|ast|st|to|bs|8s|pf|fpf|eff|pts)$/i;
const centerX = (word: OcrBox) => (word.x0 + word.x1) / 2;
const centerY = (word: OcrBox) => (word.y0 + word.y1) / 2;

function headerWords(recognized: OcrResult) {
  const players = recognized.words.filter(word => /^(?:player|joueur)$/i.test(word.text));
  return players.map(player => recognized.words.filter(word => headers.test(word.text) &&
    Math.abs(centerY(word) - centerY(player)) <= Math.max(9, (player.y1 - player.y0) * .35)))
    .filter(words => words.some(word => /^pts$/i.test(word.text)));
}

function rowsFromRecognition(recognized: OcrResult): ImportedBoxRow[][] {
  const knownHeaders = new Set(headerWords(recognized).flat());
  const words = recognized.words.filter(word => word.confidence >= .45 || knownHeaders.has(word));
  const heights = words.map(word => word.y1 - word.y0).sort((a, b) => a - b);
  const scale = 8 / Math.max(1, heights[Math.floor(heights.length / 2)] || 8);
  return parsePdfBoxPage(words.map(word => ({
    str: word.text, x: word.x0 * scale, y: -(word.y0 + word.y1) / 2 * scale, width: (word.x1 - word.x0) * scale,
  })), 3.5);
}

async function verifyUnclearCells(
  source: HTMLCanvasElement, normalizedWidth: number, recognized: OcrResult, rows: ImportedBoxRow[],
) {
  const layouts = headerWords(recognized);
  if (layouts.length !== 1) return;
  const header = layouts[0].sort((a, b) => a.x0 - b.x0);
  const player = header[0];
  const numeric = header.slice(1);
  if (numeric.length < 8 || !/^(player|joueur)$/i.test(player.text)) return;

  const ratio = source.width / normalizedWidth;
  const test = document.createElement("canvas");
  const context = test.getContext("2d");
  if (!context) return;

  // Only re-read ambiguous cells. Their coordinates come from the original
  // headers, so adjacent columns cannot supply a value to fill a gap.
  for (const row of rows.slice(0, 24)) {
    const first = row.name.split(/\s+/)[0];
    const names = recognized.words.filter(word => word.x0 < numeric[0].x0 &&
      word.y0 > player.y1 && normalizeBoxText(word.text) === normalizeBoxText(first));
    if (names.length !== 1) continue;
    const [name] = names;
    const missing = new Set(IMPORT_BOX_FIELDS.filter(([key]) => row.stats[key] == null).map(([key]) => key));
    for (let column = 0; column < numeric.length && missing.size > 1; column++) {
      const word = numeric[column];
      const paired = /m-a/i.test(word.text);
      const probe = parseBoxTable([["Player", word.text, "PTS"], ["Test", paired ? "1-2" : "1", "1"]])[0];
      const fields = Object.keys(probe.stats).filter(key => key !== "pts" || /^pts$/i.test(word.text)) as (keyof typeof row.stats)[];
      if (!fields.some(key => missing.has(key))) continue;
      const cellHalfWidth = Math.min(
        centerX(word) - centerX(numeric[column - 1] ?? player),
        centerX(numeric[column + 1] ?? word) - centerX(word) || Infinity,
        centerX(numeric[1]) - centerX(numeric[0]),
      ) * .43;
      const cellHalfHeight = (name.y1 - name.y0) * .7;
      const width = Math.round(cellHalfWidth * 2 * ratio);
      const height = Math.round(cellHalfHeight * 2 * ratio);
      if (width < 4 || height < 4) continue;
      test.width = width * 3 + 32;
      test.height = height * 3 + 32;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, test.width, test.height);
      context.drawImage(source, (centerX(word) - cellHalfWidth) * ratio, (centerY(name) - cellHalfHeight) * ratio,
        width, height, 16, 16, width * 3, height * 3);
      const result = await ocrCanvas(test, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789-" });
      const value = result.text.trim();
      if (!(paired ? /^\d{1,3}-\d{1,3}$/ : /^-?\d{1,3}$/).test(value) || result.confidence < .65) continue;
      const parsed = parseBoxTable([["Player", word.text, "PTS"], ["Test", value, /^pts$/i.test(word.text) ? value : "1"]])[0];
      for (const key of fields) if (missing.has(key) && parsed.stats[key] != null) {
        row.stats[key] = parsed.stats[key];
        missing.delete(key);
      }
    }
  }
}

export async function readBoxscoreImage(canvas: HTMLCanvasElement): Promise<ImportedBoxRow[][]> {
  try {
    const normalized = normalizeTableImage(canvas, 28);
    const firstRead = await ocrCanvas(normalized, { tessedit_pageseg_mode: "6" });
    const secondRead = await ocrCanvas(normalizeTableImage(canvas, 45), { tessedit_pageseg_mode: "6" });
    const first = rowsFromRecognition(firstRead);
    const second = rowsFromRecognition(secondRead);
    if (!first.length && !second.length) return rowsFromRecognition(await ocrCanvas(canvas, { tessedit_pageseg_mode: "11" }));
    const count = (tables: ImportedBoxRow[][]) => tables.flat().length;
    const primary = count(first) >= count(second) ? first : second;
    const reference = primary === first ? second : first;
    const tables = primary.map((rows, index) => {
      const alternatives = reference[index];
      if (!alternatives || alternatives.length !== rows.length) return rows;
      return rows.map((row, i) => {
        const other = alternatives[i];
        const similarities = row.name.toLowerCase().split(/\s+/).filter(word => other.name.toLowerCase().split(/\s+/).includes(word));
        if (!similarities.length) return row;
        const stats = { ...other.stats, ...row.stats };
        for (const key of Object.keys(stats) as (keyof typeof stats)[]) {
          if (row.stats[key] != null && other.stats[key] != null && row.stats[key] !== other.stats[key]) {
            delete stats[key];
          }
        }
        return { ...row, stats };
      });
    });
    if (tables.length === 1) {
      await verifyUnclearCells(canvas, normalized.width, primary === first ? firstRead : secondRead, tables[0]).catch(() => undefined);
    }
    return tables;
  } finally {
    await releaseOcr();
  }
}
