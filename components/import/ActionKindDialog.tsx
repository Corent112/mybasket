"use client";

import { useEffect, useRef } from "react";

export function ActionKindDialog({
  current, choices, onChange, onClose,
}: {
  current: string;
  choices: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} aria-label="Changer le type d’action" onCancel={onClose}
      style={{ border: "1px solid #e1dad3", borderRadius: 14, padding: "1rem", width: "min(360px, 90vw)", color: "#271b1e" }}>
      <h3 style={{ margin: "0 0 .75rem", color: "#6B1A2C" }}>Changer le type d’action</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: ".45rem" }}>
        {choices.map(choice => (
          <button key={choice.value} type="button" aria-pressed={choice.value === current}
            style={{ padding: ".55rem", borderRadius: 7, border: "1px solid #d6c5c8",
              background: choice.value === current ? "#6B1A2C" : "#fff",
              color: choice.value === current ? "#fff" : "#271b1e", cursor: "pointer" }}
            onClick={() => onChange(choice.value)}>{choice.label}</button>
        ))}
      </div>
      <button type="button" onClick={onClose} style={{ marginTop: ".75rem" }}>Annuler</button>
    </dialog>
  );
}
