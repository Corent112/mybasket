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

export default function MontagePage() {
  return (
    <Suspense fallback={null}>
      <MontagePageContent />
    </Suspense>
  );
}
