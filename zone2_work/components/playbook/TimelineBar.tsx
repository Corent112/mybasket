"use client";

import { useState } from "react";

interface Props {
  currentPhase: number;
  totalPhases: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function TimelineBar({
  currentPhase, totalPhases, onPrev, onNext,
}: Props) {
  const [speed, setSpeed] = useState("1");
  const [playing, setPlaying] = useState(false);

  const progress =
    totalPhases > 1 ? (currentPhase / (totalPhases - 1)) * 100 : 0;

  return (
    <div className="timeline">
      <div className="tl-controls">
        <div className="tl-btn" onClick={onPrev} title="Précédent">⏮</div>
        <div
          className="tl-btn"
          onClick={() => setPlaying(!playing)}
          title="Play / Pause"
        >
          {playing ? "⏸" : "▶"}
        </div>
        <div
          className="tl-btn"
          onClick={() => setPlaying(false)}
          title="Stop"
        >
          ⏹
        </div>
        <div className="tl-btn" onClick={onNext} title="Suivant">⏭</div>
      </div>

      <select
        className="tl-speed"
        value={speed}
        onChange={(e) => setSpeed(e.target.value)}
      >
        <option value="0.5">0.5x</option>
        <option value="1">1x</option>
        <option value="1.5">1.5x</option>
        <option value="2">2x</option>
      </select>

      <div className="tl-progress">
        <div className="tl-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      <div className="tl-status">
        Phase {currentPhase + 1}/{totalPhases}
      </div>
    </div>
  );
}