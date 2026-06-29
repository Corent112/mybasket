"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const OLD_KEY = "mybasket_equipes";

export default function MigrationEquipesPage() {
  const supabase = createClient();
  const [status, setStatus] = useState("");

  async function migrate() {
    setStatus("Migration en cours...");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStatus("Tu dois être connecté.");
      return;
    }

    const raw = localStorage.getItem(OLD_KEY);

    if (!raw) {
      setStatus("Aucune équipe trouvée dans localStorage.");
      return;
    }

    const oldTeams = JSON.parse(raw);

    for (const oldTeam of oldTeams) {
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({
          user_id: user.id,
          name: oldTeam.name ?? "Équipe sans nom",
          club_name: oldTeam.name ?? null,
          club_logo_url: oldTeam.logo ?? null,
          banner_url: oldTeam.banniere ?? null,
          category: oldTeam.cat ?? oldTeam.categorieLabel ?? null,
          gender: oldTeam.genre ?? null,
          level: oldTeam.niveau ?? null,
          season: oldTeam.saison ?? "2025-2026",
          coach_name: oldTeam.entraineurPrincipal ?? oldTeam.coach ?? null,
          gymnasium: oldTeam.sallePrincipale ?? null,
          training_slots: oldTeam.creneaux ?? null,
          wins: oldTeam.teamStats?.wins ?? 0,
          losses: oldTeam.teamStats?.losses ?? 0,
          draws: oldTeam.teamStats?.draws ?? 0,
          pts_for: oldTeam.teamStats?.ptsFor ?? 0,
          pts_against: oldTeam.teamStats?.ptsAgainst ?? 0,
          metadata: oldTeam,
        })
        .select()
        .single();

      if (teamError || !team) {
        console.error(teamError);
        continue;
      }

      if (Array.isArray(oldTeam.players)) {
        await supabase.from("players").insert(
          oldTeam.players.map((player: any) => ({
            user_id: user.id,
            team_id: team.id,
            first_name: player.firstName ?? null,
            last_name: player.lastName ?? null,
            number: player.num ?? null,
            photo_url: player.photo ?? null,
            position_primary: player.postePrincipal ?? null,
            position_secondary: player.posteSecondaire ?? null,
            birth_date: convertFrenchDate(player.dob),
            age: player.age ?? null,
            height: player.taille ?? null,
            weight: player.poids ?? null,
            dominant_hand: player.mainDominante ?? null,
            status: player.statut ?? null,
            license_number: player.licenseNumber ?? player.numeroLicence ?? null,
            tutor1_phone: player.tutor1Phone ?? null,
            tutor1_email: player.tutor1Email ?? null,
            tutor2_phone: player.tutor2Phone ?? null,
            tutor2_email: player.tutor2Email ?? null,
            presence_pct: player.presencePct ?? 0,
            punctuality_pct: player.ponctualitePct ?? 0,
            potential: player.potentiel ?? null,
            notes: player.notes ?? null,
            metadata: player,
          }))
        );
      }

      if (Array.isArray(oldTeam.staff)) {
        await supabase.from("team_staff").insert(
          oldTeam.staff.map((staff: any) => ({
            user_id: user.id,
            team_id: team.id,
            name: `${staff.prenom ?? ""} ${staff.nom ?? ""}`.trim(),
            role: staff.role ?? null,
          }))
        );
      }

      if (Array.isArray(oldTeam.matchs)) {
        await supabase.from("team_matches").insert(
          oldTeam.matchs.map((match: any) => ({
            user_id: user.id,
            team_id: team.id,
            opponent: match.adversaire ?? "Adversaire",
            match_date: convertFrenchDate(match.date),
            location: match.lieu ?? null,
            home_away: match.domicile ? "home" : "away",
            metadata: match,
          }))
        );
      }
    }

    setStatus("Migration terminée ✅");
  }

  function convertFrenchDate(value?: string | null) {
    if (!value) return null;

    if (value.includes("/")) {
      const [day, month, year] = value.split("/");
      if (!day || !month || !year) return null;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    return value;
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Migration équipes vers Supabase</h1>

      <button onClick={migrate}>
        Migrer mes équipes
      </button>

      <p>{status}</p>
    </main>
  );
}