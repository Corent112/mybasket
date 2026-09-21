"use client";

import MontageStudio from "@/components/video-editor/MontageStudio";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function MontageContent() {
  const params = useParams<{ montageId: string }>();
  const search = useSearchParams();

  return (
    <MontageStudio
      initialMontageId={String(params.montageId || "")}
      initialTeamId={search.get("teamId") || ""}
      initialPlayerId={search.get("playerId") || ""}
    />
  );
}

export default function MontagePage() {
  return (
    <Suspense fallback={null}>
      <MontageContent />
    </Suspense>
  );
}
