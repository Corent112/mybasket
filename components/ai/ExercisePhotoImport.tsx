"use client";

/**
 * components/ai/ExercisePhotoImport.tsx
 * ---------------------------------------------------------------------------
 * NUMÉRISATION GRATUITE — point d'entrée de la chaîne d'import.
 *
 * Chaîne complète :
 *
 *   bouton Importer
 *     → scanExerciseLocally()          (moteur V3, 100 % navigateur)
 *     → écran « Analyse terminée »     (résumé + comparaison + correction)
 *     → ImportReview                   (correction manuelle, facultative)
 *     → onImported(résultat corrigé)   (= applyAIImport dans CreerExerciceClient)
 *     → importToPlaquetteSchema()      (objets Plaquette natifs)
 *     → formulaire → « Sauvegarder l'exercice »
 *
 * RÈGLES DE CÂBLAGE (aucune ne doit sauter) :
 *
 *  1. `onImported` n'est appelé QU'UNE SEULE FOIS par import, et seulement
 *     après validation explicite. « Annuler » ne l'appelle jamais : le
 *     formulaire reste strictement inchangé.
 *  2. `ImportReview` n'est qu'une étape de validation. Elle ne duplique aucune
 *     logique d'édition de Plaquette : après validation, les objets repassent
 *     par `importToPlaquetteSchema` et redeviennent des objets Plaquette
 *     natifs, modifiables avec les outils habituels.
 *  3. Le composant ne connaît ni le formulaire, ni Plaquette, ni le stockage :
 *     sa seule sortie reste `onImported(exercise)`. La signature des props est
 *     donc inchangée, et `CreerExerciceClient` n'a pas besoin d'être modifié.
 *  4. L'import manuel (photos, schémas dessinés à la main) n'est pas touché :
 *     ce composant n'écrit rien nulle part.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AiExerciseImport } from "@/lib/import/types";
import { IMPORT_DEBUG_ENABLED } from "@/lib/import/debug";
import { scanExerciseLocally } from "@/lib/import/local-exercise-scanner";
import ImportReview, { countReviewItems, diagramsOf } from "@/components/import/ImportReview";

type Props = {
  onImported: (exercise: AiExerciseImport) => void | Promise<void>;
};

/** Étapes de l'écran : rien → analyse → résumé → correction. */
type Step = "idle" | "scanning" | "summary" | "review";

const rect = (r: { x0: number; y0: number; x1: number; y1: number }) =>
  `${Math.round(r.x0)},${Math.round(r.y0)} → ${Math.round(r.x1)},${Math.round(r.y1)}`;

const plural = (count: number, one: string, many: string) => (count > 1 ? many : one);

