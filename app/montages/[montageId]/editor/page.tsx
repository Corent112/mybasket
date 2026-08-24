"use client";

import MontageStudio from "@/components/video-editor/MontageStudio";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function EditorContent() {
  const params = useParams<{ montageId: string }>();
  const search = useSearchParams();
  return <MontageStudio embedded initialMontageId={String(params.montageId || "")} initialTeamId={search.get("teamId") || ""} initialPlayerId={search.get("playerId") || ""} />;
}

export default function MontageEditorPage() {
  return <Suspense fallback={<main style={{minHeight:"100vh",background:"#08101c",color:"white",display:"grid",placeItems:"center"}}>Chargement du Video Studio…</main>}><EditorContent /></Suspense>;
}
