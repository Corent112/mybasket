"use client";

import { useRef, useState, type PointerEvent } from "react";
import { defensiveArrowHead, defensiveInk, type CourtPoint, type DefenseArrow, type PhaseDefense } from "@/lib/scouting-defense";

export default function ScoutingDefenseOverlay({ src, title, value, onChange }: {
  src: string; title: string; value?: PhaseDefense; onChange: (value: PhaseDefense) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DefenseArrow | null>(null);
  const pointer = useRef<{ id: number; from: CourtPoint } | null>(null);
  const arrows = value?.arrows ?? [];
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    return { x: clamp(100 * (event.clientX - bounds.left) / bounds.width), y: clamp(100 * (event.clientY - bounds.top) / bounds.height) };
  };
  const save = (next: DefenseArrow[]) => onChange({ ...value, arrows: next });

  return <figure style={{ margin: "10px 0", maxWidth: 540 }}>
    <div style={{ position: "relative" }}>
      <img src={src} alt={title} draggable={false} style={{ display: "block", width: "100%", margin: 0 }} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: editing ? "auto" : "none", touchAction: editing ? "none" : "auto", cursor: "crosshair" }}
        onPointerDown={event => {
          if (!editing || pointer.current || event.button !== 0) return;
          const from = point(event);
          pointer.current = { id: event.pointerId, from };
          event.currentTarget.setPointerCapture(event.pointerId);
          setDraft({ from, to: from });
        }}
        onPointerMove={event => {
          if (pointer.current?.id === event.pointerId) setDraft({ from: pointer.current.from, to: point(event) });
        }}
        onPointerUp={event => {
          const current = pointer.current;
          if (current?.id !== event.pointerId) return;
          const to = point(event);
          pointer.current = null;
          setDraft(null);
          if (Math.hypot(to.x - current.from.x, to.y - current.from.y) >= 1.5) {
            save([...arrows, { from: current.from, to }]);
          }
        }}
        onLostPointerCapture={() => { pointer.current = null; setDraft(null); }}>
        {[...arrows, ...(draft ? [draft] : [])].map(({ from, to }, i) => {
          const [left, right] = defensiveArrowHead(from, to, 4);
          return <path key={i} d={`M${from.x},${from.y} L${to.x},${to.y} M${left.x},${left.y} L${to.x},${to.y} L${right.x},${right.y}`}
            fill="none" stroke={defensiveInk} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />;
        })}
      </svg>
    </div>
    <figcaption style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
      <button type="button" aria-pressed={editing} onClick={() => setEditing(on => !on)}>
        {editing ? "Terminer le dessin" : "Dessiner notre réponse défensive"}
      </button>
      {arrows.length > 0 && <>
        <button type="button" onClick={() => save(arrows.slice(0, -1))}>Retirer la dernière flèche</button>
        <label><input type="checkbox" checked={value?.includeInPdf !== false}
          onChange={event => onChange({ arrows, includeInPdf: event.target.checked })} /> Inclure la réponse dans le PDF</label>
      </>}
      {editing && <small>Glisse du point de départ vers l’arrivée pour tracer une flèche bleue.</small>}
    </figcaption>
  </figure>;
}
