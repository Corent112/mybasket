"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TeamForm from "@/components/equipes/TeamForm";
import { getTeam, saveTeam } from "@/lib/equipes-store";
import type { Team } from "@/types/player";

export default function ModifierEquipePage() {
  const router = useRouter();
  const params = useParams();
  const teamId = String(params.teamId);

  const [team, setTeam] = useState<Team | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadTeam() {
      const foundTeam = await getTeam(teamId);
      if (alive) setTeam(foundTeam || null);
    }

    loadTeam();

    return () => {
      alive = false;
    };
  }, [teamId]);

  if (!team) {
    return <p style={{ padding: 40 }}>Équipe introuvable.</p>;
  }

  return (
    <main className="team-form-page">
      <button className="back-btn" onClick={() => router.push(`/equipes/${teamId}`)}>
        ← Retour
      </button>

      <h1>Modifier l’équipe</h1>

      <TeamForm
        team={team}
        onClose={() => router.push(`/equipes/${teamId}`)}
        onSave={(updatedTeam) => {
          saveTeam(updatedTeam);
          router.push(`/equipes/${updatedTeam.id}`);
        }}
      />

      <style jsx>{`
        .team-form-page {
          max-width: 920px;
          margin: 0 auto;
          padding: 40px 24px;
        }

        .back-btn {
          border: 1px solid #7b0018;
          color: #7b0018;
          background: white;
          border-radius: 999px;
          padding: 10px 18px;
          font-weight: 900;
          margin-bottom: 24px;
        }

        h1 {
          color: #7b0018;
          text-transform: uppercase;
          font-size: 38px;
          margin-bottom: 28px;
        }
      `}</style>
    </main>
  );
}