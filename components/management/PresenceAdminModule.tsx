"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTeams, saveTeam } from "@/lib/equipes-store";
import type { Team } from "@/types/player";

type PresenceStatus =
  | "present"
  | "absent"
  | "late"
  | "injured"
  | "excused"
  | "";

type CalendarEvent = {
  id: string;
  title: string;
  event_date: string | null;
  start_time: string | null;
  event_type: "training" | "game" | "meeting" | "formation" | "other";
};

const EVENT_ICONS = {
  training: "🏀",
  game: "🏆",
  meeting: "📋",
  formation: "🎓",
  other: "⭐",
};

const STATUS_OPTIONS: { value: PresenceStatus; label: string }[] = [
  { value: "", label: "—" },
  { value: "present", label: "✅" },
  { value: "absent", label: "❌" },
  { value: "late", label: "⏰" },
  { value: "injured", label: "🩹" },
  { value: "excused", label: "🟡" },
];

const STORAGE_PRESENCE = "mybasket_presence_records";

function playerDisplayName(player: any) {
  return (
    `${player.firstName ?? ""} ${player.lastName ?? ""}`.trim() ||
    player.name ||
    "Joueur"
  );
}

function playerPosition(player: any) {
  return (
    player.postePrincipal ||
    player.posteSecondaire ||
    player.poste ||
    player.position ||
    ""
  );
}

