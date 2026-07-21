"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MontageStudio from "@/components/video-editor/MontageStudio";

function MontagePageContent() {
  const searchParams = useSearchParams();

  return (
    <MontageStudio
      initialTeamId={searchParams.get("teamId") || ""}
      initialPlayerId={searchParams.get("playerId") || ""}
      initialMontageId={searchParams.get("montageId") || ""}
    />
  );
}

function MontagePageFallback() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "#0f0f12",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <p style={{ margin: 0, fontWeight: 800 }}>Chargement du studio montage…</p>
    </main>
  );
}

export default function MontagePage() {
  return (
    <Suspense fallback={<MontagePageFallback />}>
      <MontagePageContent />
    </Suspense>
  );
}
