"use client";

import { useParams, useRouter } from "next/navigation";
import SessionSelfEvaluation from "@/components/evaluations/SessionSelfEvaluation";

export default function SessionEvaluationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = String(params?.id || "");

  return (
    <main style={{ minHeight: "100vh", background: "#f6f2ec" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 26px 0" }}>
        <button
          type="button"
          onClick={() => router.push(`/seances/${sessionId}`)}
          style={{
            border: "1px solid #e4d8cf",
            background: "#fff",
            color: "#6b1a2c",
            borderRadius: 10,
            padding: "9px 12px",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ← Retour à la séance
        </button>
      </div>

      {sessionId ? (
        <SessionSelfEvaluation sessionId={sessionId} />
      ) : (
        <div style={{ padding: 30, textAlign: "center" }}>Séance introuvable.</div>
      )}
    </main>
  );
}
