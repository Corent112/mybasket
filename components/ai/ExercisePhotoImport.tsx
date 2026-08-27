"use client";

import { useRef, useState } from "react";
import type { AiExerciseImport } from "@/lib/import/types";
import { IMPORT_DEBUG_ENABLED } from "@/lib/import/debug";
import { scanExerciseLocally } from "@/lib/import/local-exercise-scanner";

type Props = {
  onImported: (exercise: AiExerciseImport) => void | Promise<void>;
};

const rect = (r: { x0: number; y0: number; x1: number; y1: number }) =>
  `${Math.round(r.x0)},${Math.round(r.y0)} → ${Math.round(r.x1)},${Math.round(r.y1)}`;

export default function ExercisePhotoImport({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [debug, setDebug] = useState<AiExerciseImport["debug"] | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

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
    setWarnings([]);
    setDebug(null);
    setStatus("Préparation…");

    try {
      const exercise = await scanExerciseLocally(file, setStatus);
      setStatus("Préremplissage du formulaire et de Plaquette…");
      await onImported(exercise);

      const count = exercise.diagrams?.length || (exercise.diagram.detected ? 1 : 0);
      setWarnings(exercise.warnings);
      if (IMPORT_DEBUG_ENABLED) setDebug(exercise.debug ?? null);
      setStatus(
        `✓ Numérisation terminée${
          count ? ` — ${count} schéma${count > 1 ? "s" : ""} reconstruit${count > 1 ? "s" : ""} dans Plaquette` : ""
        }. Vérifie, modifie si besoin, puis clique sur « Sauvegarder l’exercice ».`
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
          <b>Exercice sur papier, capture d’écran ou vidéo ?</b>
          <p>
            MyBasket lit les zones utiles du document et reconstruit chaque dessin dans ton outil Plaquette,
            directement dans ton navigateur. Rien n’est enregistré tant que tu n’as pas validé.
          </p>
        </div>
      </div>

      <button type="button" className="ce-ai-btn" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Numérisation en cours…" : "📸 Importer photo / vidéo"}
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

      {!error && warnings.length > 0 && (
        <ul className="ce-ai-warn">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {IMPORT_DEBUG_ENABLED && debug && (
        <div className="ce-ai-debug">
          <button type="button" className="ce-ai-debug-toggle" onClick={() => setDebugOpen((open) => !open)}>
            {debugOpen ? "▾" : "▸"} Debug import (développement uniquement)
          </button>

          {debugOpen && (
            <div className="ce-ai-debug-body">
              <p>
                <b>Vues analysées :</b> {debug.frames} · <b>Confiance OCR :</b>{" "}
                {(debug.ocrConfidence * 100).toFixed(0)} % · <b>Schémas :</b> {debug.graphics.length}
              </p>

              <details>
                <summary>Texte OCR brut ({debug.ocrRawText.length} caractères)</summary>
                <pre>{debug.ocrRawText || "(vide)"}</pre>
              </details>

              <details>
                <summary>Zones détectées ({debug.zones.length})</summary>
                <ul>
                  {debug.zones.map((zone, index) => (
                    <li key={`${zone.key}-${index}`}>
                      <b>{zone.key}</b> « {zone.label} » — {rect(zone.rect)} — confiance{" "}
                      {(zone.confidence * 100).toFixed(0)} %
                      <pre>{zone.text || "(vide)"}</pre>
                    </li>
                  ))}
                </ul>
              </details>

              <details>
                <summary>Lignes ignorées du site source ({debug.ignoredChromeLines.length})</summary>
                <pre>{debug.ignoredChromeLines.join("\n") || "(aucune)"}</pre>
              </details>

              <details open>
                <summary>Schémas ({debug.graphics.length})</summary>
                <ul>
                  {debug.graphics.map((graphic) => (
                    <li key={graphic.index}>
                      <b>Schéma {graphic.index + 1}</b> (vue {graphic.frame + 1}) — terrain {graphic.courtKind}
                      <br />
                      zone Graphic : {rect(graphic.regionRect)}
                      <br />
                      rectangle terrain : {rect(graphic.courtRect)}
                      <br />
                      orientation : {graphic.orientation}
                      <br />
                      joueurs : {graphic.players} · objets : {graphic.objects} · lignes : {graphic.lines}{" "}
                      {Object.keys(graphic.lineKinds).length > 0 &&
                        `(${Object.entries(graphic.lineKinds)
                          .map(([kind, count]) => `${kind}×${count}`)
                          .join(", ")})`}
                      {graphic.rejections.length > 0 && (
                        <ul>
                          {graphic.rejections.map((rejection, index) => (
                            <li key={index}>
                              ✕ {rejection.what} — {rejection.why}
                              {rejection.count && rejection.count > 1 ? ` (×${rejection.count})` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </details>

              <details>
                <summary>Éléments écartés ({debug.rejections.length})</summary>
                <ul>
                  {debug.rejections.map((rejection, index) => (
                    <li key={index}>
                      [{rejection.stage}] {rejection.what} — {rejection.why}
                      {rejection.count && rejection.count > 1 ? ` (×${rejection.count})` : ""}
                    </li>
                  ))}
                </ul>
              </details>

              <details>
                <summary>Temps de traitement</summary>
                <pre>
                  {Object.entries(debug.timingsMs)
                    .map(([label, ms]) => `${label} : ${ms} ms`)
                    .join("\n") || "(aucun)"}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
