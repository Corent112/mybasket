 "use client";

import { useEffect, useMemo, useState } from "react";
import LocalClipPlayer from "./LocalClipPlayer";
import LocalMatchVideoButton from "./LocalMatchVideoButton";
import { getLocalMatchVideoUrl } from "@/lib/local-video-registry";
import useLocalMatchVideoVersion from "@/hooks/useLocalMatchVideoVersion";

export type IndexedClip = {
  id: string;
  match_id: string;
  team_id: string;
  player_id?: string | null;
  opponent?: string | null;
  match_date?: string | null;
  quarter?: number | null;
  clock?: string | null;
  context?: string | null;
  systeme_name?: string | null;
  systeme_jeu?: string | null;
  temps_fort?: string | null;
  action_type?: string | null;
  shot_type?: string | null;
  shot_result?: string | null;
  zone?: string | null;
  clip_start?: number | null;
  clip_end?: number | null;
};

type Props = {
  open: boolean;
  title: string;
  teamId: string;
  clips: IndexedClip[];
  startIndex?: number;
  onClose: () => void;
};

export default function MultiMatchClipBrowser({
  open,
  title,
  teamId,
  clips,
  startIndex = 0,
  onClose,
}: Props) {
  useLocalMatchVideoVersion();
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (open) setIndex(Math.min(startIndex, Math.max(0, clips.length - 1)));
  }, [open, startIndex, clips.length]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        e.preventDefault();
        setIndex((current) =>
          e.shiftKey
            ? Math.max(0, current - 1)
            : Math.min(clips.length - 1, current + 1),
        );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, clips.length, onClose]);

  if (!open || !clips.length) return null;

  const clip = clips[index];
  const connected = Boolean(getLocalMatchVideoUrl(clip.match_id));

  return (
    <div className="mmcb-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mmcb-modal">
        <header>
          <div>
            <strong>{title}</strong>
            <span>{index + 1} / {clips.length}</span>
          </div>
          <button onClick={onClose}>×</button>
        </header>

        <section className="mmcb-meta">
          <b>{clip.opponent || "Match"}</b>
          <span>{clip.match_date || ""}</span>
          {clip.temps_fort && <em>{clip.temps_fort}</em>}
          {clip.shot_type && <em>{clip.shot_type}</em>}
          {clip.shot_result && <em>{clip.shot_result === "made" ? "Marqué" : clip.shot_result === "missed" ? "Raté" : clip.shot_result}</em>}
          {clip.zone && <em>{clip.zone}</em>}
        </section>

        <LocalClipPlayer clip={clip} teamId={teamId} autoPlay />

        <footer>
          {!connected && (
            <LocalMatchVideoButton
              matchId={clip.match_id}
              teamId={teamId}
            />
          )}
          <button onClick={() => setIndex((i) => Math.max(0, i - 1))}>← Précédent</button>
          <button onClick={() => setIndex((i) => Math.min(clips.length - 1, i + 1))}>Suivant →</button>
        </footer>
      </div>
    </div>
  );
}
