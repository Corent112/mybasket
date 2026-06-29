"use client";

import { useState } from "react";
import type { Phase, Play } from "@/types/playbook";

interface Props {
  phases: Phase[];
  currentPhase: number;
  onSelectPhase: (i: number) => void;
  onNext: () => void;
  onClone: () => void;
  onEmpty: () => void;
  onDelete: () => void;
  savedPlays: Play[];
  onLoadPlay: (id: string) => void;
}

export default function EditorSidebarLeft({
  phases, currentPhase, onSelectPhase,
  onNext, onClone, onEmpty, onDelete,
  savedPlays, onLoadPlay,
}: Props) {
  const [tab, setTab] = useState<"phases" | "plays">("phases");

  return (
    <aside className="ed-left">
      <div className="ed-tabs">
        <div
          className={`ed-tab${tab === "phases" ? " active" : ""}`}
          onClick={() => setTab("phases")}
        >
          Phases
        </div>
        <div
          className={`ed-tab${tab === "plays" ? " active" : ""}`}
          onClick={() => setTab("plays")}
        >
          Mes plays
        </div>
      </div>

      {tab === "phases" && (
        <div>
          <div className="ph-counter">
            PHASE {currentPhase + 1}/{phases.length}
          </div>

          <div className="ph-actions">
            <div className="ph-act" onClick={onNext}>
              <span className="ico">→</span>
              <span>Next</span>
            </div>
            <div className="ph-act" onClick={onClone}>
              <span className="ico">⎘</span>
              <span>Clone</span>
            </div>
            <div className="ph-act" onClick={onEmpty}>
              <span className="ico">▢</span>
              <span>Empty</span>
            </div>
            <div className="ph-act" onClick={onDelete}>
              <span className="ico">🗑</span>
              <span>Del</span>
            </div>
          </div>

          <div className="phases-list">
            {phases.map((ph, i) => (
              <div
                key={ph.id}
                className={`ph-thumb${i === currentPhase ? " active" : ""}`}
                onClick={() => onSelectPhase(i)}
              >
                <span className="pnum">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "plays" && (
        <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
          {savedPlays.length === 0 ? (
            <p
              style={{
                color: "var(--gris-text)",
                textAlign: "center",
                padding: ".85rem",
                fontSize: ".85rem",
              }}
            >
              Aucun play sauvegardé.
            </p>
          ) : (
            savedPlays.map((p) => (
              <button
                key={p.id}
                className="saved-play-row"
                onClick={() => onLoadPlay(p.id)}
                title={`Ouvrir « ${p.title} »`}
              >
                <span className="saved-play-title">{p.title}</span>
                <span className="saved-play-meta">
                  {p.phases.length} phase{p.phases.length > 1 ? "s" : ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </aside>
  );
}