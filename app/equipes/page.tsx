// app/equipes/page.tsx
// Onglet « Mon compte › Mes Équipes » — version Supabase.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PlayerForm from "@/components/equipes/PlayerForm";
import TeamForm from "@/components/equipes/TeamForm";
import type { Player, Team, TeamMatch, UserProfile } from "../../types/player";
import { emptyProfile, emptyTeam, emptyPlayer } from "../../types/player";

const NAV = [
  ["👤", "Mon Profil"],
  ["💬", "Messagerie"],
  ["❤️", "Mes Favoris"],
  ["🎟️", "Mes Réservations"],
  ["💳", "Mon Abonnement"],
  ["🗓️", "Mon Calendrier"],
  ["🏀", "Mes Exercices"],
  ["📋", "Mes Playbooks"],
  ["⚡", "Mon Profil Coach"],
  ["📣", "Mes Annonces"],
  ["💰", "Mes Revenus"],
  ["📄", "Mes Papiers"],
  ["👥", "Mes Equipes"],
  ["📊", "Management"],
] as const;

const TOPNAV = [
  "Bibliothèque",
  "Plaquette",
  "Accompagnement",
  "Annonces",
  "Abonnements",
  "Boutique",
];

const uuid = () => crypto.randomUUID();

function safeNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  return String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function mapPlayerRow(row: any, team?: Team): Player {
  const base = emptyPlayer();

  const firstName = str(row.first_name ?? row.firstName ?? row.prenom ?? row.firstname);
  const lastName = str(row.last_name ?? row.lastName ?? row.nom ?? row.lastname);

  return {
    ...base,
    id: str(row.id),
    supabasePlayerId: str(row.id),
    firstName: firstName || str(row.name).split(" ")[0] || "",
    lastName:
      lastName ||
      str(row.name)
        .split(" ")
        .slice(1)
        .join(" ") ||
      "",
    num:
      row.number !== undefined
        ? safeNum(row.number)
        : row.num !== undefined
          ? safeNum(row.num)
          : row.number_jersey !== undefined
            ? safeNum(row.number_jersey)
            : null,
    photo: row.photo_url ?? row.photo ?? null,
    club: team?.name || row.club || "",
    clubLogo: team?.logo || null,
    categorie: team?.categorieLabel || team?.cat || "",
    postePrincipal:
      row.position_pri ||
      row.position ||
      row.postePrincipal ||
      row.poste ||
      base.postePrincipal,
    posteSecondaire:
      row.position_sec || row.posteSecondaire || row.secondary_position || "",
    taille: row.height || row.taille || "",
    poids: row.weight || row.poids || "",
    age: row.age ?? null,
    dob: row.birth_date || row.dob || "",
    mainDominante: row.dominant_hand || row.mainDominante || base.mainDominante,
    statut: row.status || row.statut || base.statut,
    potentiel: safeNum(row.potential ?? row.potentiel ?? base.potentiel),
    ancienneteLabel: row.anciennete_label || row.ancienneteLabel || "",
    contratJusquau: row.contrat_jusquau || row.contratJusquau || "",
    presencePct: safeNum(row.presence_pct ?? row.presencePct),
    ponctualitePct: safeNum(row.punctuality_pct ?? row.ponctualitePct),
    notes: row.notes || "",
    radar: {
      ...base.radar,
      ...(typeof row.radar === "object" && row.radar ? row.radar : {}),
    },
    stats: {
      ...base.stats,
      pts: safeNum(row.pts ?? row.points ?? row.stats?.pts),
      reb: safeNum(row.reb ?? row.rebounds ?? row.stats?.reb),
      ast: safeNum(row.ast ?? row.assists ?? row.stats?.ast),
      stl: safeNum(row.stl ?? row.steals ?? row.stats?.stl),
      blk: safeNum(row.blk ?? row.blocks ?? row.stats?.blk),
      to: safeNum(row.turnovers ?? row.to ?? row.stats?.to),
      pctTir: safeNum(row.pct_tir ?? row.stats?.pctTir),
      pct3pts: safeNum(row.pct_3pts ?? row.stats?.pct3pts),
      pctLf: safeNum(row.pct_lf ?? row.stats?.pctLf),
    },
  } as Player;
}

