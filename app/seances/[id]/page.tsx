"use client";

import { openFileSameTab } from "@/lib/client-file-actions";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cleanPracticeText, parsePracticeDuration, shortCoachCode } from "@/lib/practice-session-format";

type PracticeSession = {
  id: string;
  user_id: string;
  owner_id?: string | null;
  visibility?: "public" | "private" | null;
  team_id: string | null;
  title: string;
  theme: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  club_logo_url: string | null;
  mybasket_logo_url: string | null;
  pdf_url: string | null;
  team_composition_blocks?: Array<{
    id?: string;
    title: string;
    playersPerTeam?: number;
    teams: Array<{ id?: string; name: string; playerIds: string[] }>;
  }> | null;
  player_groups?: Record<string, string[]> | null;
};

type SessionPlayer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  position: "guard" | "forward" | "center" | null;
};

type PlayerDetailRow = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position_primary?: string | null;
  position?: string | null;
};

type SessionExercise = {
  id: string;
  title: string;
  who: string | null;
  duration_minutes: number | null;
  situation_image_url: string | null;
  explanation: string | null;
  instructions: string | null;
  sort_order: number | null;
};

export default function SeanceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const supabase = createClient();

  const [session, setSession] = useState<PracticeSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [ready, setReady] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const guards = useMemo(
    () => players.filter((player) => player.position === "guard"),
    [players]
  );

  const forwards = useMemo(
    () => players.filter((player) => player.position === "forward"),
    [players]
  );

  const centers = useMemo(
    () => players.filter((player) => player.position === "center"),
    [players]
  );

  const compositionBlocks = useMemo(() => {
    const blocks = Array.isArray(session?.team_composition_blocks)
      ? session.team_composition_blocks
      : [];

    if (blocks.length > 0) {
      return blocks.map((block, blockIndex) => ({
        id: block.id || `block-${blockIndex}`,
        title: block.title || `Bloc ${blockIndex + 1}`,
        teams: (block.teams || []).map((team, teamIndex) => ({
          id: team.id || `team-${blockIndex}-${teamIndex}`,
          name: team.name || `Équipe ${teamIndex + 1}`,
          players: (team.playerIds || [])
            .map((playerId) => players.find((player) => player.id === String(playerId)))
            .filter((player): player is SessionPlayer => Boolean(player)),
        })),
      }));
    }

    const configured = session?.player_groups ?? {};
    const legacyTeams = Object.entries(configured).map(([name, ids], index) => ({
      id: `legacy-team-${index}`,
      name,
      players: (Array.isArray(ids) ? ids : [])
        .map((playerId) => players.find((player) => player.id === playerId))
        .filter((player): player is SessionPlayer => Boolean(player)),
    }));

    return legacyTeams.length
      ? [{ id: "legacy-block", title: "Équipes de travail", teams: legacyTeams }]
      : [];
  }, [session, players]);

  const totalDuration = useMemo(() => {
    return exercises.reduce(
      (total, exercise) => total + parsePracticeDuration(exercise.duration_minutes, 0),
      0
    );
  }, [exercises]);

  useEffect(() => {
    if (!id) return;
    loadSession(id);
  }, [id]);

  async function loadSession(sessionId: string) {
    setReady(false);

    const { data: sessionData, error: sessionError } = await supabase
      .from("practice_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      console.error(sessionError);
      setReady(true);
      return;
    }

    if (!sessionData) {
      setSession(null);
      setReady(true);
      return;
    }

    function normalizePosition(value?: string | null): "guard" | "forward" | "center" {
      const position = String(value || "").toLowerCase();
      if (position.includes("pivot") || position.includes("center") || position.includes("poste 5") || position === "c") return "center";
      if (position.includes("ailier") || position.includes("forward") || position.includes("poste 3") || position.includes("poste 4") || position === "sf" || position === "pf") return "forward";
      return "guard";
    }

    const { data: directPlayers, error: playersError } = await supabase
      .from("practice_session_players")
      .select("*")
      .eq("session_id", sessionId)
      .order("last_name", { ascending: true });

    if (playersError) console.error(playersError);

    let sourceRows = (directPlayers ?? []).filter((row: any) => {
      const status = String(row.status || "present").toLowerCase();
      return row.selected !== false && !["absent", "injured", "excused"].includes(status);
    });

    if (sourceRows.length === 0) {
      const { data: attendanceRows } = await supabase
        .from("practice_session_attendance")
        .select("*")
        .eq("session_id", sessionId);

      sourceRows = (attendanceRows ?? []).filter((row: any) => {
        const status = String(row.status || "present").toLowerCase();
        return row.selected !== false && !["absent", "injured", "excused"].includes(status);
      });
    }

    if (sourceRows.length === 0 && sessionData.team_id) {
      const { data: rosterRows } = await supabase
        .from("players")
        .select("*")
        .eq("team_id", sessionData.team_id)
        .order("last_name", { ascending: true });
      sourceRows = rosterRows ?? [];
    }

    const playerIds = Array.from(new Set(sourceRows.map((row: any) => String(row.player_id || row.id || "")).filter(Boolean)));
    const { data: playerDetails } = playerIds.length
      ? await supabase.from("players").select("*").in("id", playerIds)
      : { data: [] as any[] };
    const playerById = new Map<string, PlayerDetailRow>(
      ((playerDetails ?? []) as PlayerDetailRow[]).map(
        (row: PlayerDetailRow) => [String(row.id || ""), row],
      ),
    );

    const playersData = sourceRows
      .map((row: any) => {
        const playerId = String(row.player_id || row.id || "");
        const playerDetail: PlayerDetailRow =
          playerById.get(playerId) ?? {};

        return {
          id: playerId,
          first_name: playerDetail.first_name ?? row.first_name ?? "",
          last_name: playerDetail.last_name ?? row.last_name ?? "",
          position: normalizePosition(
            playerDetail.position_primary ??
              playerDetail.position ??
              row.position_primary ??
              row.position,
          ),
        } as SessionPlayer;
      })
      .filter((player: SessionPlayer, index: number, list: SessionPlayer[]) => player.id && list.findIndex((item) => item.id === player.id) === index);

    let resolvedSession = { ...sessionData } as PracticeSession;
    if (!resolvedSession.club_logo_url && resolvedSession.team_id) {
      const { data: teamRow } = await supabase.from("teams").select("*").eq("id", resolvedSession.team_id).maybeSingle();
      resolvedSession.club_logo_url = teamRow?.club_logo_url || teamRow?.logo_url || null;
      if (!resolvedSession.club_logo_url && teamRow?.club_id) {
        const { data: clubRow } = await supabase.from("clubs").select("*").eq("id", teamRow.club_id).maybeSingle();
        resolvedSession.club_logo_url = clubRow?.logo_url || clubRow?.club_logo_url || null;
      }
    }

    const { data: exercisesData, error: exercisesError } = await supabase
      .from("practice_session_exercises")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order", { ascending: true });

    if (exercisesError) console.error(exercisesError);

    setSession(resolvedSession);
    setPlayers(playersData);
    setExercises((exercisesData ?? []) as SessionExercise[]);
    setReady(true);
  }

  async function generatePdf() {
    if (!id) return;

    setGeneratingPdf(true);

    const response = await fetch(`/api/seances/${id}/pdf`, {
      method: "POST",
    });

    const data = await response.json();
    setGeneratingPdf(false);

    if (!response.ok) {
      alert(data.error ?? "Erreur génération PDF");
      return;
    }

    await loadSession(id);
    openFileSameTab(data.pdfUrl);
  }

  async function removeSession() {
    if (!id) return;

    const ok = confirm("Supprimer cette séance ?");
    if (!ok) return;

    const { error } = await supabase
      .from("practice_sessions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Erreur suppression séance.");
      return;
    }

    router.push("/mon-compte/seances");
  }

  function playerName(player: SessionPlayer) {
    return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
  }

  function formatDate(date?: string | null) {
    if (!date) return "Date non définie";

    return new Date(date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function formatTime(time?: string | null) {
    if (!time) return "";
    return time.slice(0, 5);
  }

  if (!ready) {
    return <main className="seance-detail">Chargement...</main>;
  }

  if (!session) {
    return (
      <main className="seance-detail">
        <p>Séance introuvable.</p>

        <button className="btn-back" onClick={() => router.push("/seances")}>
          ← Retour aux séances
        </button>
      </main>
    );
  }

  return (
    <main className="seance-detail">
      <div className="topbar">
        <button className="btn-back" onClick={() => router.push("/seances")}>
          ← Retour aux séances
        </button>

        <div className="topbar-actions">
          <button onClick={() => router.push(`/seances/${id}/presences`)}>
            👥 Présences
          </button>

          <button onClick={() => router.push(`/seances/${id}/bilan`)}>
            📊 Bilan séance
          </button>

          <button onClick={generatePdf} disabled={generatingPdf}>
            {generatingPdf ? "Génération..." : "📄 Télécharger PDF"}
          </button>

          {session.pdf_url && (
            <button onClick={() => openFileSameTab(session.pdf_url || "")}>
              🔗 Ouvrir PDF
            </button>
          )}

          <button onClick={() => router.push(`/seances/nouvelle?id=${id}`)}>
            ✏️ Modifier
          </button>

          <button className="danger" onClick={removeSession}>
            🗑 Supprimer
          </button>
        </div>
      </div>

      <section className="practiceSheet">
        <header className="sheetHeader">
          <div className="logoBox">
            <img src="/logo-mybasket02.png" alt="MyBasket" />
          </div>

          <div className="sheetTitle">
            <h1>Practice Plan</h1>

            <p>
              <strong>Date :</strong> {formatDate(session.session_date)}
            </p>

            <p>
              <strong>Thème :</strong>{" "}
              <span>{session.theme || "Non renseigné"}</span>
            </p>

            <p>
              <strong>Horaire :</strong> {formatTime(session.start_time)} -{" "}
              {formatTime(session.end_time)}
            </p>

            <p>
              <strong>Lieu :</strong> {session.location || "Non renseigné"}
            </p>

            <p>
              <strong>Durée :</strong> {totalDuration} min
            </p>
          </div>

          <div className="logoBox">
            {session.club_logo_url ? (
              <img src={session.club_logo_url} alt="Club" />
            ) : (
              <span>CLUB</span>
            )}
          </div>
        </header>

        <section className="playersGrid">
          <div>
            <h2>Guard</h2>
            {guards.length === 0 ? (
              <p>—</p>
            ) : (
              guards.map((player) => <p key={player.id}>{playerName(player)}</p>)
            )}
          </div>

          <div>
            <h2>Forward</h2>
            {forwards.length === 0 ? (
              <p>—</p>
            ) : (
              forwards.map((player) => (
                <p key={player.id}>{playerName(player)}</p>
              ))
            )}
          </div>

          <div>
            <h2>Center</h2>
            {centers.length === 0 ? (
              <p>—</p>
            ) : (
              centers.map((player) => <p key={player.id}>{playerName(player)}</p>)
            )}
          </div>
        </section>

        <section className="exerciseTable">
          <div className="tableHeader">
            <div>Qui</div>
            <div>Tps</div>
            <div>Schémas</div>
            <div>Explications</div>
            <div>Consignes / Variantes</div>
          </div>

          {exercises.length === 0 ? (
            <div className="emptyRow">Aucun exercice dans cette séance.</div>
          ) : (
            exercises.map((exercise) => (
              <div className="tableRow" key={exercise.id}>
                <div className="compactCell">{shortCoachCode(exercise.who)}</div>
                <div className="compactCell">{parsePracticeDuration(exercise.duration_minutes, 0)}'</div>

                <div className="situation">
                  <strong>{exercise.title}</strong>

                  {exercise.situation_image_url ? (
                    <img
                      src={exercise.situation_image_url}
                      alt={exercise.title}
                    />
                  ) : (
                    <div className="courtPlaceholder">Terrain</div>
                  )}
                </div>

                <div className="textCell">{cleanPracticeText(exercise.explanation) || "—"}</div>
                <div className="textCell">{cleanPracticeText(exercise.instructions) || "—"}</div>
              </div>
            ))
          )}
        </section>

        {compositionBlocks.length > 0 && (
          <section className="sessionGroups">
            <h2>Compositions d’équipes</h2>
            {compositionBlocks.map((block) => (
              <div className="compositionBlock" key={block.id}>
                <h3>{block.title}</h3>
                <div className="sessionGroupsGrid">
                  {block.teams.map((team) => (
                    <div key={team.id} className="sessionGroupCard">
                      <strong>{team.name}</strong>
                      {team.players.length > 0 ? team.players.map((player) => (
                        <span key={player.id}>{playerName(player)}</span>
                      )) : <span>—</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </section>

      <style jsx>{`
        .seance-detail {
          max-width: 1240px;
          margin: 0 auto;
          padding: 32px 20px 60px;
          background: #fff;
        }

        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .topbar-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .topbar button,
        .btn-back {
          height: 42px;
          border: none;
          border-radius: 10px;
          padding: 0 16px;
          cursor: pointer;
          font-weight: 900;
          transition: all 0.2s ease;
        }

        .topbar button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .btn-back {
          background: #f6eadc;
          color: #6b1a2c;
        }

        .topbar-actions button {
          background: #6b1a2c;
          color: white;
        }

        .topbar-actions button:hover:not(:disabled) {
          transform: translateY(-2px);
        }

        .topbar-actions .danger {
          background: #c5283d;
          color: white;
        }

        .practiceSheet {
          border: 1px solid #111;
          background: white;
        }

        .sheetHeader {
          display: grid;
          grid-template-columns: 180px 1fr 180px;
          align-items: center;
          padding: 20px;
          gap: 20px;
        }

        .logoBox {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 120px;
          font-weight: 900;
        }

        .logoBox img {
          max-width: 130px;
          max-height: 130px;
          object-fit: contain;
        }

        .sheetTitle {
          text-align: center;
        }

        .sheetTitle h1 {
          margin: 0 0 6px;
          font-size: 26px;
        }

        .sheetTitle p {
          margin: 3px 0;
          font-size: 18px;
          font-weight: 700;
        }

        .sheetTitle span {
          color: red;
        }

        .playersGrid {
          display: grid;
          grid-template-columns: 1fr 1.35fr 1fr;
          border-top: 1px solid #111;
          border-bottom: 1px solid #111;
        }

        .playersGrid > div {
          min-height: 110px;
          border-right: 1px solid #111;
          text-align: center;
          padding-bottom: 12px;
        }

        .playersGrid > div:last-child {
          border-right: none;
        }

        .playersGrid h2 {
          margin: 0 0 20px;
          background: #d9d9d9;
          padding: 6px;
          font-size: 24px;
        }

        .playersGrid p {
          margin: 2px 0;
          font-weight: 800;
        }


        .sessionGroups {
          padding: 16px;
          border-bottom: 1px solid #111;
          background: #faf6f2;
        }
        .sessionGroups h2 { margin: 0 0 18px; text-align: center; text-transform: uppercase; }
        .compositionBlock { margin-top: 18px; padding-top: 14px; border-top: 2px solid #6b1a2c; }
        .compositionBlock h3 { margin: 0 0 12px; color: #6b1a2c; font-size: 18px; }
        .sessionGroupsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
        }
        .sessionGroupCard {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 12px;
          border: 1px solid #d9c4b9;
          border-radius: 10px;
          background: #fff;
        }
        .sessionGroupCard strong { color: #6b1a2c; margin-bottom: 4px; }
        .exerciseTable {
          width: 100%;
        }

        .tableHeader,
        .tableRow {
          display: grid;
          grid-template-columns: 48px 52px 2.25fr 1.5fr 1.5fr;
        }

        .tableHeader {
          background: #000;
          color: white;
          font-weight: 900;
          font-size: 18px;
        }

        .tableHeader > div,
        .tableRow > div {
          border-right: 1px solid #111;
          border-bottom: 1px solid #111;
          padding: 10px;
        }

        .tableHeader > div:last-child,
        .tableRow > div:last-child {
          border-right: none;
        }

        .tableRow {
          min-height: 150px;
        }

        .compactCell {
          display: grid;
          place-items: center;
          padding: 6px !important;
          font-weight: 900;
          text-align: center;
        }

        .textCell {
          white-space: pre-line;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }

        .tableHeader > div:nth-child(1),
        .tableHeader > div:nth-child(2),
        .tableRow > div:nth-child(1),
        .tableRow > div:nth-child(2) {
          padding-left: 4px;
          padding-right: 4px;
          text-align: center;
          font-weight: 900;
        }

        .situation {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }

        .situation img {
          width: 100%;
          max-height: 105px;
          object-fit: contain;
          border: 1px solid #ddd;
          background: #fff;
        }

        .courtPlaceholder {
          height: 110px;
          border: 1px solid #ddd;
          display: grid;
          place-items: center;
          color: #777;
        }

        .emptyRow {
          padding: 40px;
          text-align: center;
          color: #777;
        }

        @media (max-width: 900px) {
          .sheetHeader {
            grid-template-columns: 1fr;
          }

          .playersGrid {
            grid-template-columns: 1fr;
          }

          .playersGrid > div {
            border-right: none;
          }

          .tableHeader,
          .tableRow {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}