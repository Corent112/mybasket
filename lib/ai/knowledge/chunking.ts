import {
  AI_CHUNK_OVERLAP,
  AI_CHUNK_SIZE,
  AI_MAX_CHUNKS_PER_SOURCE,
} from "@/lib/ai/config";

export type RawChunk = {
  index: number;
  content: string;
  heading: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  tokenCount: number;
};

/** Page extraite d'un document (les .txt/.docx renvoient une seule page). */
export type ExtractedPage = {
  page: number | null;
  text: string;
};

/**
 * Estimation du nombre de tokens. Le français consomme ~4 caractères/token
 * avec les tokenizers OpenAI ; on majore légèrement pour rester prudent.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.6);
}

const HEADING_RE = /^(?:#{1,6}\s+.+|[A-ZÀ-ÖØ-Þ0-9][^\n]{2,80})$/;

function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 90) return false;
  if (trimmed.startsWith("#")) return true;
  if (/[.!?;:,]$/.test(trimmed)) return false;
  const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 3) return false;
  const upperRatio =
    letters.split("").filter((c) => c === c.toUpperCase()).length / letters.length;
  return upperRatio > 0.6 && HEADING_RE.test(trimmed);
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Découpe un texte en respectant, dans l'ordre de préférence :
 * paragraphes → phrases → mots. Conserve un recouvrement entre chunks
 * pour ne pas couper une notion en deux.
 */
export function splitText(
  text: string,
  options?: { size?: number; overlap?: number }
): string[] {
  const size = Math.max(200, options?.size ?? AI_CHUNK_SIZE);
  const overlap = Math.max(0, Math.min(options?.overlap ?? AI_CHUNK_OVERLAP, size - 100));

  const clean = normalize(text);
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const paragraphs = clean.split(/\n{2,}/);
  const pieces: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= size) {
      pieces.push(paragraph);
      continue;
    }
    // Paragraphe trop long : on redescend à la phrase.
    const sentences = paragraph.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ0-9«"(])/);
    let buffer = "";
    for (const sentence of sentences) {
      if (sentence.length > size) {
        if (buffer) {
          pieces.push(buffer);
          buffer = "";
        }
        // Phrase monstrueuse : découpe brute sur les mots.
        const words = sentence.split(/\s+/);
        let wordBuffer = "";
        for (const word of words) {
          if ((wordBuffer + " " + word).trim().length > size) {
            if (wordBuffer) pieces.push(wordBuffer.trim());
            wordBuffer = word;
          } else {
            wordBuffer = (wordBuffer + " " + word).trim();
          }
        }
        if (wordBuffer) pieces.push(wordBuffer.trim());
        continue;
      }
      if ((buffer + " " + sentence).trim().length > size) {
        if (buffer) pieces.push(buffer.trim());
        buffer = sentence;
      } else {
        buffer = (buffer + " " + sentence).trim();
      }
    }
    if (buffer) pieces.push(buffer.trim());
  }

  // Regroupement des petits morceaux + recouvrement.
  const chunks: string[] = [];
  let current = "";

  for (const piece of pieces) {
    if (!current) {
      current = piece;
      continue;
    }
    if ((current + "\n\n" + piece).length <= size) {
      current = current + "\n\n" + piece;
      continue;
    }
    chunks.push(current);
    const tail = overlap > 0 ? current.slice(-overlap) : "";
    const boundary = tail.search(/\s/);
    current = (boundary > -1 ? tail.slice(boundary + 1) : tail) + (tail ? "\n\n" : "") + piece;
    if (current.length > size * 1.5) current = piece;
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.filter((c) => c.trim().length > 0);
}

/**
 * Transforme les pages extraites d'un document en chunks prêts à indexer,
 * en conservant la page d'origine (citations « page X ») et le dernier titre
 * rencontré.
 */
export function buildChunks(pages: ExtractedPage[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  let heading: string | null = null;
  let index = 0;

  for (const page of pages) {
    if (chunks.length >= AI_MAX_CHUNKS_PER_SOURCE) break;

    const clean = normalize(page.text);
    if (!clean) continue;

    // Titre courant : dernière ligne "titre" de la page.
    for (const line of clean.split("\n")) {
      if (looksLikeHeading(line)) heading = line.replace(/^#+\s*/, "").trim();
    }

    for (const content of splitText(clean)) {
      if (chunks.length >= AI_MAX_CHUNKS_PER_SOURCE) break;
      if (content.replace(/\s/g, "").length < 30) continue;

      chunks.push({
        index: index++,
        content,
        heading,
        pageFrom: page.page,
        pageTo: page.page,
        tokenCount: estimateTokens(content),
      });
    }
  }

  return chunks;
}
