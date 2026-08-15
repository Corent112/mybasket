import type { ExtractedPage } from "./chunking";
import { AI_ALLOWED_MIME_TYPES, type AiSourceType } from "@/lib/ai/config";

/**
 * Extraction de texte — SERVEUR UNIQUEMENT.
 *
 * PDF   → `unpdf` (build PDF.js pour environnements serverless, texte par page)
 * DOCX  → `mammoth` (conversion en texte brut)
 * TXT / MD / CSV → décodage direct
 *
 * Les imports lourds sont dynamiques : ils ne sont chargés que si un document
 * du type correspondant est réellement traité.
 */

export type ExtractionResult = {
  pages: ExtractedPage[];
  totalCharacters: number;
  indexable: boolean;
  warning?: string;
};

export function resolveSourceType(mimeType: string | null, filename: string | null): AiSourceType {
  if (mimeType && AI_ALLOWED_MIME_TYPES[mimeType]) {
    return AI_ALLOWED_MIME_TYPES[mimeType].sourceType;
  }

  const ext = (filename || "").split(".").pop()?.toLowerCase() || "";
  for (const entry of Object.values(AI_ALLOWED_MIME_TYPES)) {
    if (entry.extensions.includes(ext)) return entry.sourceType;
  }
  return "manual";
}

export function isIndexableType(sourceType: AiSourceType): boolean {
  return ["pdf", "docx", "txt", "markdown", "csv"].includes(sourceType);
}

export async function extractDocumentText(
  buffer: ArrayBuffer,
  sourceType: AiSourceType
): Promise<ExtractionResult> {
  switch (sourceType) {
    case "pdf":
      return extractPdf(buffer);
    case "docx":
      return extractDocx(buffer);
    case "csv":
      return extractCsv(buffer);
    case "txt":
    case "markdown":
      return extractPlain(buffer);
    default:
      return {
        pages: [],
        totalCharacters: 0,
        indexable: false,
        warning:
          "Ce type de fichier est stocké et référencé mais son contenu n'est pas encore indexé (module à venir).",
      };
  }
}

/* --------------------------------------------------------------------- */

async function extractPdf(buffer: ArrayBuffer): Promise<ExtractionResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });

  const pages: ExtractedPage[] = (Array.isArray(text) ? text : [text]).map(
    (content, i) => ({ page: i + 1, text: cleanupPdfText(String(content || "")) })
  );

  const totalCharacters = pages.reduce((sum, p) => sum + p.text.length, 0);

  return {
    pages: pages.filter((p) => p.text.trim().length > 0),
    totalCharacters,
    indexable: true,
    warning:
      totalCharacters < 40
        ? "Aucun texte détecté : ce PDF est probablement scanné (image). Une OCR sera nécessaire."
        : undefined,
  };
}

/**
 * PDF.js concatène parfois les fragments sans espace et coupe les mots en fin
 * de ligne. On répare le minimum pour ne pas polluer les embeddings.
 */
function cleanupPdfText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/([a-zà-ÿ])-\n([a-zà-ÿ])/g, "$1$2") // césures
    .replace(/([^\n])\n([a-zà-ÿ])/g, "$1 $2") // retours de ligne au fil du texte
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocx(buffer: ArrayBuffer): Promise<ExtractionResult> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  const text = String(result?.value || "").trim();

  return {
    pages: text ? [{ page: null, text }] : [],
    totalCharacters: text.length,
    indexable: true,
    warning: text ? undefined : "Aucun texte extrait du document Word.",
  };
}

function extractPlain(buffer: ArrayBuffer): ExtractionResult {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer).trim();
  return {
    pages: text ? [{ page: null, text }] : [],
    totalCharacters: text.length,
    indexable: true,
  };
}

/**
 * CSV : on reconstruit des phrases « colonne : valeur » car une ligne de CSV
 * brute produit des embeddings de très mauvaise qualité.
 */
function extractCsv(buffer: ArrayBuffer): ExtractionResult {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buffer).trim();
  if (!raw) return { pages: [], totalCharacters: 0, indexable: true };

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { pages: [], totalCharacters: 0, indexable: true };

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);

  const rows = lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line, delimiter);
    const parts = headers
      .map((header, j) => {
        const value = (cells[j] || "").trim();
        return value ? `${header.trim()} : ${value}` : null;
      })
      .filter(Boolean);
    return `Ligne ${i + 1} — ${parts.join(" ; ")}`;
  });

  const text = rows.join("\n");

  return {
    pages: [{ page: null, text }],
    totalCharacters: text.length,
    indexable: true,
  };
}

function detectDelimiter(line: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = line.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}
