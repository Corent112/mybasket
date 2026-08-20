"use client";

import { useRef, useState } from "react";
import type { AiExerciseImport } from "@/lib/import/types";

type Props = {
  onImported: (exercise: AiExerciseImport) => void | Promise<void>;
};

async function compressImage(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture de l'image impossible"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Image invalide"));
    el.src = source;
  });

  const maxSide = 1600;
  const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function ExercisePhotoImport({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const analyze = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Choisis une photo JPG, PNG ou WebP.");
      return;
    }

    setBusy(true);
    setError("");
    setStatus("Préparation de la photo…");

    try {
      const image = await compressImage(file);
      setStatus("MyBasket lit le texte et reconstruit le schéma…");

      const response = await fetch("/api/ai/import/exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Analyse impossible");
      if (!payload?.exercise) throw new Error("Réponse IA incomplète");

      setStatus("Exercice reconnu. Préremplissage…");
      await onImported(payload.exercise as AiExerciseImport);
      setStatus("✓ Exercice prérempli — vérifie puis sauvegarde quand tu veux.");
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : "La photo n'a pas pu être analysée.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="ce-ai-import">
      <div className="ce-ai-copy">
        <span className="ce-ai-badge">MYBASKET AI</span>
        <div>
          <b>Ton exercice est encore sur papier ?</b>
          <p>Prends-le en photo : MyBasket remplit la fiche et recrée le schéma. Tu gardes la main avant l’enregistrement.</p>
        </div>
      </div>

      <button type="button" className="ce-ai-btn" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Analyse en cours…" : "📸 Importer une photo"}
      </button>

      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void analyze(file);
        }}
      />

      {(status || error) && (
        <div className={error ? "ce-ai-state error" : "ce-ai-state"}>{error || status}</div>
      )}
    </div>
  );
}