export default function PresenceAdminModule() {
  const supabase = createClient();

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [presence, setPresence] = useState<
    Record<string, Record<string, PresenceStatus>>
  >({});
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
  try {
    const loadedTeams = await getTeams();

    setTeams(loadedTeams);
    setTeamId(loadedTeams[0]?.id ?? "");

    try {
      const rawPresence = localStorage.getItem(STORAGE_PRESENCE);

      if (rawPresence) {
        setPresence(JSON.parse(rawPresence));
      }
    } catch {}
  } catch (error) {
    console.error("Erreur chargement équipes:", error);
    setTeams([]);
    setTeamId("");
  }
}

  useEffect(() => {
    loadCalendarEvents();
  }, []);

  async function loadCalendarEvents() {
    setLoadingEvents(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setEvents([]);
      setLoadingEvents(false);
      return;
    }

    const { data, error } = await supabase
      .from("calendar_events")
      .select("id,title,event_date,start_time,event_type")
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Erreur chargement calendrier:", error);
      setEvents([]);
      setLoadingEvents(false);
      return;
    }

    setEvents((data ?? []) as CalendarEvent[]);
    setLoadingEvents(false);
  }

  const selectedTeam = teams.find((team) => team.id === teamId);

  const usefulEvents = useMemo(() => {
    return events.filter((event) =>
      ["training", "game", "meeting", "formation", "other"].includes(
        event.event_type
      )
    );
  }, [events]);

  const countedEvents = useMemo(() => {
    return usefulEvents.filter((event) =>
      ["training", "game"].includes(event.event_type)
    );
  }, [usefulEvents]);

  function savePresence(
    next: Record<string, Record<string, PresenceStatus>>
  ) {
    setPresence(next);
    localStorage.setItem(STORAGE_PRESENCE, JSON.stringify(next));
  }

  async function updatePresence(
    playerId: string,
    eventId: string,
    status: PresenceStatus
  ) {
    const next = {
      ...presence,
      [playerId]: {
        ...(presence[playerId] ?? {}),
        [eventId]: status,
      },
    };

    savePresence(next);
    await updatePlayerPresenceRate(playerId, next[playerId]);
  }

  async function updatePlayerPresenceRate(
    playerId: string,
    playerPresence: Record<string, PresenceStatus>
  ) {
    if (!selectedTeam || countedEvents.length === 0) return;

    const positive = countedEvents.filter((event) =>
      ["present", "late"].includes(playerPresence[event.id])
    ).length;

    const rate = Math.round((positive / countedEvents.length) * 100);

    const nextTeams = teams.map((team) => {
      if (team.id !== selectedTeam.id) return team;

      return {
        ...team,
        players: team.players.map((player: any) =>
          player.id === playerId
            ? {
                ...player,
                presencePct: rate,
              }
            : player
        ),
      };
    });

    const updatedTeam = nextTeams.find((team) => team.id === selectedTeam.id);

    if (updatedTeam) {
      await saveTeam(updatedTeam);
    }

    setTeams(nextTeams);
  }

  return (
    <div className="presenceAdmin">
      <div className="head">
        <div>
          <h2>⚙️ Gestion admin</h2>
          <p>Présences automatiques reliées à Mon Calendrier.</p>
        </div>

        <div className="actions">
          <button type="button" onClick={loadCalendarEvents}>
            ↻ Actualiser calendrier
          </button>

          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selectedTeam ? (
        <div className="empty">Aucune équipe trouvée.</div>
      ) : loadingEvents ? (
        <div className="empty">Chargement des événements du calendrier...</div>
      ) : usefulEvents.length === 0 ? (
        <div className="empty">
          Aucun événement calendrier trouvé. Crée un événement dans “Mon
          Calendrier”, puis reviens ici.
        </div>
      ) : (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Joueur</th>
                <th>Taux</th>

                {usefulEvents.map((event) => (
                  <th key={event.id}>
                    <div className="eventHead">
                      <span>{EVENT_ICONS[event.event_type]}</span>
                      <strong>
                        {event.event_date
                          ? new Date(event.event_date).toLocaleDateString(
                              "fr-FR",
                              {
                                day: "2-digit",
                                month: "2-digit",
                              }
                            )
                          : "—"}
                      </strong>
                      <small>{event.title}</small>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {selectedTeam.players.map((player: any) => (
                <tr key={player.id}>
                  <td className="player">
                    <strong>{playerDisplayName(player)}</strong>
                    <span>{playerPosition(player)}</span>
                  </td>

                  <td>
                    <span className="rate">{player.presencePct ?? 0}%</span>
                  </td>

                  {usefulEvents.map((event) => {
                    const value = presence[player.id]?.[event.id] ?? "";

                    return (
                      <td key={event.id}>
                        <select
                          className={`status ${value}`}
                          value={value}
                          onChange={(e) =>
                            updatePresence(
                              player.id,
                              event.id,
                              e.target.value as PresenceStatus
                            )
                          }
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .presenceAdmin {
          padding: 24px;
        }

        .head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 24px;
        }

        h2 {
          margin: 0;
          color: #6b1a2c;
          font-size: 28px;
          font-weight: 900;
        }

        p {
          color: #666;
          margin: 6px 0 0;
        }

        .actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .actions button,
        .actions select {
          height: 44px;
          border: 1px solid #ddd;
          border-radius: 12px;
          padding: 0 14px;
          font-weight: 800;
          background: white;
        }

        .actions button {
          background: #6b1a2c;
          color: white;
          border-color: #6b1a2c;
        }

        .empty {
          border: 1px dashed #ddd;
          border-radius: 16px;
          padding: 40px;
          text-align: center;
          color: #777;
        }

        .tableWrap {
          overflow: auto;
          background: white;
          border-radius: 18px;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1000px;
        }

        th,
        td {
          border-bottom: 1px solid #eee;
          padding: 12px;
          text-align: center;
        }

        th {
          background: #111;
          color: white;
          font-size: 12px;
          text-transform: uppercase;
        }

        .eventHead {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
        }

        .eventHead span {
          font-size: 20px;
        }

        .eventHead small {
          color: #d4a24c;
          max-width: 95px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .player {
          text-align: left;
          min-width: 190px;
          position: sticky;
          left: 0;
          background: white;
          z-index: 2;
        }

        .player strong {
          display: block;
          color: #6b1a2c;
        }

        .player span {
          font-size: 12px;
          color: #777;
        }

        .rate {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 54px;
          height: 32px;
          border-radius: 999px;
          background: #f3eadc;
          color: #6b1a2c;
          font-weight: 900;
        }

        .status {
          width: 60px;
          height: 38px;
          border-radius: 10px;
          border: 1px solid #ddd;
          background: white;
          text-align: center;
          font-size: 18px;
          cursor: pointer;
        }

        .status.present {
          background: #e8f8ed;
        }

        .status.absent {
          background: #ffe8e8;
        }

        .status.late {
          background: #fff4d8;
        }

        .status.injured {
          background: #f3e8ff;
        }

        .status.excused {
          background: #fff9db;
        }

        @media (max-width: 900px) {
          .head {
            flex-direction: column;
            align-items: flex-start;
          }

          .actions {
            width: 100%;
            flex-direction: column;
          }

          .actions button,
          .actions select {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}