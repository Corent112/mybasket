"use client";
import { useEffect, useState } from "react";
export default function PostMatchSummary({ matchId }: { matchId: string }) {
  const [revision, setRevision] = useState(0);
  return (
    <PostMatchReport
      key={`${matchId}:${revision}`}
      matchId={matchId}
      onRetry={() => setRevision((v) => v + 1)}
    />
  );
}
function PostMatchReport({
  matchId,
  onRetry,
}: {
  matchId: string;
  onRetry: () => void;
}) {
  const [result, setResult] = useState<{
    text: string;
    source: string;
    note?: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/post-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Bilan indisponible");
        setResult(data);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [matchId]);
  return (
    <div aria-live="polite">
      {!result && !error && <p>Préparation automatique du bilan…</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <small>
            {result.source === "ai"
              ? "Bilan IA · statistiques du match"
              : "Lecture automatique des chiffres"}
          </small>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
            {result.text}
          </p>
          {result.note && <small>{result.note}</small>}
        </>
      )}
      {(error || result?.note) && (
        <button onClick={onRetry}>Réessayer l’analyse</button>
      )}
    </div>
  );
}