export default function ExercisePhotoImport({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [debug, setDebug] = useState<AiExerciseImport["debug"] | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  /** Résultat en attente de validation. Tant qu'il est là, rien n'est injecté. */
  const [pending, setPending] = useState<AiExerciseImport | null>(null);
  /** Photo d'origine, uniquement pour la comparaison visuelle. */
  const [sourceImage, setSourceImage] = useState<string>("");
  const [compare, setCompare] = useState(false);
  /** Garde-fou anti double injection (double clic, double soumission). */
  const injecting = useRef(false);

  // L'URL objet de la photo d'origine est libérée dès qu'elle n'est plus affichée.
  useEffect(() => {
    if (!sourceImage) return;
    return () => {
      URL.revokeObjectURL(sourceImage);
    };
  }, [sourceImage]);

  const resetAll = useCallback(() => {
    setPending(null);
    setCompare(false);
    setStep("idle");
    setStatus("");
    setError("");
    setWarnings([]);
    setSourceImage((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return "";
    });
  }, []);

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

    // Un nouvel import repart de zéro : le précédent résultat en attente est
    // abandonné (il n'a jamais été injecté, donc il n'y a rien à défaire).
    resetAll();
    setBusy(true);
    setStep("scanning");
    setDebug(null);
    setStatus("Préparation…");

    try {
      const exercise = await scanExerciseLocally(file, setStatus);

      setPending(exercise);
      setWarnings(exercise.warnings);
      if (IMPORT_DEBUG_ENABLED) setDebug(exercise.debug ?? null);
      if (isImage) setSourceImage(URL.createObjectURL(file));
      setStatus("");
      setStep("summary");
    } catch (e) {
      setStatus("");
      setStep("idle");
      setError(e instanceof Error ? e.message : "L'import n'a pas pu être analysé.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  /**
   * Injection unique dans le formulaire. Le résultat en attente est retiré
   * AVANT l'appel : même un double clic ne peut pas injecter deux fois.
   */
  const validate = async (corrected: AiExerciseImport) => {
    if (injecting.current) return;
    injecting.current = true;

    const count = diagramsOf(corrected).length;
    setStep("idle");
    setPending(null);
    setCompare(false);
    setBusy(true);
    setStatus("Préremplissage du formulaire et de Plaquette…");

    try {
      await onImported(corrected);
      setWarnings(corrected.warnings);
      setStatus(
        `✓ Numérisation terminée${
          count
            ? ` — ${count} ${plural(count, "schéma", "schémas")} ${plural(
                count,
                "reconstruit",
                "reconstruits"
              )} dans Plaquette`
            : ""
        }. Vérifie, modifie si besoin, puis clique sur « Sauvegarder l’exercice ».`
      );
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : "Le préremplissage a échoué.");
    } finally {
      setBusy(false);
      injecting.current = false;
      setSourceImage((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return "";
      });
    }
  };

  /* ------------------------------------------------------------------ rendu */

  const diagramCount = pending ? diagramsOf(pending).length : 0;
  const toCheck = pending ? countReviewItems(pending) : 0;

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

      {/* ------------------------------------------------ écran « Analyse terminée » */}
      {step === "summary" && pending && (
        <div style={summaryStyles.panel}>
          <div style={summaryStyles.head}>
            <strong style={summaryStyles.title}>Analyse terminée</strong>
            <span style={summaryStyles.line}>
              {diagramCount === 0
                ? "Aucun schéma détecté"
                : `${diagramCount} ${plural(diagramCount, "schéma détecté", "schémas détectés")}`}
            </span>
            <span style={toCheck > 0 ? summaryStyles.lineWarn : summaryStyles.line}>
              {toCheck === 0
                ? "Aucun élément à vérifier"
                : `${toCheck} ${plural(toCheck, "élément à vérifier", "éléments à vérifier")}`}
            </span>
            {typeof pending.importConfidence === "number" && (
              <span style={summaryStyles.hint}>
                Fiabilité globale estimée : {Math.round(pending.importConfidence * 100)} %
              </span>
            )}
            {diagramCount === 0 && (
              <span style={summaryStyles.hint}>
                Le texte lu sera repris dans le formulaire ; le schéma reste à dessiner dans Plaquette.
              </span>
            )}
          </div>

          <div style={summaryStyles.row}>
            <button
              type="button"
              style={compare ? summaryStyles.buttonActive : summaryStyles.button}
              disabled={!sourceImage && !pending.rectifiedImage}
              onClick={() => setCompare((open) => !open)}
            >
              Comparer avec la photo
            </button>
            <button
              type="button"
              style={summaryStyles.button}
              disabled={diagramCount === 0}
              onClick={() => setStep("review")}
            >
              Corriger
            </button>
          </div>

          {compare && (
            <div style={summaryStyles.compare}>
              {sourceImage && (
                <figure style={summaryStyles.figure}>
                  <img src={sourceImage} alt="Document d'origine" style={summaryStyles.image} />
                  <figcaption style={summaryStyles.caption}>Document d’origine</figcaption>
                </figure>
              )}
              {pending.rectifiedImage && (
                <figure style={summaryStyles.figure}>
                  <img src={pending.rectifiedImage} alt="Terrain redressé" style={summaryStyles.image} />
                  <figcaption style={summaryStyles.caption}>Terrain redressé par l’import</figcaption>
                </figure>
              )}
              {!pending.rectifiedImage && (
                <p style={summaryStyles.hint}>
                  Le terrain n’a pas pu être redressé : la reconstruction s’appuie sur le dessin tel quel.
                </p>
              )}
            </div>
          )}

          {warnings.length > 0 && (
            <ul style={summaryStyles.warnings}>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          <div style={summaryStyles.actions}>
            <button type="button" style={summaryStyles.buttonGhost} onClick={resetAll}>
              Annuler
            </button>
            <button
              type="button"
              style={summaryStyles.buttonPrimary}
              disabled={busy}
              onClick={() => void validate(pending)}
            >
              Valider l’import
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- correction manuelle */}
      {step === "review" && pending && (
        <div style={summaryStyles.reviewHost}>
          <ImportReview
            result={pending}
            cancelLabel="Retour"
            validateLabel="Valider l’import"
            onCancel={() => setStep("summary")}
            onValidate={(corrected) => void validate(corrected)}
          />
        </div>
      )}

      {step !== "summary" && !error && warnings.length > 0 && (
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

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */
/* Styles en ligne volontairement : le composant n'introduit aucune nouvelle   */
/* classe CSS et ne dépend d'aucune feuille de style à ajouter au projet.      */

const BORD = "#6B1A2C";
const GOLD = "#D4A24C";
const BORDER = "#E8DDD7";

const baseButton: React.CSSProperties = {
  padding: "9px 13px",
  borderRadius: 9,
  border: `1px solid ${BORDER}`,
  background: "#fff",
  color: "#221A18",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const summaryStyles: Record<string, React.CSSProperties> = {
  panel: {
    marginTop: 12,
    border: `1px solid ${GOLD}`,
    borderRadius: 14,
    background: "#FFFCF7",
    padding: 14,
    display: "grid",
    gap: 12,
  },
  head: { display: "grid", gap: 3 },
  title: { color: BORD, fontSize: 16, fontWeight: 1000 },
  line: { fontSize: 13, color: "#3A302C", fontWeight: 700 },
  lineWarn: { fontSize: 13, color: "#A24B12", fontWeight: 800 },
  hint: { fontSize: 11, color: "#7C6F68" },
  row: { display: "flex", gap: 8, flexWrap: "wrap" },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    borderTop: `1px solid ${BORDER}`,
    paddingTop: 12,
  },
  button: baseButton,
  buttonActive: { ...baseButton, borderColor: GOLD, background: "#FFF3DC" },
  buttonGhost: { ...baseButton, background: "transparent", fontWeight: 700 },
  buttonPrimary: { ...baseButton, border: 0, background: BORD, color: "#fff", fontWeight: 1000 },
  compare: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    background: "#fff",
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: 10,
  },
  figure: { margin: 0, display: "grid", gap: 5 },
  image: { width: "100%", height: "auto", borderRadius: 8, border: `1px solid ${BORDER}` },
  caption: { fontSize: 11, color: "#7C6F68" },
  warnings: { margin: 0, paddingLeft: 18, fontSize: 11, color: "#79571E" },
  reviewHost: { marginTop: 12 },
};
