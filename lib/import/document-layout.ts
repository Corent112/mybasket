/**
 * lib/import/document-layout.ts
 * ---------------------------------------------------------------------------
 * Détection de la STRUCTURE du document avant toute lecture de texte.
 *
 * Principe imposé par le cahier des charges :
 *   image → détection de structure → détection des zones → OCR CIBLÉ par zone
 * et surtout PAS : OCR de toute la page → devinettes a posteriori.
 *
 * Le chrome du site source (HOME PAGE, My profile, Logout, …) est éliminé
 * avant toute chose et ne peut donc jamais finir dans un exercice.
 */

import type { AiRect } from "./types";
import type { OcrBox, OcrResult } from "./ocr";

export type ZoneKey =
  | "title"
  | "organisation"
  | "description"
  | "goals"
  | "variations"
  | "tips"
  | "equipment"
  | "players"
  | "agegroup"
  | "type"
  | "graphic"
  | "author"
  | "publishing";

/** Zones dont le contenu ne doit JAMAIS alimenter un champ de l'exercice. */
export const IGNORED_ZONES: ZoneKey[] = ["author", "publishing", "type"];

export type ZoneLabelHit = {
  key: ZoneKey;
  label: string;
  labelRect: AiRect;
  inline: string;
  column: number;
};

export type DetectedZone = ZoneLabelHit & { rect: AiRect };

export type DocumentLayout = {
  zones: DetectedZone[];
  ignoredChrome: string[];
  columns: Array<{ x0: number; x1: number }>;
  textBounds: AiRect | null;
  /** true quand aucun libellé structurant n'a été trouvé (feuille manuscrite…). */
  unstructured: boolean;
};

