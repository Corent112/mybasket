"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ClubManagementPro from "@/components/club/ClubManagementPro";
import { getMyClub, type MyClub } from "@/lib/club-dashboard";

export default function ClubPage() {
  const [club, setClub] = useState<MyClub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getMyClub();
        setClub(data);
      } catch (e: any) {
        setError(e?.message || "Impossible de charger le club.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <main style={{ padding: 32 }}>
        Chargement de l’espace club...
      </main>
    );
  }

  if (error || !club) {
    return (
      <main style={{ padding: 32 }}>
        <Link href="/mon-compte">← Retour Mon Compte</Link>
        <h1>Aucun club lié</h1>
        <p>{error || "Ton compte n’est pas encore rattaché à un club."}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 32, background: "#f6f2ec", minHeight: "100vh" }}>
      <Link
        href="/mon-compte"
        style={{
          display: "inline-flex",
          marginBottom: 18,
          color: "#6b1a2c",
          fontWeight: 900,
          textDecoration: "none",
        }}
      >
        ← Retour Mon Compte
      </Link>

      <ClubManagementPro clubId={club.id} clubName={club.name} />
    </main>
  );
}