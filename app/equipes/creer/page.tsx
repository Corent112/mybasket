"use client";

import { useRouter } from "next/navigation";
import TeamForm from "@/components/equipes/TeamForm";
import { emptyTeam } from "@/types/player";
import { saveTeam } from "@/lib/equipes-store";

export default function CreerEquipePage() {
  const router = useRouter();

  return (
    <main className="team-form-page">
      <button className="back-btn" onClick={() => router.push("/equipes")}>
        ← Retour
      </button>

      <h1>Créer une équipe</h1>

      <TeamForm
        team={emptyTeam()}
        onClose={() => router.push("/equipes")}
        onSave={(team) => {
          saveTeam(team);
          router.push("/equipes");
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