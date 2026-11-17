"use client";

import { useEffect, useRef, useState } from "react";

export function ActionKindDialog({
  current, choices, receiver, receivers, onChange, onClose,
}: {
  current: string;
  choices: readonly { value: string; label: string }[];
  receiver?: string;
  receivers: readonly { value: string; label: string }[];
  onChange: (value: string, receiver: string) => void;
  onClose: () => void;
}) {
  const [action, setAction] = useState(current);
  const [target, setTarget] = useState(receiver ?? "");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} aria-label="Modifier l’action" onCancel={onClose}
      style={{ position: "fixed", inset: 0, margin: "auto", height: "fit-content", maxHeight: "90dvh",
        overflowY: "auto", border: "1px solid #e1dad3", borderRadius: 14, padding: "1rem",
        width: "min(360px, 90vw)", background: "#fff", color: "#271b1e" }}>
      <h3 style={{ margin: "0 0 .75rem", color: "#6B1A2C" }}>Modifier l’action</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: ".45rem" }}>
        {choices.map(choice => (
          <button key={choice.value} type="button" aria-pressed={choice.value === action}
            style={{ padding: ".55rem", borderRadius: 7, border: "1px solid #d6c5c8",
              background: choice.value === action ? "#6B1A2C" : "#fff",
              color: choice.value === action ? "#fff" : "#271b1e", cursor: "pointer" }}
            onClick={() => setAction(choice.value)}>{choice.label}</button>
        ))}
      </div>
      {action === "pass" && (
        <label style={{ display: "grid", gap: ".3rem", marginTop: ".75rem" }}>
          Destinataire de la passe
          <select value={target} onChange={event => setTarget(event.target.value)} style={{ padding: ".45rem", width: "100%" }}>
            <option value="">Point libre</option>
            {receivers.map(player => <option key={player.value} value={player.value}>{player.label}</option>)}
          </select>
        </label>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: ".5rem", marginTop: ".75rem" }}>
        <button type="button" onClick={onClose}>Annuler</button>
        <button type="button" onClick={() => onChange(action, action === "pass" ? target : "")}>Appliquer</button>
      </div>
    </dialog>
  );
}