function mapTeamRow(row: any): Team {
  const base = emptyTeam();

  return {
    ...base,
    id: str(row.id),
    supabaseTeamId: str(row.id),
    clubId: row.club_id ?? row.clubId ?? null,
    season: row.season || row.saison || "2025-2026",
    name: row.name || row.nom || row.club_name || "Équipe",
    cat: row.cat || row.category || row.categorie || "",
    coach: row.coach || row.entraineur_principal || "",
    logo: row.logo_url || row.logo || null,
    categorieLabel:
      row.categorie_label ||
      row.categorieLabel ||
      row.category_label ||
      row.cat ||
      "",
    niveau: row.niveau || row.level || "",
    genre: row.genre || row.gender || "",
    tags: toArray(row.tags),
    banniere: row.banner_url || row.banniere || row.team_photo_url || null,
    entraineurPrincipal:
      row.entraineur_principal ||
      row.entraineurPrincipal ||
      row.coach ||
      "",
    assistant: row.assistant || row.assistant_name || "",
    sallePrincipale:
      row.salle_principale ||
      row.sallePrincipale ||
      row.location ||
      "",
    dateCreation:
      row.date_creation ||
      row.dateCreation ||
      row.created_at?.slice?.(0, 10) ||
      "",
    couleurs:
      Array.isArray(row.couleurs) && row.couleurs.length
        ? row.couleurs
        : Array.isArray(row.colors) && row.colors.length
          ? row.colors
          : base.couleurs,
    staff: Array.isArray(row.staff) ? row.staff : [],
    evenements: Array.isArray(row.evenements) ? row.evenements : [],
    matchs: [],
    statsHistory: [],
    teamStats: base.teamStats,
    kpi: base.kpi,
    players: [],
  };
}

function teamToSupabase(team: Team, userId: string) {
  return {
    id: team.id || team.supabaseTeamId || uuid(),
    user_id: userId,
    name: team.name,
    cat: team.cat,
    category: team.cat,
    categorie_label: team.categorieLabel,
    niveau: team.niveau,
    genre: team.genre,
    tags: team.tags || [],
    coach: team.coach || team.entraineurPrincipal || "",
    entraineur_principal: team.entraineurPrincipal || team.coach || "",
    assistant: team.assistant || "",
    salle_principale: team.sallePrincipale || "",
    date_creation: team.dateCreation || null,
    couleurs: team.couleurs || ["#7a1228", "#e0a82e"],
    logo_url: team.logo || null,
    banner_url: team.banniere || null,
    season: team.season || "2025-2026",
  };
}

function playerToSupabase(player: Player, teamId: string, userId: string) {
  return {
    id: player.id || player.supabasePlayerId || uuid(),
    user_id: userId,
    team_id: teamId,
    first_name: player.firstName || "",
    last_name: player.lastName || "",
    number: player.num,
    photo_url: player.photo || null,
    position_pri: player.postePrincipal || "",
    position_sec: player.posteSecondaire || "",
    birth_date: player.dob || null,
    age: player.age,
    height: player.taille || "",
    weight: player.poids || "",
    dominant_hand: player.mainDominante || "",
    status: player.statut || "",
    presence_pct: player.presencePct || 0,
    punctuality_pct: player.ponctualitePct || 0,
    potential: player.potentiel || 0,
    notes: player.notes || "",
  };
}

