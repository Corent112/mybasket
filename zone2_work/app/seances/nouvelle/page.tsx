"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  clearSessionBuilderItems,
  loadSessionBuilderItems,
} from "@/lib/session-builder";

type Team = {
  id: string;
  name: string;
  club_name?: string | null;
  club_logo_url?: string | null;
  gymnasium?: string | null;
  coach_name?: string | null;
};

type Player = {
  id: string;
  team_id: string;
  first_name?: string | null;
  last_name?: string | null;
  position_primary?: string | null;
};

type SessionExercise = {
  exercise_id: string;
  title: string;
  who: string;
  duration_minutes: number;
  situation_image_url: string;
  explanation: string;
  instructions: string;
  sort_order: number;
};

export default function NouvelleSeancePage() {
  const supabase = createClient();

  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const [teamId, setTeamId] = useState("");
  const [title, setTitle] = useState("Séance d’entraînement");
  const [theme, setTheme] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:30");
  const [location, setLocation] = useState("");

  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [sessionExercises, setSessionExercises] = useState<SessionExercise[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedTeam = teams.find((team) => team.id === teamId);

  const filteredPlayers = useMemo(() => {
    return players.filter((player) => player.team_id === teamId);
  }, [players, teamId]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedTeam?.gymnasium && !location) {
      setLocation(selectedTeam.gymnasium);
    }
  }, [selectedTeam, location]);

  async function loadData() {
    setLoading(true);

    const { data: teamsData } = await supabase
      .from("teams")
      .select("*")
      .order("name", { ascending: true });

    const { data: playersData } = await supabase
      .from("players")
      .select("*")
      .order("last_name", { ascending: true });

    const builderItems = await loadSessionBuilderItems();

    setTeams((teamsData ?? []) as Team[]);
    setPlayers((playersData ?? []) as Player[]);

    setSessionExercises(
      builderItems.map((item, index) => ({
        exercise_id: item.item_id ?? "",
        title: item.title,
        who: item.assigned_to ?? "Coach principal",
        duration_minutes: item.duration_minutes ?? 10,
        situation_image_url: item.image_url ?? "",
        explanation: item.description ?? "",
        instructions: "",
        sort_order: index,
      }))
    );

    setLoading(false);
  }

  function togglePlayer(playerId: string) {
    setSelectedPlayers((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  }

  function selectAllPlayers() {
    setSelectedPlayers(filteredPlayers.map((player) => player.id));
  }

  function clearPlayers() {
    setSelectedPlayers([]);
  }

  function removeExercise(index: number) {
    setSessionExercises((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, sort_order: i }))
    );
  }

  function updateExercise(
    index: number,
    field: keyof SessionExercise,
    value: string | number
  ) {
    setSessionExercises((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function moveExercise(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= sessionExercises.length) return;

    const copy = [...sessionExercises];
    [copy[index], copy[targetIndex]] = [copy[targetIndex], copy[index]];

    setSessionExercises(
      copy.map((item, i) => ({
        ...item,
        sort_order: i,
      }))
    );
  }

  function normalizePosition(position?: string | null) {
    const value = position?.toLowerCase() ?? "";

    if (
      value.includes("guard") ||
      value.includes("meneur") ||
      value.includes("arrière")
    ) {
      return "guard";
    }

    if (
      value.includes("forward") ||
      value.includes("ailier") ||
      value.includes("poste 3") ||
      value.includes("poste 4")
    ) {
      return "forward";
    }

    if (
      value.includes("center") ||
      value.includes("pivot") ||
      value.includes("poste 5")
    ) {
      return "center";
    }

    return "guard";
  }

  async function saveSession() {
    setSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("Tu dois être connecté.");
      setSaving(false);
      return;
    }

    if (!teamId) {
      alert("Choisis une équipe.");
      setSaving(false);
      return;
    }

    if (!date) {
      alert("Choisis une date.");
      setSaving(false);
      return;
    }

    if (!theme.trim()) {
      alert("Indique un thème de séance.");
      setSaving(false);
      return;
    }

    if (sessionExercises.length === 0) {
      alert("Ajoute au moins un exercice à ta séance depuis le panier.");
      setSaving(false);
      return;
    }

    const { data: session, error: sessionError } = await supabase
      .from("practice_sessions")
      .insert({
        user_id: user.id,
        visibility: "private",
        team_id: teamId,
        title,
        theme,
        session_date: date,
        start_time: startTime,
        end_time: endTime,
        location,
        club_logo_url: selectedTeam?.club_logo_url ?? null,
        mybasket_logo_url: "/logo-mybasket02.png",
        pdf_url: null,
      })
      .select()
      .single();

    if (sessionError || !session) {
      console.error(sessionError);
      alert("Erreur lors de la création de la séance.");
      setSaving(false);
      return;
    }

    const selectedPlayerRows = players.filter((player) =>
      selectedPlayers.includes(player.id)
    );

    if (selectedPlayerRows.length > 0) {
  await supabase.from("practice_session_attendance").insert(
    selectedPlayerRows.map((player) => ({
      user_id: user.id,
      session_id: session.id,
      player_id: player.id,
      first_name: player.first_name,
      last_name: player.last_name,
      status: "present",
      comment: "",
    }))
  );
}

    const { error: exercisesInsertError } = await supabase
      .from("practice_session_exercises")
      .insert(
        sessionExercises.map((exercise, index) => ({
          session_id: session.id,
          user_id: user.id,
          exercise_id: exercise.exercise_id,
          title: exercise.title,
          who: exercise.who,
          duration_minutes: exercise.duration_minutes,
          situation_image_url: exercise.situation_image_url,
          explanation: exercise.explanation,
          instructions: exercise.instructions,
          sort_order: index,
        }))
      );

    if (exercisesInsertError) {
      console.error(exercisesInsertError);
      alert("La séance est créée, mais erreur sur les exercices.");
      setSaving(false);
      return;
    }

    const { error: calendarError } = await supabase.from("calendar_events").insert({
  user_id: user.id,
  visibility: "private",
  event_type: "training",
  session_id: session.id,
  title,
  description: `Séance ${selectedTeam?.name ?? ""} - Thème : ${theme}`,
  event_date: date,
  start_time: startTime,
  end_time: endTime,
  location,
  attachment_url: null,
});

if (calendarError) {
  console.error("Erreur création calendrier :", calendarError);
  alert(`Erreur calendrier : ${calendarError.message}`);
}

    try {
      const pdfResponse = await fetch(`/api/seances/${session.id}/pdf`, { method: "POST" });
      if (!pdfResponse.ok) {
        const payload = await pdfResponse.json().catch(() => ({}));
        console.warn("La séance est créée, mais le PDF n'a pas pu être généré:", payload);
      }
    } catch (pdfError) {
      console.warn("La séance est créée, mais le PDF est temporairement indisponible:", pdfError);
    }

    await clearSessionBuilderItems();

    setSaving(false);
    window.location.href = `/seances/${session.id}`;
  }

  if (loading) {
    return (
      <main className="page">
        <p>Chargement...</p>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <h1>CRÉER UNE SÉANCE</h1>
        <p>Choisis ton équipe, tes joueurs et finalise ta fiche d’entraînement.</p>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Informations séance</h2>

          <label>
            Titre
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label>
            Équipe
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Choisir une équipe</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <div className="two">
            <label>
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>

            <label>
              Thème
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="Ex : Défense PnR"
              />
            </label>
          </div>

          <div className="two">
            <label>
              Début
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>

            <label>
              Fin
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>

          <label>
            Lieu
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Gymnase / salle"
            />
          </label>
        </div>

        <div className="panel">
          <div className="panelHead">
            <h2>Joueurs</h2>

            {teamId && filteredPlayers.length > 0 && (
              <div className="smallActions">
                <button type="button" onClick={selectAllPlayers}>
                  Tout sélectionner
                </button>

                <button type="button" onClick={clearPlayers}>
                  Vider
                </button>
              </div>
            )}
          </div>

          {!teamId ? (
            <div className="empty">Choisis une équipe pour afficher les joueurs.</div>
          ) : filteredPlayers.length === 0 ? (
            <div className="empty">Aucun joueur trouvé pour cette équipe.</div>
          ) : (
            <div className="players">
              {filteredPlayers.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className={selectedPlayers.includes(player.id) ? "active" : ""}
                  onClick={() => togglePlayer(player.id)}
                >
                  <strong>
                    {player.first_name} {player.last_name}
                  </strong>
                  <small>{player.position_primary ?? "Poste non renseigné"}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel full">
        <h2>Fiche séance</h2>

        {sessionExercises.length === 0 ? (
          <div className="empty">
            Aucun exercice ajouté. Retourne sur une fiche exercice puis clique sur
            “Ajouter à ma fiche séance”.
          </div>
        ) : (
          sessionExercises.map((exercise, index) => (
            <article
              key={`${exercise.exercise_id}-${index}`}
              className="sessionItem"
            >
              <div className="order">
                <button type="button" onClick={() => moveExercise(index, "up")}>
                  ↑
                </button>

                <button type="button" onClick={() => moveExercise(index, "down")}>
                  ↓
                </button>
              </div>

              <div className="sessionContent">
                <div className="sessionTop">
                  <h3>
                    {index + 1}. {exercise.title}
                  </h3>

                  <button type="button" onClick={() => removeExercise(index)}>
                    🗑
                  </button>
                </div>

                <div className="two">
                  <label>
                    Temps en minutes
                    <input
                      type="number"
                      min={1}
                      value={exercise.duration_minutes}
                      onChange={(e) =>
                        updateExercise(
                          index,
                          "duration_minutes",
                          Number(e.target.value)
                        )
                      }
                    />
                  </label>

                  <label>
                    Fait par
                    <input
                      value={exercise.who}
                      onChange={(e) =>
                        updateExercise(index, "who", e.target.value)
                      }
                      placeholder="Coach / joueur / groupe"
                    />
                  </label>
                </div>

                <label>
                  Explications
                  <textarea
                    value={exercise.explanation}
                    onChange={(e) =>
                      updateExercise(index, "explanation", e.target.value)
                    }
                  />
                </label>

                <label>
                  Consignes
                  <textarea
                    value={exercise.instructions}
                    onChange={(e) =>
                      updateExercise(index, "instructions", e.target.value)
                    }
                  />
                </label>
              </div>
            </article>
          ))
        )}
      </section>

      <div className="saveBar">
        <button type="button" onClick={saveSession} disabled={saving}>
          {saving ? "Création..." : "Créer la séance + événement calendrier"}
        </button>
      </div>

      <style jsx>{`
        .page {
          background: #fff;
          min-height: 100vh;
          padding: 44px 56px 90px;
        }

        .hero {
          text-align: center;
          margin-bottom: 34px;
        }

        .hero h1 {
          margin: 0;
          color: #7a0d24;
          font-size: 46px;
          font-family: Oswald, Roboto, sans-serif;
        }

        .hero p {
          color: #666;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 28px;
          margin-bottom: 28px;
        }

        .panel {
          background: white;
          border: 1px solid #eee;
          border-radius: 14px;
          padding: 22px;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.07);
        }

        .full {
          margin-bottom: 28px;
        }

        .panelHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 18px;
        }

        h2 {
          margin: 0 0 18px;
          color: #7a0d24;
          font-family: Oswald, Roboto, sans-serif;
        }

        .panelHead h2 {
          margin: 0;
        }

        label {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-bottom: 14px;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          color: #7a0d24;
        }

        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 0 12px;
          min-height: 42px;
          background: white;
          color: #111;
        }

        textarea {
          min-height: 72px;
          padding-top: 10px;
          resize: vertical;
        }

        .two {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .empty {
          border: 1px dashed #ddd;
          border-radius: 12px;
          padding: 28px;
          text-align: center;
          color: #777;
        }

        .smallActions {
          display: flex;
          gap: 8px;
        }

        .smallActions button {
          border: 1px solid #d4a24c;
          background: white;
          color: #7a0d24;
          border-radius: 8px;
          padding: 8px 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .players {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .players button {
          border: 1px solid #ddd;
          border-radius: 12px;
          background: white;
          padding: 10px 14px;
          cursor: pointer;
          font-weight: 800;
          display: flex;
          flex-direction: column;
          gap: 4px;
          text-align: left;
        }

        .players button small {
          color: #777;
          font-weight: 600;
        }

        .players .active {
          background: #7a0d24;
          color: white;
          border-color: #7a0d24;
        }

        .players .active small {
          color: #f5d487;
        }

        .sessionItem {
          display: grid;
          grid-template-columns: 42px 1fr;
          gap: 14px;
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 14px;
        }

        .order {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .order button {
          height: 28px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: white;
          color: #7a0d24;
          font-weight: 900;
          cursor: pointer;
        }

        .sessionTop {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .sessionTop h3 {
          margin: 0;
        }

        .sessionTop button {
          border: none;
          background: transparent;
          cursor: pointer;
        }

        .saveBar {
          position: sticky;
          bottom: 20px;
          display: flex;
          justify-content: center;
          margin-top: 20px;
        }

        .saveBar button {
          height: 58px;
          padding: 0 36px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(90deg, #7a0d24, #a20f36);
          color: white;
          font-size: 16px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 10px 28px rgba(122, 13, 36, 0.28);
        }

        .saveBar button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 1000px) {
          .page {
            padding: 28px 20px 90px;
          }

          .grid,
          .two {
            grid-template-columns: 1fr;
          }

          .panelHead {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}