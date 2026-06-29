"use client";

import type {
  DrawAction, MiscTool, PlayerStyle, CourtType,
} from "@/types/playbook";

interface Props {
  activeAction: DrawAction;
  onActionChange: (a: DrawAction) => void;
  activeMisc: MiscTool | null;
  onMiscChange: (m: MiscTool | null) => void;
  onAddPlayer: (style: PlayerStyle, label: string) => void;
  courtType: CourtType;
  onToggleCourt: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  color: string;
  onColorChange: (c: string) => void;
}

const ACTIONS: Array<{ id: DrawAction; icon: string; label: string }> = [
  { id: "select",   icon: "↖",   label: "Sélection" },
  { id: "dribble",  icon: "∿",   label: "Dribble" },
  { id: "pass",     icon: "-->", label: "Passe" },
  { id: "cut",      icon: "→",   label: "Cut" },
  { id: "screen",   icon: "⊺",   label: "Écran" },
  { id: "shoot",    icon: "⊕",   label: "Tir" },
  { id: "giveball", icon: "🏀",  label: "Donner ballon" },
];

const MISC: Array<{ id: MiscTool; icon: string; title: string }> = [
  { id: "cone",     icon: "▲", title: "Plot" },
  { id: "triangle", icon: "△", title: "Triangle" },
  { id: "square",   icon: "■", title: "Carré" },
  { id: "circle",   icon: "●", title: "Rond" },
  { id: "text",     icon: "T", title: "Texte" },
  { id: "handoff",  icon: "H", title: "Hand-off" },
  { id: "freedraw", icon: "✎", title: "Dessin libre" },
];

export default function EditorSidebarRight({
  activeAction, onActionChange,
  activeMisc, onMiscChange,
  onAddPlayer,
  courtType, onToggleCourt,
  onDeleteSelected, onDuplicateSelected,
  color, onColorChange,
}: Props) {
  return (
    <aside className="ed-right">
      <div className="ed-hint">
        💡 1) Clique un joueur → il devient sélectionné
        <br />
        2) Clique une action → 3) Trace la trajectoire sur le terrain
      </div>

      <div className="sec-lab">ACTIONS</div>
      <div className="actions-grid">
        {ACTIONS.map((a) => (
          <div
            key={a.id}
            className={`act-btn${activeAction === a.id ? " active" : ""}`}
            onClick={() => onActionChange(a.id)}
          >
            <span className="icn">{a.icon}</span>
            {a.label}
          </div>
        ))}
      </div>

      <div className="sec-lab">
        AJOUTER JOUEURS
        <span className="help" title="Clique sur un numéro pour le poser au centre du terrain.">?</span>
      </div>

      {/* Attaquants ronds : 1-6 */}
      <div className="players-row">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            key={`c${n}`}
            className="pl-btn s-circle"
            onClick={() => onAddPlayer("circle", String(n))}
            title={`Attaquant ${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      {/* Attaquants carrés : 1-6 */}
      <div className="players-row">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            key={`s${n}`}
            className="pl-btn s-square"
            onClick={() => onAddPlayer("square", String(n))}
            title={`Attaquant carré ${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      {/* Défenseurs : X1-X6 */}
      <div className="players-row">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            key={`d${n}`}
            className="pl-btn s-defense"
            onClick={() => onAddPlayer("defense", `X${n}`)}
            title={`Défenseur X${n}`}
          >
            X{n}
          </button>
        ))}
      </div>
      {/* Coach + ballon */}
      <div className="players-row">
        <button
          className="pl-btn"
          onClick={() => onAddPlayer("coach", "C")}
          title="Coach"
        >
          C
        </button>
        <button
          className="pl-btn s-ball"
          onClick={() => onAddPlayer("ball", "")}
          title="Ballon"
        >
          🏀
        </button>
      </div>

      <div className="sec-lab" style={{ marginTop: ".85rem" }}>OUTILS</div>
      <div className="misc-grid">
        {MISC.map((m) => (
          <div
            key={m.id}
            className={`misc-btn${activeMisc === m.id ? " active" : ""}`}
            title={m.title}
            onClick={() =>
              onMiscChange(activeMisc === m.id ? null : m.id)
            }
          >
            {m.icon}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: ".85rem",
          display: "flex",
          flexDirection: "column",
          gap: ".4rem",
        }}
      >
        <button
          className="btn btn-outline btn-block btn-small"
          onClick={onToggleCourt}
          style={{ textAlign: "center", fontWeight: 600 }}
        >
          🏟 Terrain : {courtType === "half" ? "Demi" : "Complet"}
        </button>
        <button
          className="btn btn-red btn-block btn-small"
          onClick={onDeleteSelected}
        >
          🗑 Supprimer sélection
        </button>
        <button
          className="btn btn-outline btn-block btn-small"
          onClick={onDuplicateSelected}
        >
          ⎘ Dupliquer
        </button>
        <label
          style={{
            fontSize: ".72rem",
            color: "var(--gris-text)",
            textTransform: "uppercase",
            letterSpacing: ".04em",
            marginTop: ".25rem",
          }}
        >
          Couleur de la sélection
        </label>
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          style={{ width: "100%", height: "32px", cursor: "pointer" }}
          title="Change la couleur de l'élément sélectionné"
        />
      </div>
    </aside>
  );
}