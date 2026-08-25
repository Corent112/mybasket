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
    return <main style={{ padding: 32 }}>Chargement de l’espace club...</main>;
  }

  if (error || !club) {
    return (
      <main style={{ padding: 32, background: "#f6f2ec", minHeight: "100vh" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Link href="/mon-compte" style={{ color: "#6b1a2c", fontWeight: 900, textDecoration: "none" }}>
            ← Retour Mon Compte
          </Link>
          <section style={{ marginTop: 18, background: "linear-gradient(135deg,#6b1a2c,#35101a)", color: "#fff", borderRadius: 24, padding: 28 }}>
            <div style={{ color: "#d4a24c", fontSize: 12, fontWeight: 1000, letterSpacing: ".12em" }}>ESPACE CLUB</div>
            <h1 style={{ margin: "6px 0 8px", fontSize: 38 }}>Créer mon club</h1>
            <p style={{ margin: 0, opacity: .88 }}>
              Crée d’abord ton espace club. Tu pourras ensuite ajouter tes équipes, joueurs, staff, planning, documents et outils de gestion.
            </p>
          </section>
          <section style={{ marginTop: 14, background: "#fff", border: "1px solid #eadfd8", borderRadius: 18, padding: 22 }}>
            <h2 style={{ marginTop: 0 }}>Aucun club lié à ton compte</h2>
            <p style={{ color: "#766860" }}>
              {error || "Comme pour l’espace Institutionnel, commence par créer ta structure. Ton compte sera automatiquement enregistré comme propriétaire du club."}
            </p>
            <Link href="/mon-compte/club/creation" style={{ display: "inline-flex", marginTop: 8, background: "#6b1a2c", color: "#fff", padding: "11px 16px", borderRadius: 10, fontWeight: 950, textDecoration: "none" }}>
              + Créer mon club
            </Link>
          </section>
        </div>
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

      <ClubManagementPro
        clubId={club.id}
        clubName={club.name}
        logoUrl={club.logo_url}
      />
    </main>
  );
}
