"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Route de compatibilité. Les fiches Playbook utilisent désormais
 * /mon-compte/playbooks/[id].
 */
export default function PlaybooksCompatibilityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const id = searchParams.get("id");
    router.replace(id ? `/mon-compte/playbooks/${id}` : "/mon-compte?tab=playbooks");
  }, [router, searchParams]);

  return (
    <main style={{ minHeight: "50vh", display: "grid", placeItems: "center" }}>
      <p>Ouverture du playbook…</p>
    </main>
  );
}
