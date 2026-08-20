"use client";

import { useRef, useState } from "react";
import type { AiSessionScan } from "@/lib/import/session-scan-types";

type Props = {
  onApply: (scan: AiSessionScan, mode: "append" | "replace") => void;
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
  const maxSide = 1800;
  const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.84);
}

export default function SessionPhotoImport({ onApply }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<AiSessionScan | null>(null);

  async function analyze(file: File) {
    if (!file.type.startsWith("image/")) return setError("Choisis une photo JPG, PNG ou WebP.");
    setBusy(true); setError(""); setStatus("Préparation de la fiche séance…"); setDraft(null);
    try {
      const image = await compressImage(file);
      setStatus("MyBasket découpe la séance et reconnaît les exercices…");
      const response = await fetch("/api/ai/import/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Analyse impossible");
      if (!payload?.session) throw new Error("Réponse IA incomplète");
      setDraft(payload.session as AiSessionScan);
      setStatus("");
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : "La fiche n'a pas pu être analysée.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function patchExercise(index: number, patch: Partial<AiSessionScan["exercises"][number]>) {
    setDraft((prev) => prev ? { ...prev, exercises: prev.exercises.map((exercise, i) => i === index ? { ...exercise, ...patch } : exercise) } : prev);
  }

  return <div className="sessionAi">
    <div className="sessionAiHead">
      <div><span>MYBASKET AI · LOT 3</span><strong>Ta séance est encore sur papier ?</strong><p>Photographie la fiche : MyBasket détecte les exercices dans l’ordre et prépare ton practice plan. Rien n’est enregistré automatiquement.</p></div>
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Analyse…" : "📸 Numériser une séance"}</button>
      <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) void analyze(file); }} />
    </div>
    {(status || error) && <div className={error ? "sessionAiState error" : "sessionAiState"}>{error || status}</div>}

    {draft && <div className="sessionAiDraft">
      <div className="sessionAiSummary">
        <div><b>{draft.exercises.length} exercice{draft.exercises.length > 1 ? "s" : ""} détecté{draft.exercises.length > 1 ? "s" : ""}</b><small>Vérifie ici, puis ajoute la proposition à la séance.</small></div>
        <button type="button" onClick={() => setDraft(null)}>Fermer</button>
      </div>
      <div className="sessionAiGeneral">
        <label>Titre<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}/></label>
        <label>Thème<input value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })}/></label>
        <label>Date<input type="date" value={draft.sessionDate} onChange={(e) => setDraft({ ...draft, sessionDate: e.target.value })}/></label>
        <label>Début<input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}/></label>
        <label>Fin<input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}/></label>
        <label>Lieu<input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}/></label>
      </div>
      <div className="sessionAiExercises">
        {draft.exercises.map((exercise, index) => <article key={index}>
          <div className="sessionAiIndex">{String(index + 1).padStart(2, "0")}</div>
          <div className="sessionAiFields">
            <input className="title" value={exercise.title} onChange={(e) => patchExercise(index, { title: e.target.value })}/>
            <div className="meta"><label>Temps<input type="number" min={0} value={exercise.durationMinutes ?? ""} onChange={(e) => patchExercise(index, { durationMinutes: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}/></label><label>Qui<select value={exercise.who} onChange={(e) => patchExercise(index, { who: e.target.value })}>{["CP","AC1","AC2","PP","RV"].map((v) => <option key={v}>{v}</option>)}</select></label></div>
            <textarea rows={2} placeholder="Déroulement" value={exercise.explanation} onChange={(e) => patchExercise(index, { explanation: e.target.value })}/>
            <textarea rows={2} placeholder="Consignes / variantes" value={[exercise.instructions, exercise.variants].filter(Boolean).join("\n") } onChange={(e) => patchExercise(index, { instructions: e.target.value, variants: "" })}/>
          </div>
          {exercise.confidence > 0 && exercise.confidence < .65 && <em>À vérifier</em>}
        </article>)}
      </div>
      {draft.warnings.length > 0 && <div className="sessionAiWarnings"><b>À vérifier :</b> {draft.warnings.join(" · ")}</div>}
      <div className="sessionAiActions">
        <button type="button" className="secondary" onClick={() => { onApply(draft, "append"); setDraft(null); }}>Ajouter au practice plan</button>
        <button type="button" className="primary" onClick={() => { onApply(draft, "replace"); setDraft(null); }}>Remplacer le practice plan</button>
      </div>
    </div>}

    <style jsx>{`
      .sessionAi{margin:0 0 18px;border:1px solid #e3d5bd;border-radius:18px;background:linear-gradient(135deg,#fffaf0,#fff);overflow:hidden}.sessionAiHead{display:flex;align-items:center;gap:18px;padding:16px}.sessionAiHead>div{flex:1}.sessionAiHead span,.sessionAiHead strong,.sessionAiHead p{display:block}.sessionAiHead span{font-size:10px;letter-spacing:1.3px;font-weight:1000;color:#a57220}.sessionAiHead strong{font-size:17px;margin-top:3px}.sessionAiHead p{margin:4px 0 0;color:#766d63;font-size:12px}.sessionAiHead button,.sessionAiActions button{border:0;border-radius:11px;padding:11px 14px;font-weight:1000;cursor:pointer}.sessionAiHead button{background:#111;color:#d4a24c}.sessionAiState{padding:10px 16px;background:#f5efe3;font-weight:800;font-size:12px}.sessionAiState.error{background:#fff0f1;color:#8b1028}.sessionAiDraft{border-top:1px solid #eadfce}.sessionAiSummary{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#171719;color:white}.sessionAiSummary b,.sessionAiSummary small{display:block}.sessionAiSummary small{color:#aaa;margin-top:2px}.sessionAiSummary button{background:#333;color:white}.sessionAiGeneral{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:12px 16px}.sessionAiGeneral label,.meta label{display:flex;flex-direction:column;gap:4px;font-size:10px;font-weight:900}.sessionAiGeneral input,.sessionAiFields input,.sessionAiFields select,.sessionAiFields textarea{border:1px solid #ded7cc;border-radius:9px;padding:8px;font:inherit}.sessionAiExercises{padding:0 16px}.sessionAiExercises article{display:grid;grid-template-columns:44px 1fr auto;gap:10px;padding:11px 0;border-top:1px solid #eee7dc}.sessionAiIndex{font-size:23px;font-weight:1000;color:#d4a24c}.sessionAiFields{display:grid;grid-template-columns:1fr 190px;gap:7px}.sessionAiFields .title{font-weight:1000}.sessionAiFields .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px}.sessionAiFields textarea{grid-column:1/-1;resize:vertical}.sessionAiExercises em{font-size:10px;color:#8b1028;font-weight:900}.sessionAiWarnings{margin:10px 16px;padding:10px;border-radius:10px;background:#fff5e4;color:#79571e;font-size:11px}.sessionAiActions{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #eee}.sessionAiActions .secondary{background:#eee8dc;color:#58401c}.sessionAiActions .primary{background:#6b1a2c;color:white}@media(max-width:760px){.sessionAiHead{align-items:flex-start;flex-direction:column}.sessionAiHead button{width:100%}.sessionAiGeneral{grid-template-columns:1fr 1fr}.sessionAiFields{grid-template-columns:1fr}.sessionAiFields .meta{grid-template-columns:1fr 1fr}.sessionAiActions{flex-direction:column}.sessionAiActions button{width:100%}}
    `}</style>
  </div>;
}