const ZONE_PATTERNS: Array<{ key: ZoneKey; rx: RegExp }> = [
  { key: "graphic", rx: /^graphic\s*(?:n\s*[°ºo]?\s*[:.]?\s*\d{0,2})?\b/i },
  { key: "title", rx: /^(?:title|titre|drill\s*name|nom\s*(?:de\s*l['’]exercice|exercice))\b/i },
  {
    key: "organisation",
    rx: /^(?:organisation|mise\s*en\s*place|installation|dispositif|set\s*up|setup)\b/i,
  },
  { key: "description", rx: /^(?:description|d[ée]roulement|d[ée]roul[ée]|d[ée]roulé)\b/i },
  {
    key: "goals",
    rx: /^(?:goals?\s*(?:\/\s*purpose)?\s*(?:\/\s*skills?)?|purpose|skills?|objectifs?|but)\b/i,
  },
  { key: "variations", rx: /^(?:variations?|variantes?|[ée]volutions?)\b/i },
  {
    key: "tips",
    rx: /^(?:tips?\s*(?:\/\s*hints?)?\s*(?:\/\s*emphasis)?|hints?|emphasis|consignes?|points?\s*cl[ée]s?|crit[èe]res?)\b/i,
  },
  { key: "equipment", rx: /^(?:equipment|mat[ée]riel|materiel)\b/i },
  { key: "players", rx: /^(?:players?\s*(?:\/\s*coaches?)?|joueurs?|effectif)\b/i },
  { key: "agegroup", rx: /^(?:age\s*group|cat[ée]gorie|categorie)\b/i },
  { key: "type", rx: /^(?:type)\s*[:：]?\s*$/i },
  { key: "author", rx: /^(?:author|auteur)\b/i },
  { key: "publishing", rx: /^(?:publishing|published|created|updated|last\s*update)\b/i },
];

/** Éléments d'interface du site source : jamais du contenu d'exercice. */
const CHROME_PATTERNS: RegExp[] = [
  /^home\s*page$/i,
  /^home$/i,
  /^my\s*profile$/i,
  /^profile$/i,
  /^practice\s*section$/i,
  /^my\s*drills?$/i,
  /^my\s*practices?$/i,
  /^create\s*drill$/i,
  /^create\s*practice$/i,
  /^coaching\s*clinics?$/i,
  /^clinics?$/i,
  /^log\s*out$/i,
  /^logout$/i,
  /^log\s*in$/i,
  /^login$/i,
  /^sign\s*(?:in|out|up)$/i,
  /^register$/i,
  /^search$/i,
  /^menu$/i,
  /^back$/i,
  /^next$/i,
  /^previous$/i,
  /^print$/i,
  /^download$/i,
  /^upload$/i,
  /^update$/i,
  /^save$/i,
  /^edit$/i,
  /^delete$/i,
  /^remove$/i,
  /^share$/i,
  /^add$/i,
  /^close$/i,
  /^cancel$/i,
  /^ok$/i,
  /^submit$/i,
  /^filter$/i,
  /^sort$/i,
  /^help$/i,
  /^contact$/i,
  /^about$/i,
  /^settings?$/i,
  /^dashboard$/i,
  /^library$/i,
  /^favou?rites?$/i,
  /^copyright/i,
  /^all\s*rights\s*reserved/i,
  /^powered\s*by/i,
  /^cookies?\b/i,
  /^privacy\b/i,
  /^terms\b/i,
  /^www\./i,
  /^https?:\/\//i,
  /^page\s*\d+(?:\s*\/\s*\d+)?$/i,
  /^there\s+are\s+no\s+data$/i,
  /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/,
];

const stripLeading = (value: string) => value.replace(/^[\s|>~•●▪■►*·.\-–—_]+/, "").trim();

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function isChromeLine(text: string): boolean {
  const clean = stripLeading(text);
  if (!clean) return true;
  const flat = normalize(clean);
  if (flat.length <= 1) return true;
  return CHROME_PATTERNS.some((rx) => rx.test(flat));
}

/** Retire tout ce qui ressemble à du chrome du site source. */
export function removeChrome(lines: OcrBox[]): { kept: OcrBox[]; ignored: string[] } {
  const kept: OcrBox[] = [];
  const ignored: string[] = [];
  for (const line of lines) {
    if (isChromeLine(line.text)) ignored.push(line.text.trim());
    else kept.push(line);
  }
  return { kept, ignored };
}

function matchZone(text: string): { key: ZoneKey; label: string; inline: string } | null {
  const clean = stripLeading(text);
  if (!clean) return null;
  for (const { key, rx } of ZONE_PATTERNS) {
    const match = rx.exec(clean);
    if (!match) continue;
    const label = match[0];
    const inline = clean
      .slice(label.length)
      .replace(/^\s*[:：\-–—]?\s*/, "")
      .trim();
    // Un libellé suivi immédiatement d'une phrase longue est probablement du
    // texte courant, pas un en-tête de section.
    if (inline.length > 120) return null;
    return { key, label: label.trim(), inline };
  }
  return null;
}

function buildColumns(lines: OcrBox[], width: number): Array<{ x0: number; x1: number }> {
  if (!lines.length) return [{ x0: 0, x1: width }];
  const starts = lines.map((line) => line.x0).sort((a, b) => a - b);
  const gap = width * 0.14;
  const groups: number[][] = [];
  for (const start of starts) {
    const last = groups[groups.length - 1];
    if (last && start - last[last.length - 1] <= gap) last.push(start);
    else groups.push([start]);
  }
  // On ne garde que les colonnes qui portent réellement plusieurs lignes.
  const solid = groups.filter((group) => group.length >= 2);
  const source = solid.length ? solid : groups;
  const columns = source.map((group) => ({ x0: Math.max(0, Math.min(...group) - width * 0.01), x1: width }));
  columns.sort((a, b) => a.x0 - b.x0);
  for (let i = 0; i < columns.length - 1; i += 1) {
    columns[i].x1 = Math.max(columns[i].x0 + width * 0.08, columns[i + 1].x0 - width * 0.004);
  }
  return columns.length ? columns : [{ x0: 0, x1: width }];
}

const columnOf = (x: number, columns: Array<{ x0: number; x1: number }>): number => {
  for (let i = columns.length - 1; i >= 0; i -= 1) if (x >= columns[i].x0) return i;
  return 0;
};

/**
 * Détecte les zones du document à partir des boîtes OCR de repérage.
 * Aucune valeur n'est lue ici : on ne produit que des rectangles.
 */
export function detectLayout(ocr: OcrResult, width: number, height: number): DocumentLayout {
  const { kept, ignored } = removeChrome(ocr.lines);

  const textBounds: AiRect | null = kept.length
    ? {
        x0: Math.min(...kept.map((l) => l.x0)),
        y0: Math.min(...kept.map((l) => l.y0)),
        x1: Math.max(...kept.map((l) => l.x1)),
        y1: Math.max(...kept.map((l) => l.y1)),
      }
    : null;

  const columns = buildColumns(kept, width);

  const hits: ZoneLabelHit[] = [];
  for (const line of kept) {
    const match = matchZone(line.text);
    if (!match) continue;
    hits.push({
      key: match.key,
      label: match.label,
      inline: match.inline,
      labelRect: { x0: line.x0, y0: line.y0, x1: line.x1, y1: line.y1 },
      column: columnOf(line.x0, columns),
    });
  }

  hits.sort((a, b) => a.column - b.column || a.labelRect.y0 - b.labelRect.y0);

  const zones: DetectedZone[] = hits.map((hit, index) => {
    const column = columns[hit.column] || { x0: 0, x1: width };
    const nextInColumn = hits
      .slice(index + 1)
      .find((other) => other.column === hit.column && other.labelRect.y0 > hit.labelRect.y0);

    const bottomLimit = nextInColumn
      ? nextInColumn.labelRect.y0 - 2
      : Math.min(height, (textBounds?.y1 ?? height) + height * 0.02);

    const maxHeight = height * (hit.key === "description" ? 0.5 : 0.3);
    const y1 = Math.min(bottomLimit, hit.labelRect.y1 + maxHeight);

    return {
      ...hit,
      rect: {
        x0: Math.max(0, column.x0),
        y0: Math.min(height - 2, hit.labelRect.y1 + 1),
        x1: Math.min(width, column.x1),
        y1: Math.max(hit.labelRect.y1 + 8, y1),
      },
    };
  });

  return {
    zones,
    ignoredChrome: ignored,
    columns,
    textBounds,
    unstructured: zones.length === 0,
  };
}

/** Nettoie le texte relu dans une zone : libellé résiduel, placeholders, bruit. */
export function cleanZoneText(text: string, label: string): string {
  const labelFlat = normalize(label).toLowerCase();
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => stripLeading(line))
    .filter((line) => {
      if (!line) return false;
      const flat = normalize(line).toLowerCase();
      if (flat === labelFlat) return false;
      if (/^there\s+are\s+no\s+data$/i.test(flat)) return false;
      if (/^default\s+text\s+for\s+your\s+practice\s+plans$/i.test(flat)) return false;
      if (/^(update|save|edit|delete|print)$/i.test(flat)) return false;
      if (isChromeLine(line)) return false;
      // Bruit OCR : une ligne qui ne contient aucune lettre ni chiffre.
      if (!/[a-zA-ZÀ-ÿ0-9]/.test(line)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

export const toLines = (value: string): string[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** « 1 Balls / 2 Baskets / 0 Cones » → critères matériels. */
export function parseEquipment(text: string): {
  ballons: number | null;
  paniers: number | null;
  plots: number | null;
} {
  const flat = normalize(text).toLowerCase();
  const read = (rx: RegExp): number | null => {
    const match = rx.exec(flat);
    if (!match) return null;
    const value = Number(match[1] ?? match[2]);
    return Number.isFinite(value) ? Math.max(0, Math.min(99, value)) : null;
  };
  return {
    ballons: read(/(?:(\d{1,2})\s*(?:balls?|ballons?|balles?)|(?:balls?|ballons?|balles?)\s*[:=]?\s*(\d{1,2}))/),
    paniers: read(/(?:(\d{1,2})\s*(?:baskets?|hoops?|paniers?)|(?:baskets?|hoops?|paniers?)\s*[:=]?\s*(\d{1,2}))/),
    plots: read(/(?:(\d{1,2})\s*(?:cones?|plots?|c[oô]nes?)|(?:cones?|plots?|c[oô]nes?)\s*[:=]?\s*(\d{1,2}))/),
  };
}

/** « Players / Coaches : 3 » → nombre de joueurs. */
export function parsePlayers(text: string): number | null {
  const flat = normalize(text).toLowerCase();
  const match = /(?:(\d{1,2})\s*(?:players?|joueurs?)|(?:players?|joueurs?)\s*[:=]?\s*(\d{1,2}))/.exec(flat);
  const direct = /^\s*(\d{1,2})\s*$/.exec(flat);
  const value = Number(match?.[1] ?? match?.[2] ?? direct?.[1]);
  return Number.isFinite(value) ? Math.max(1, Math.min(30, value)) : null;
}

const CATEGORIES = ["U9", "U11", "U13", "U15", "U18", "U21"] as const;

export function parseCategory(text: string): string | null {
  const flat = normalize(text).toUpperCase();
  for (const category of CATEGORIES) if (new RegExp(`\\b${category}\\b`).test(flat)) return category;
  if (/\b(SENIORS?|ADULTS?)\b/.test(flat)) return "Senior";
  const age = /\b(?:UNDER|U)\s*(\d{1,2})\b/.exec(flat);
  if (age) {
    const candidate = `U${age[1]}`;
    if ((CATEGORIES as readonly string[]).includes(candidate)) return candidate;
  }
  return null;
}

export function parseDuration(text: string): number | null {
  const flat = normalize(text).toLowerCase();
  const match = /(\d{1,3})\s*(?:min|minutes?|mn)\b/.exec(flat);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 180 ? value : null;
}
