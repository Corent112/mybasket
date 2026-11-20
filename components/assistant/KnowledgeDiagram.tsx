import { diagramImageUrl } from "@/lib/ai/knowledge/document-answer";
import type { AiCitation } from "@/lib/ai/knowledge/types";

export default function KnowledgeDiagram({ citations }: { citations?: AiCitation[] }) {
  const image = diagramImageUrl(citations?.find((citation) => citation.kind === "term" && citation.diagramUrl)?.diagramUrl);
  if (!image) return null;

  return (
    <a href={image} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le schéma en grand">
      {/* eslint-disable-next-line @next/next/no-img-element -- Schema URLs are managed in the knowledge base. */}
      <img src={image} alt="Schéma associé à la définition" loading="lazy" referrerPolicy="no-referrer" style={{ display: "block", maxWidth: "100%", maxHeight: 260, margin: "8px 0", objectFit: "contain" }} />
    </a>
  );
}