async function loadSupabaseProfile(): Promise<UserProfile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return emptyProfile();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    ...emptyProfile(),
    prenom:
      data?.prenom ||
      data?.first_name ||
      String(data?.display_name || "").split(" ")[0] ||
      "",
    nom:
      data?.nom ||
      data?.last_name ||
      String(data?.display_name || "").split(" ").slice(1).join(" ") ||
      "",
    club: data?.club || "",
    clubLogo: data?.club_logo || data?.clubLogo || null,
    photo: data?.avatar_url || data?.photo || null,
    dob: data?.dob || data?.birth_date || "",
    email: data?.email || user.email || "",
    telephone: data?.telephone || data?.phone || "",
  };
}

export default function MesEquipesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [teams, setTeams] = useState<Team[]>([]);
  const [profile, setProfile] = useState<UserProfile>(emptyProfile());
  const [teamForm, setTeamForm] = useState<{ open: boolean; team?: Team }>({
    open: false,
  });
  const [playerFor, setPlayerFor] = useState<string | null>(null);
  const [matchFor, setMatchFor] = useState<string | null>(null);
  const [editProfile, setEditProfile] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        setTeams([]);
        setProfile(emptyProfile());
        return;
      }

      const [profileData, teamsRes] = await Promise.all([
        loadSupabaseProfile(),
        supabase
          .from("teams")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      if (teamsRes.error) throw teamsRes.error;

      const mappedTeams = ((teamsRes.data ?? []) as any[]).map(mapTeamRow);
      const teamIds = mappedTeams.map((team) => team.id).filter(Boolean);

      let players: any[] = [];

      if (teamIds.length) {
        const { data: playersData, error: playersError } = await supabase
          .from("players")
          .select("*")
          .in("team_id", teamIds);

        if (playersError) throw playersError;
        players = playersData ?? [];
      }

      const byTeam: Record<string, Player[]> = {};
      players.forEach((row) => {
        const teamId = str(row.team_id);
        const team = mappedTeams.find((t) => t.id === teamId);
        if (!teamId) return;
        if (!byTeam[teamId]) byTeam[teamId] = [];
        byTeam[teamId].push(mapPlayerRow(row, team));
      });

      mappedTeams.forEach((team) => {
        team.players = (byTeam[team.id] || []).sort(
          (a, b) => safeNum(a.num) - safeNum(b.num),
        );
      });

      setProfile(profileData);
      setTeams(mappedTeams);
    } catch (error) {
      console.error("Erreur chargement équipes Supabase :", error);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  }

  async function getMyActiveClubId(userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from("club_members")
      .select("club_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Erreur récupération club du coach :", error);
      return null;
    }

    return data?.club_id ?? null;
  }

  async function syncTeamWithClubTeam({
    clubId,
    userId,
    savedTeam,
    sourceTeam,
  }: {
    clubId: string;
    userId: string;
    savedTeam: any;
    sourceTeam: Team;
  }) {
    const season = savedTeam.season || sourceTeam.season || "2025-2026";
    const name = savedTeam.name || sourceTeam.name || "Équipe";

    const clubTeamPayload = {
      club_id: clubId,
      name,
      category:
        savedTeam.category ||
        savedTeam.cat ||
        savedTeam.categorie_label ||
        sourceTeam.cat ||
        sourceTeam.categorieLabel ||
        null,
      level: savedTeam.niveau || sourceTeam.niveau || null,
      season,
      logo_url: savedTeam.logo_url || sourceTeam.logo || null,
      banner_url: savedTeam.banner_url || sourceTeam.banniere || null,
      status: "active",
      gender: savedTeam.genre || sourceTeam.genre || null,
      coach_id: userId,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };

    const { data: existingById, error: existingByIdError } = await supabase
      .from("club_teams")
      .select("id")
      .eq("id", savedTeam.id)
      .maybeSingle();

    if (existingByIdError) {
      console.error("Erreur recherche club_teams par id :", existingByIdError);
    }

    if (existingById?.id) {
      const { error: updateError } = await supabase
        .from("club_teams")
        .update(clubTeamPayload)
        .eq("id", existingById.id);

      if (updateError) throw updateError;
      return;
    }

    const { data: existingByName, error: existingByNameError } = await supabase
      .from("club_teams")
      .select("id")
      .eq("club_id", clubId)
      .eq("name", name)
      .eq("season", season)
      .maybeSingle();

    if (existingByNameError) {
      console.error("Erreur recherche club_teams par nom :", existingByNameError);
    }

    if (existingByName?.id) {
      const { error: updateError } = await supabase
        .from("club_teams")
        .update(clubTeamPayload)
        .eq("id", existingByName.id);

      if (updateError) throw updateError;
      return;
    }

    const { error: insertError } = await supabase.from("club_teams").insert({
      id: savedTeam.id || uuid(),
      ...clubTeamPayload,
    });

    if (insertError) throw insertError;
  }

  async function handleTeamSave(t: Team) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Utilisateur non connecté");

      const payload = teamToSupabase(t, user.id);

      const { data: savedTeam, error } = await supabase
        .from("teams")
        .upsert(payload)
        .select("*")
        .single();

      if (error) throw error;

      const clubId = await getMyActiveClubId(user.id);

      if (clubId) {
        try {
          await syncTeamWithClubTeam({
            clubId,
            userId: user.id,
            savedTeam,
            sourceTeam: t,
          });

          flash("Équipe enregistrée et reliée au club ✓");
        } catch (clubTeamError: any) {
          console.error("Erreur liaison équipe club :", clubTeamError);
          flash("Équipe créée, mais non reliée au club");
        }
      } else {
        flash("Équipe enregistrée ✓ Aucun club actif trouvé");
      }

      setTeamForm({ open: false });
      await reload();
    } catch (error: any) {
      console.error("Erreur sauvegarde équipe :", error);
      flash(error?.message || "Erreur sauvegarde équipe");
    }
  }

  async function handleDeleteTeam(t: Team) {
    if (!confirm(`Supprimer définitivement l'équipe « ${t.name} » ?`)) return;

    try {
      await supabase.from("players").delete().eq("team_id", t.id);
      const { error } = await supabase.from("teams").delete().eq("id", t.id);

      if (error) throw error;

      await reload();
      flash("Équipe supprimée");
    } catch (error: any) {
      console.error("Erreur suppression équipe :", error);
      flash(error?.message || "Erreur suppression équipe");
    }
  }

  async function handlePlayerSave(teamId: string, p: Player) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Utilisateur non connecté");

      const payload = playerToSupabase(p, teamId, user.id);
      const { error } = await supabase.from("players").upsert(payload);

      if (error) throw error;

      setPlayerFor(null);
      await reload();
      flash("Joueur enregistré dans Supabase ✓");
    } catch (error: any) {
      console.error("Erreur sauvegarde joueur :", error);
      flash(error?.message || "Erreur sauvegarde joueur");
    }
  }

  async function handleMatchSave(teamId: string, m: TeamMatch) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Utilisateur non connecté");

      const title =
        m.kind === "Match"
          ? `Match vs ${m.adversaire || "Adversaire"}`
          : "Entraînement";

      const { error } = await supabase.from("calendar_events").insert({
        user_id: user.id,
        title,
        description: m.kind,
        event_date: m.date,
        start_time: m.heure || null,
        end_time: null,
        location: m.lieu || null,
        event_type: m.kind,
      });

      if (error) throw error;

      setMatchFor(null);
      await reload();
      flash("Ajouté au calendrier Supabase ✓");
    } catch (error: any) {
      console.error("Erreur calendrier :", error);
      flash(error?.message || "Erreur calendrier");
    }
  }

  async function handlePlayerDelete(teamId: string, player: Player) {
    if (!confirm(`Retirer ${player.firstName} ${player.lastName} de l'effectif ?`)) {
      return;
    }

    try {
      const { error } = await supabase.from("players").delete().eq("id", player.id);

      if (error) throw error;

      await reload();
      flash("Joueur supprimé");
    } catch (error: any) {
      console.error("Erreur suppression joueur :", error);
      flash(error?.message || "Erreur suppression joueur");
    }
  }

  async function handleProfileSave(p: UserProfile) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Utilisateur non connecté");

      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        email: p.email || user.email,
        display_name: `${p.prenom} ${p.nom}`.trim(),
        prenom: p.prenom,
        nom: p.nom,
        club: p.club,
        telephone: p.telephone,
        dob: p.dob,
        photo: p.photo,
      });

      if (error) throw error;

      setEditProfile(false);
      await reload();
      flash("Profil mis à jour ✓");
    } catch (error: any) {
      console.error("Erreur profil :", error);
      flash(error?.message || "Erreur profil");
    }
  }

  return (
    <div className="acc-wrap">
      <header className="acc-appbar">
        <div className="acc-brand">
          <span className="logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e0a82e" strokeWidth="1.7">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2c3.5 3 3.5 17 0 20M12 2c-3.5-3.5-3.5 17 0 20" />
            </svg>
          </span>
          <span>MY<br />BASKET</span>
        </div>
        <nav className="acc-nav">
          {TOPNAV.map((n) => (
            <a key={n}>{n}</a>
          ))}
        </nav>
        <span className="sp" />
        <span className="acc-pill">🇫🇷 FR ▾</span>
        <span className="acc-admin">🏀 Admin MyBasket <span className="o">▾</span></span>
      </header>

      <div className="acc-subbar">
        <span className="burger">☰</span>
        <span className="acc-search">🔍 Rechercher…</span>
        <span className="ico">▦</span>
        <span className="ico">♡</span>
        <span className="ico">🛒</span>
      </div>

      <button className="acc-back" onClick={() => router.back()}>
        ← Retour
      </button>

      <div className="acc-profile">
        <div className="acc-avatar">
          {profile.photo ? (
            <img src={profile.photo} alt="" />
          ) : (
            profile.prenom?.[0] || "?"
          )}
        </div>
        <div>
          <h2 className="acc-pname">
            {profile.prenom} {profile.nom}
          </h2>
          <div className="acc-pclub">🅿️ {profile.club}</div>
          <div className="acc-pmeta">
            {profile.dob}
            <br />
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <br />
            {profile.telephone}
          </div>
        </div>
        <button className="acc-modify" onClick={() => setEditProfile(true)}>
          Modifier les informations
        </button>
      </div>

      <hr className="acc-sep" />

      <div className="acc-body">
        <aside className="acc-side">
          {NAV.map(([em, label]) => (
            <a key={label} className={label === "Mes Equipes" ? "active" : ""}>
              <span className="em">{em}</span> {label}
            </a>
          ))}
          <a className="danger">
            <span className="em">⚡</span> Administration
          </a>
          <hr />
          <a>
            <span className="em">⚙️</span> Paramètres
          </a>
          <a className="danger">
            <span className="em">🚪</span> Déconnexion
          </a>
        </aside>

        <main>
          <div className="acc-main-h">
            <h1>Mes Équipes</h1>
            <button className="acc-new" onClick={() => setTeamForm({ open: true })}>
              + Nouvelle équipe
            </button>
          </div>

          <p className="acc-sub">
            Tes équipes, joueurs et matchs sont maintenant reliés à Supabase.
          </p>

          {loading && <div className="acc-empty">Chargement Supabase…</div>}

          {!loading && teams.length === 0 && (
            <div className="acc-empty">
              Aucune équipe Supabase trouvée. Crée une première équipe.
            </div>
          )}

          <div className="acc-teamgrid">
            {teams.map((t) => (
              <div key={t.id} className="acc-tcard">
                <div className="acc-tbanner">
                  {t.banniere ? (
                    <img src={t.banniere} alt="" />
                  ) : (
                    <div className="ph">🏀</div>
                  )}
                </div>

                <div className="acc-tbody">
                  <div className="acc-thead">
                    <div className="acc-tlogo">
                      {t.logo ? (
                        <img src={t.logo} alt="" />
                      ) : (
                        <span style={{ fontSize: "1.1rem" }}>🏀</span>
                      )}
                    </div>

                    <div>
                      <div className="acc-tname">{t.name}</div>
                      <div className="acc-tmeta">
                        {t.cat || t.categorieLabel} · {t.players.length} joueur(s)
                      </div>
                    </div>
                  </div>

                  {t.players.length > 0 && (
                    <div className="acc-players">
                      {t.players.map((p) => (
                        <div
                          key={p.id}
                          className="acc-chip"
                          onClick={() => router.push(`/equipes/${t.id}/${p.id}`)}
                        >
                          <span className="pp">
                            {p.photo ? (
                              <img src={p.photo} alt="" />
                            ) : (
                              p.firstName?.[0] || "?"
                            )}
                          </span>
                          <span>
                            {p.firstName} {p.lastName?.[0]}.
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="acc-actions">
                    <button
                      className="acc-b acc-b-bx"
                      onClick={() => router.push(`/equipes/${t.id}`)}
                    >
                      👁️ Voir la page de l'équipe
                    </button>
                    <button
                      className="acc-b acc-b-line"
                      onClick={() => setPlayerFor(t.id)}
                    >
                      + Joueur
                    </button>
                    <button
                      className="acc-b acc-b-cream"
                      onClick={() => setMatchFor(t.id)}
                    >
                      + Match / Entraînement
                    </button>
                  </div>

                  <div className="acc-row2">
                    <button
                      className="acc-b acc-b-line"
                      onClick={() => setTeamForm({ open: true, team: t })}
                    >
                      ✎ Éditer
                    </button>
                    <button
                      className="acc-b acc-b-trash"
                      title="Supprimer l'équipe"
                      onClick={() => handleDeleteTeam(t)}
                    >
                      🗑️
                    </button>
                  </div>

                  {t.players.length > 0 && (
                    <div className="acc-player-actions">
                      {t.players.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handlePlayerDelete(t.id, p)}
                        >
                          Supprimer {p.firstName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {teamForm.open && (
        <TeamForm
          team={teamForm.team}
          onSave={handleTeamSave}
          onClose={() => setTeamForm({ open: false })}
        />
      )}

      {playerFor && (
        <PlayerForm
          onSave={(p) => handlePlayerSave(playerFor, p)}
          onClose={() => setPlayerFor(null)}
        />
      )}

      {matchFor && (
        <MatchForm
          onSave={(m) => handleMatchSave(matchFor, m)}
          onClose={() => setMatchFor(null)}
        />
      )}

      {editProfile && (
        <ProfileForm
          initial={profile}
          onSave={handleProfileSave}
          onClose={() => setEditProfile(false)}
        />
      )}

      {toast && <div className="tl-toast">{toast}</div>}

      <style jsx>{`
        .acc-empty {
          border: 1px dashed #eadccc;
          border-radius: 18px;
          background: #fff8ef;
          color: #6b1a2c;
          font-weight: 900;
          padding: 1rem;
          margin: 1rem 0;
        }

        .acc-player-actions {
          display: none;
        }
      `}</style>
    </div>
  );
}

function MatchForm({
  onSave,
  onClose,
}: {
  onSave: (m: TeamMatch) => void;
  onClose: () => void;
}) {
  const [m, setM] = useState<TeamMatch>({
    id: "",
    kind: "Match",
    date: "",
    heure: "",
    adversaire: "",
    domicile: true,
  });

  return (
    <div className="tl-modal-bg" onClick={onClose}>
      <div
        className="tl-modal"
        style={{ maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Match / Entraînement</h3>

        <div className="tl-fields">
          <div className="tl-field">
            <label>Type</label>
            <select
              value={m.kind}
              onChange={(e) =>
                setM({ ...m, kind: e.target.value as TeamMatch["kind"] })
              }
            >
              <option>Match</option>
              <option>Entraînement</option>
            </select>
          </div>

          <div className="tl-field">
            <label>Date</label>
            <input
              value={m.date}
              onChange={(e) => setM({ ...m, date: e.target.value })}
              placeholder="2026-05-30"
            />
          </div>

          <div className="tl-field">
            <label>Heure</label>
            <input
              value={m.heure}
              onChange={(e) => setM({ ...m, heure: e.target.value })}
              placeholder="15:30"
            />
          </div>

          {m.kind === "Match" && (
            <div className="tl-field">
              <label>Adversaire</label>
              <input
                value={m.adversaire}
                onChange={(e) => setM({ ...m, adversaire: e.target.value })}
                placeholder="Massy"
              />
            </div>
          )}

          <div className="tl-field full">
            <label>Lieu (optionnel)</label>
            <input
              value={m.lieu || ""}
              onChange={(e) => setM({ ...m, lieu: e.target.value })}
              placeholder="Gymnase Carpentier"
            />
          </div>
        </div>

        <div className="tl-modal-actions">
          <button className="tl-btn tl-btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="tl-btn tl-btn-bx"
            onClick={() => {
              if (!m.date.trim()) return alert("La date est obligatoire.");
              onSave(m);
            }}
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileForm({
  initial,
  onSave,
  onClose,
}: {
  initial: UserProfile;
  onSave: (p: UserProfile) => void;
  onClose: () => void;
}) {
  const [p, setP] = useState<UserProfile>({ ...initial });
  const fileRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof UserProfile>(k: K, v: UserProfile[K]) {
    setP((prev) => ({ ...prev, [k]: v }));
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    const r = new FileReader();

    r.onload = () => {
      const img = new Image();

      img.onload = () => {
        const s = Math.min(1, 300 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        set("photo", c.toDataURL("image/jpeg", 0.85));
      };

      img.src = r.result as string;
    };

    r.readAsDataURL(f);
  }

  return (
    <div className="tl-modal-bg" onClick={onClose}>
      <div
        className="tl-modal"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Modifier les informations</h3>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "1rem",
          }}
        >
          {p.photo ? (
            <img
              src={p.photo}
              alt=""
              className="tl-upload-prev"
              style={{ borderRadius: "50%" }}
            />
          ) : (
            <div
              className="tl-upload-prev"
              style={{
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              👤
            </div>
          )}

          <button
            className="tl-btn tl-btn-ghost tl-btn-sm"
            onClick={() => fileRef.current?.click()}
          >
            Changer la photo
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={pick}
          />
        </div>

        <div className="tl-fields">
          <div className="tl-field">
            <label>Prénom</label>
            <input
              value={p.prenom}
              onChange={(e) => set("prenom", e.target.value)}
            />
          </div>

          <div className="tl-field">
            <label>Nom</label>
            <input value={p.nom} onChange={(e) => set("nom", e.target.value)} />
          </div>

          <div className="tl-field full">
            <label>Club</label>
            <input
              value={p.club}
              onChange={(e) => set("club", e.target.value)}
            />
          </div>

          <div className="tl-field">
            <label>Date de naissance</label>
            <input
              value={p.dob}
              onChange={(e) => set("dob", e.target.value)}
              placeholder="29/03/1991"
            />
          </div>

          <div className="tl-field">
            <label>Téléphone</label>
            <input
              value={p.telephone}
              onChange={(e) => set("telephone", e.target.value)}
            />
          </div>

          <div className="tl-field full">
            <label>Email</label>
            <input
              value={p.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
        </div>

        <div className="tl-modal-actions">
          <button className="tl-btn tl-btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="tl-btn tl-btn-bx" onClick={() => onSave(p)}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
