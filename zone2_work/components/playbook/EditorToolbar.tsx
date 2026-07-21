"use client";

import Link from "next/link";

interface Props {
  title: string;
  onTitleChange: (v: string) => void;
  onSave: () => void;
  onClear: () => void;
  onToggleCourt: () => void;
  onExportPdf: () => void;
}

const TOOLS = [
  { id: "draw",    icon: "✏️", label: "Draw",    active: true  },
  { id: "animate", icon: "▶",  label: "Animate", active: false },
  { id: "notes",   icon: "📝", label: "Notes",   active: false },
  { id: "png",     icon: "📤", label: "PNG",     active: false },
  { id: "video",   icon: "🎬", label: "Vidéo",   active: false },
  { id: "json",    icon: "📋", label: "JSON",    active: false },
];

export default function EditorToolbar({
  title, onTitleChange, onSave, onClear, onToggleCourt, onExportPdf,
}: Props) {
  return (
    <div className="ed-toolbar">
      <Link href="/" className="ed-tool">
        <span className="icn">✕</span>
        <span>Close</span>
      </Link>

      {TOOLS.map((t) => (
        <div
          key={t.id}
          className={`ed-tool${t.active ? " active" : ""}`}
          title={t.label}
        >
          <span className="icn">{t.icon}</span>
          <span>{t.label}</span>
        </div>
      ))}

      <input
        type="text"
        className="ed-title"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Titre du play"
      />

      <div className="ed-icn-btn" title="Annuler">↶</div>
      <div className="ed-icn-btn" title="Refaire">↷</div>
      <div
        className="ed-icn-btn"
        title="Demi / Complet"
        onClick={onToggleCourt}
      >
        ⇄
      </div>
      <div className="ed-icn-btn" title="Tout effacer" onClick={onClear}>
        🗑
      </div>

      <div className="ed-save" onClick={onSave}>
        💾 Save Play
      </div>

      <div className="ed-icn-btn" title="Export PDF" onClick={onExportPdf}>
        📄
      </div>
    </div>
  );
}