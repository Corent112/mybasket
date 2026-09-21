"use client";

import { useEffect } from "react";

export default function LegacyManagementMontagePage() {
  useEffect(() => {
    const query = typeof window !== "undefined" ? window.location.search : "";
    window.location.replace(`/montages${query}`);
  }, []);

  return (
    <main style={{
      minHeight: "60vh",
      display: "grid",
      placeItems: "center",
      fontFamily: "Arial, sans-serif",
    }}>
      <strong>Ouverture de Montage vidéo…</strong>
    </main>
  );
}
