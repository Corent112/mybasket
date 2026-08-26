"use client";

import { useRef, useState } from "react";
import type { AiExerciseImport } from "@/lib/import/types";
import { scanExerciseLocally } from "@/lib/import/local-exercise-scanner";

type Props = {
  onImported: (exercise: AiExerciseImport) => void | Promise<void>;
};

export default function ExercisePhotoImport({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const analyze = async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      setError("Choisis une photo ou une vidéo.");
      return;
    }
    if (file.size > 120 * 1024 * 1024) {
      setError("Le fichier est trop lourd (120 Mo maximum).");
      return;
    }

    setBusy(true);
    setError("");
    setStatus("Préparation…");

    try {
      const exercise = await scanExerciseLocally(file, setStatus);
      setStatus("Préremplissage du formulaire et de Plaquette…");
      await onImported(exercise);
      const count = exercise.diagrams?.length || (exercise.diagram.detected ? 1 : 0);
      setStatus(
        `✓ Import terminé${count ? ` — ${count} schéma${count > 1 ? "s" : ""} reconstruit${count > 1 ? "s" : ""}` : ""}. Vérifie, modifie si besoin puis clique sur Créer l’exercice.`
      );
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : "L'import n'a pas pu être analysé.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="ce-ai-import">
      <div className="ce-ai-copy">
        <span className="ce-ai-badge">NUMÉRISATION GRATUITE</span>
        <div>
          <b>Exercice sur papier ou en vidéo ?</b>
          <p>
            MyBasket lit le texte et tente de reconstruire chaque dessin dans Plaquette, directement dans ton navigateur. Rien n’est créé avant ta validation.
          </p>
        </div>
      </div>

      <button type="button" className="ce-ai-btn" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Import en cours…" : "📸 Importer photo / vidéo"}
      </button>

      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void analyze(file);
        }}
      />

      {(status || error) && <div className={error ? "ce-ai-state error" : "ce-ai-state"}>{error || status}</div>}
    </div>
  );
}
