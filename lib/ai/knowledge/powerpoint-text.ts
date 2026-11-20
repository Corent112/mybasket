import { strFromU8, unzipSync } from "fflate";

export const MAX_LOCAL_POWERPOINT_BYTES = 300 * 1024 * 1024;
const MAX_XML_BYTES = 30_000_000;

export function isPowerPointTextEntry(name: string): boolean {
  return /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(name);
}

/** Extract text with slide and note labels without sending media. */
export function extractLargePowerPointText(input: Uint8Array): string {
  if (input.byteLength > MAX_LOCAL_POWERPOINT_BYTES) {
    throw new Error("Ce PowerPoint dépasse 300 Mo. Divise la présentation avant l’import.");
  }

  let total = 0;
  const entries = unzipSync(input, {
    filter(entry) {
      if (!isPowerPointTextEntry(entry.name)) return false;
      total += entry.originalSize;
      if (entry.originalSize > 4_000_000 || total > MAX_XML_BYTES) {
        throw new Error("Le texte du PowerPoint est trop volumineux. Divise la présentation.");
      }
      return true;
    },
  });

  const paragraphs = Object.entries(entries)
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .flatMap(([name, bytes]) => {
      const text = Array.from(strFromU8(bytes).matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g), ([, content]) =>
        content.replace(/&(lt|gt|quot|apos|amp);/g, (entity) =>
          ({ "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&amp;": "&" })[entity] ?? entity,
        ),
      ).join("\n").trim();
      const number = name.match(/(\d+)\.xml$/)?.[1];
      return text ? [`${name.includes("/notesSlides/") ? "Notes" : "Diapositive"} ${number}\n${text}`] : [];
    });
  if (!paragraphs.length) throw new Error("Ce PowerPoint ne contient pas de texte lisible.");
  return paragraphs.join("\n\n");
}
