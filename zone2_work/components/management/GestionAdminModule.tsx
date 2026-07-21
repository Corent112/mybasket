// components/management/GestionAdminModule.tsx
"use client";

/**
 * GestionAdminModule — version Supabase.
 *
 * Objectif :
 * - garder le design existant ;
 * - supprimer le localStorage ;
 * - lire les équipes depuis lib/equipes-store.ts ;
 * - lire les évènements depuis calendar_events + practice_sessions ;
 * - sauvegarder administratif dans team_admin ;
 * - sauvegarder présences dans player_event_presence ;
 * - mettre à jour presence_pct dans players.
 *
 * Tables attendues :
 * - team_admin avec contrainte unique (team_id, player_id)
 * - player_event_presence avec contrainte unique (team_id, player_id, event_id)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTeams } from "@/lib/equipes-store";

/* ----------------------------- Types ----------------------------------- */

type Player = {
  id: string;
  firstName?: string;
  lastName?: string;
  num?: string | number;
  photo?: string | null;
};

type Team = {
  id: string;
  name?: string;
  cat?: string;
  category?: string;
  players?: Player[];
};

type AdminRow = {
  cotisation?: boolean;
  licence?: boolean;
  certif?: boolean;
  amount?: string;
};

type Presence = "present" | "absent";

type TeamAdmin = {
  cotisations: Record<string, AdminRow>;
  presence: Record<string, Record<string, Presence>>;
};

type CalEvent = {
  id: string;
  date: string;
  time: string;
  type: string;
  title: string;
  session_id?: string | null;
  location?: string | null;
};

type TeamAdminRow = {
  id: string;
  team_id: string;
  player_id: string;
  cotisation: boolean | null;
  licence: boolean | null;
  certif: boolean | null;
  amount: string | null;
};

type PresenceRow = {
  id: string;
  team_id: string;
  player_id: string;
  event_id: string;
  status: Presence | null;
};

type CalendarRow = {
  id: string;
  title: string | null;
  description: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: string | null;
  session_id: string | null;
  attachment_url: string | null;
};

type PracticeSessionRow = {
  id: string;
  team_id: string | null;
};

const EMPTY_ADMIN: TeamAdmin = { cotisations: {}, presence: {} };

/* ----------------------------- Helpers --------------------------------- */

function fmtShort(d: string) {
  if (!d) return "?";

  const parts = d.split("-");

  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;

  return d;
}

function normCalendarEvent(row: CalendarRow): CalEvent {
  return {
    id: String(row.id),
    date: String(row.event_date ?? ""),
    time: row.start_time ? String(row.start_time).slice(0, 5) : "",
    type: String(row.event_type ?? "other").toLowerCase(),
    title: String(row.title ?? "Évènement"),
    session_id: row.session_id ?? null,
    location: row.location ?? null,
  };
}

function emptyAdminFromRows(adminRows: TeamAdminRow[], presenceRows: PresenceRow[]): TeamAdmin {
  const cotisations: TeamAdmin["cotisations"] = {};
  const presence: TeamAdmin["presence"] = {};

  adminRows.forEach((row) => {
    cotisations[row.player_id] = {
      cotisation: Boolean(row.cotisation),
      licence: Boolean(row.licence),
      certif: Boolean(row.certif),
      amount: row.amount ?? "",
    };
  });

  presenceRows.forEach((row) => {
    if (!row.event_id || !row.player_id || !row.status) return;

    if (!presence[row.event_id]) presence[row.event_id] = {};

    presence[row.event_id][row.player_id] = row.status;
  });

  return { cotisations, presence };
}

function sortEvents(events: CalEvent[]) {
  return [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
  );
}

/** Mini-pictogramme SVG selon le type d'évènement. */
function EvIcon({ type }: { type: string }) {
  const t = type.toLowerCase();
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none" as const,
  };

  if (t.includes("entrain") || t.includes("training")) {
    return (
      <svg {...common} aria-label="Entraînement">
        <path
          d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"
          stroke="#0E7490"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (t.includes("match") || t.includes("game")) {
    return (
      <svg {...common} aria-label="Match">
        <circle cx="12" cy="12" r="8.5" stroke="#B45309" strokeWidth="2" />
        <path
          d="M3.5 12h17M12 3.5v17M6 6c3 2.5 3 9.5 0 12M18 6c-3 2.5-3 9.5 0 12"
          stroke="#B45309"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  if (t.includes("tourn")) {
    return (
      <svg {...common} aria-label="Tournoi">
        <path
          d="M7 4h10v4a5 5 0 0 1-10 0V4ZM7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M9 14h6M10 18h4M12 13v1"
          stroke="#15803D"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg {...common} aria-label="Évènement">
      <path
        d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Z"
        stroke="#6B1A2C"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="2.2" stroke="#6B1A2C" strokeWidth="2" />
    </svg>
  );
}

const playerName = (p: Player) =>
  `${p.num ? "#" + p.num + " " : ""}${p.firstName || ""}`.trim() || "—";

const initial = (p: Player) => (p.firstName || "?")[0].toUpperCase();

/* ============================ Composant ================================= */

export default function GestionAdminModule() {
  const supabase = createClient();

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  const [admin, setAdmin] = useState<TeamAdmin>(EMPTY_ADMIN);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [includeUnlinked, setIncludeUnlinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const team = useMemo(
    () => teams.find((t) => String(t.id) === String(teamId)) || null,
    [teams, teamId]
  );

  const players = team?.players || [];

  const load = useCallback(
    async (preferredTeamId?: string) => {
      setLoading(true);

      try {
        const loadedTeams = ((await getTeams()) ?? []) as Team[];

        setTeams(loadedTeams);

        const nextTeamId =
          preferredTeamId ||
          teamId ||
          loadedTeams[0]?.id ||
          "";

        setTeamId(nextTeamId);

        if (!nextTeamId) {
          setAdmin(EMPTY_ADMIN);
          setEvents([]);
          setTotalEvents(0);
          setLoading(false);
          return;
        }

        const [{ data: adminRows, error: adminError }, { data: presenceRows, error: presenceError }] =
          await Promise.all([
            supabase
              .from("team_admin")
              .select("*")
              .eq("team_id", nextTeamId),

            supabase
              .from("player_event_presence")
              .select("*")
              .eq("team_id", nextTeamId),
          ]);

        if (adminError) {
          console.error("Erreur chargement team_admin:", adminError);
        }

        if (presenceError) {
          console.error("Erreur chargement player_event_presence:", presenceError);
        }

        setAdmin(
          emptyAdminFromRows(
            (adminRows ?? []) as TeamAdminRow[],
            (presenceRows ?? []) as PresenceRow[]
          )
        );

        await loadEventsForTeam(nextTeamId, loadedTeams);
      } catch (error) {
        console.error("Erreur chargement Gestion Admin:", error);
        setTeams([]);
        setTeamId("");
        setAdmin(EMPTY_ADMIN);
        setEvents([]);
        setTotalEvents(0);
      } finally {
        setLoading(false);
      }
    },
    [supabase, teamId, includeUnlinked]
  );

  async function loadEventsForTeam(targetTeamId: string, sourceTeams = teams) {
    const targetTeam = sourceTeams.find((t) => String(t.id) === String(targetTeamId));

    const [{ data: calendarRows, error: calendarError }, { data: sessionRows, error: sessionsError }] =
      await Promise.all([
        supabase
          .from("calendar_events")
          .select("*")
          .order("event_date", { ascending: true })
          .order("start_time", { ascending: true }),

        supabase
          .from("practice_sessions")
          .select("id, team_id")
          .eq("team_id", targetTeamId),
      ]);

    if (calendarError) {
      console.error("Erreur chargement calendar_events:", calendarError);
      setEvents([]);
      setTotalEvents(0);
      return;
    }

    if (sessionsError) {
      console.error("Erreur chargement practice_sessions:", sessionsError);
    }

    const allEvents = ((calendarRows ?? []) as CalendarRow[]).map(normCalendarEvent);
    const sessionIds = new Set(
      ((sessionRows ?? []) as PracticeSessionRow[])
        .map((row) => String(row.id))
        .filter(Boolean)
    );

    const matched = allEvents.filter((event) => {
      const linkedBySession = event.session_id && sessionIds.has(String(event.session_id));
      const linkedByLocation =
        !!targetTeam?.name &&
        !!event.location &&
        String(event.location).toLowerCase() === String(targetTeam.name).toLowerCase();

      const unlinked = !event.session_id && !event.location;

      return linkedBySession || linkedByLocation || (includeUnlinked && unlinked);
    });

    setEvents(sortEvents(matched));
    setTotalEvents(allEvents.length);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!teamId) return;
    loadEventsForTeam(teamId);
  }, [includeUnlinked]);

  const selectTeam = async (id: string) => {
    setTeamId(id);
    await load(id);
  };

  async function updatePresencePct(playerId: string, nextAdmin: TeamAdmin) {
    if (!events.length) return;

    let present = 0;

    events.forEach((event) => {
      if (nextAdmin.presence[event.id]?.[playerId] === "present") {
        present += 1;
      }
    });

    const presencePct =
      events.length > 0 ? Math.round((present / events.length) * 100) : 0;

    const { error } = await supabase
      .from("players")
      .update({
        presence_pct: presencePct,
        updated_at: new Date().toISOString(),
      })
      .eq("id", playerId);

    if (error) {
      console.error("Erreur mise à jour presence_pct joueur:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    }
  }

  /* ----- administratif ----- */
  const setAdminCell = async (
    playerId: string,
    key: keyof AdminRow,
    value: boolean | string
  ) => {
    if (!teamId) return;

    const currentRow = admin.cotisations[playerId] || {};
    const nextRow = { ...currentRow, [key]: value };
    const nextAdmin = {
      ...admin,
      cotisations: {
        ...admin.cotisations,
        [playerId]: nextRow,
      },
    };

    setAdmin(nextAdmin);
    setSavingKey(`${playerId}-${String(key)}`);

    const payload = {
      team_id: teamId,
      player_id: playerId,
      cotisation: Boolean(nextRow.cotisation),
      licence: Boolean(nextRow.licence),
      certif: Boolean(nextRow.certif),
      amount: nextRow.amount || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("team_admin")
      .upsert(payload, { onConflict: "team_id,player_id" });

    if (error) {
      console.error("Erreur sauvegarde administratif:", error);
      alert("Impossible d'enregistrer l'administratif.");
      await load(teamId);
    }

    setSavingKey(null);
  };

  /* ----- présence : — → présent → absent → — ----- */
  const cyclePresence = async (eventId: string, playerId: string) => {
    if (!teamId) return;

    const eventPresence = { ...(admin.presence[eventId] || {}) };
    const current = eventPresence[playerId];
    let nextStatus: Presence | null = null;

    if (current === undefined) {
      nextStatus = "present";
      eventPresence[playerId] = "present";
    } else if (current === "present") {
      nextStatus = "absent";
      eventPresence[playerId] = "absent";
    } else {
      nextStatus = null;
      delete eventPresence[playerId];
    }

    const nextPresence = {
      ...admin.presence,
      [eventId]: eventPresence,
    };

    if (Object.keys(eventPresence).length === 0) {
      delete nextPresence[eventId];
    }

    const nextAdmin: TeamAdmin = {
      ...admin,
      presence: nextPresence,
    };

    setAdmin(nextAdmin);
    setSavingKey(`${eventId}-${playerId}`);

    if (nextStatus === null) {
      const { error } = await supabase
        .from("player_event_presence")
        .delete()
        .eq("team_id", teamId)
        .eq("event_id", eventId)
        .eq("player_id", playerId);

      if (error) {
        console.error("Erreur suppression présence:", error);
        alert("Impossible de supprimer la présence.");
        await load(teamId);
      }
    } else {
      const { error } = await supabase
        .from("player_event_presence")
        .upsert(
          {
            team_id: teamId,
            event_id: eventId,
            player_id: playerId,
            status: nextStatus,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "team_id,player_id,event_id" }
        );

      if (error) {
        console.error("Erreur sauvegarde présence:", error);
        alert("Impossible d'enregistrer la présence.");
        await load(teamId);
      }
    }

    await updatePresencePct(playerId, nextAdmin);

    setSavingKey(null);
  };

  const markAll = async (value: Presence | null) => {
    if (!teamId) return;

    if (value === null) {
      if (!window.confirm("Effacer toutes les présences ?")) return;

      const nextAdmin = { ...admin, presence: {} };
      setAdmin(nextAdmin);

      const { error } = await supabase
        .from("player_event_presence")
        .delete()
        .eq("team_id", teamId);

      if (error) {
        console.error("Erreur effacement présences:", error);
        alert("Impossible d'effacer les présences.");
        await load(teamId);
        return;
      }

      await Promise.all(players.map((player) => updatePresencePct(player.id, nextAdmin)));
      return;
    }

    if (!window.confirm("Marquer tous les joueurs présents à tous les évènements ?")) {
      return;
    }

    const presence: TeamAdmin["presence"] = {};

    events.forEach((event) => {
      presence[event.id] = {};
      players.forEach((player) => {
        presence[event.id][player.id] = value;
      });
    });

    const nextAdmin = { ...admin, presence };

    setAdmin(nextAdmin);

    const payload = events.flatMap((event) =>
      players.map((player) => ({
        team_id: teamId,
        event_id: event.id,
        player_id: player.id,
        status: value,
        updated_at: new Date().toISOString(),
      }))
    );

    const { error } = await supabase
      .from("player_event_presence")
      .upsert(payload, { onConflict: "team_id,player_id,event_id" });

    if (error) {
      console.error("Erreur sauvegarde présences globales:", error);
      alert("Impossible d'enregistrer les présences.");
      await load(teamId);
      return;
    }

    await Promise.all(players.map((player) => updatePresencePct(player.id, nextAdmin)));
  };

  const rateFor = (playerId: string) => {
    if (!events.length) return { present: 0, total: 0, rate: 0 };

    let present = 0;

    events.forEach((event) => {
      if (admin.presence[event.id]?.[playerId] === "present") {
        present += 1;
      }
    });

    return {
      present,
      total: events.length,
      rate: Math.round((present / events.length) * 100),
    };
  };

  /* ----------------------------- Rendu --------------------------------- */

  if (loading) {
    return (
      <div className="ga">
        <div className="ga-empty">Chargement de la gestion admin...</div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="ga">
        <TeamBar teams={teams} teamId={teamId} onSelect={selectTeam} />
        <div className="ga-empty">
          Crée une équipe dans « Mes Équipes » pour gérer l'administratif et les présences.
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  return (
    <div className="ga">
      <TeamBar teams={teams} teamId={teamId} onSelect={selectTeam} />

      <div className="ga-hint">
        💡 Suivi des cotisations, licences, certificats médicaux, et présences synchronisées avec{" "}
        <b>Mon Calendrier</b>.
      </div>

      {/* ----- Administratif ----- */}
      <h3 className="ga-h3">💳 Administratif</h3>

      {players.length === 0 ? (
        <p className="ga-muted">Aucun joueur dans cette équipe.</p>
      ) : (
        <div className="ga-tablewrap">
          <table className="ga-table">
            <thead>
              <tr>
                <th className="left">Joueur</th>
                <th>N°</th>
                <th>💳 Cotisation</th>
                <th>📜 Licence</th>
                <th>🏥 Cert. médical</th>
                <th>Montant payé</th>
              </tr>
            </thead>

            <tbody>
              {players.map((p) => {
                const row = admin.cotisations[p.id] || {};

                return (
                  <tr key={p.id}>
                    <td className="left">
                      <div className="ga-player">
                        {p.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photo} alt="" />
                        ) : (
                          <span className="ga-avatar">{initial(p)}</span>
                        )}

                        <span>
                          {p.firstName} {p.lastName || ""}
                        </span>
                      </div>
                    </td>

                    <td className="c">{p.num || "—"}</td>

                    {(["cotisation", "licence", "certif"] as const).map((k) => (
                      <td key={k} className="c">
                        <input
                          type="checkbox"
                          checked={!!row[k]}
                          disabled={savingKey === `${p.id}-${k}`}
                          onChange={(e) => setAdminCell(p.id, k, e.target.checked)}
                        />
                      </td>
                    ))}

                    <td className="c">
                      <input
                        type="text"
                        className="ga-amount"
                        value={row.amount || ""}
                        placeholder="0€"
                        disabled={savingKey === `${p.id}-amount`}
                        onChange={(e) => setAdminCell(p.id, "amount", e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ----- Présence ----- */}
      <h3 className="ga-h3">
        📋 Présence aux évènements{" "}
        <span className="ga-count">
          ({events.length} évènement{events.length > 1 ? "s" : ""})
        </span>
      </h3>

      {events.length === 0 ? (
        <div className="ga-noevents">
          <p>
            Aucun évènement lié à <b>{team.name}</b> dans Mon Calendrier.
          </p>

          {totalEvents > 0 && (
            <label className="ga-toggle">
              <input
                type="checkbox"
                checked={includeUnlinked}
                onChange={(e) => setIncludeUnlinked(e.target.checked)}
              />
              Afficher les {totalEvents} évènement(s) du calendrier non rattachés à une équipe
            </label>
          )}

          <p className="ga-tip">
            Astuce : une séance générée depuis le panier est automatiquement liée si elle possède un{" "}
            <b>session_id</b> rattaché à cette équipe.
          </p>
        </div>
      ) : (
        <>
          <div className="ga-presbar">
            <button type="button" className="ga-mini" onClick={() => markAll("present")}>
              ✓ Tous présents
            </button>

            <button type="button" className="ga-mini danger" onClick={() => markAll(null)}>
              ✕ Tout effacer
            </button>

            <span className="ga-legend">
              <span className="lg ok">Présent</span>
              <span className="lg ko">Absent</span>
              <span className="lg none">Non saisi</span>
            </span>
          </div>

          <div className="ga-tablewrap pres">
            <table className="ga-prestable">
              <thead>
                <tr>
                  <th className="sticky-l">Joueur</th>

                  {events.map((ev) => (
                    <th key={ev.id} className="ev" title={ev.title || ev.type}>
                      <span className="ev-ic">
                        <EvIcon type={ev.type} />
                      </span>
                      <span className="ev-d">{fmtShort(ev.date)}</span>
                      {ev.time && <span className="ev-t">{ev.time}</span>}
                    </th>
                  ))}

                  <th className="total-h">Taux</th>
                </tr>
              </thead>

              <tbody>
                {players.map((p) => {
                  const { present, total: totalPlayerEvents, rate } = rateFor(p.id);
                  const rateColor =
                    rate >= 75 ? "#15803D" : rate >= 50 ? "#6B1A2C" : "#c5283d";

                  return (
                    <tr key={p.id}>
                      <td className="sticky-l name">
                        <div className="ga-player sm">
                          {p.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.photo} alt="" />
                          ) : (
                            <span className="ga-avatar sm">{initial(p)}</span>
                          )}

                          <span>{playerName(p)}</span>
                        </div>
                      </td>

                      {events.map((ev) => {
                        const st = admin.presence[ev.id]?.[p.id];
                        const cls =
                          st === "present" ? "ok" : st === "absent" ? "ko" : "none";
                        const txt = st === "present" ? "✓" : st === "absent" ? "✕" : "—";

                        return (
                          <td key={ev.id} className="cell">
                            <button
                              type="button"
                              className={`ga-pres ${cls}`}
                              disabled={savingKey === `${ev.id}-${p.id}`}
                              onClick={() => cyclePresence(ev.id, p.id)}
                              title={`${ev.title || ev.type} · ${fmtShort(ev.date)}`}
                            >
                              {txt}
                            </button>
                          </td>
                        );
                      })}

                      <td className="total">
                        <span style={{ color: rateColor }}>
                          {present}/{totalPlayerEvents}
                        </span>
                        <br />
                        <span className="pct">{rate}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="ga-tip">
            💡 Clique une case : <b>—</b> →{" "}
            <b style={{ color: "#15803D" }}>✓ présent</b> →{" "}
            <b style={{ color: "#c5283d" }}>✕ absent</b> → <b>—</b>. Le taux remonte automatiquement
            dans la fiche du joueur.
          </p>
        </>
      )}

      <style jsx>{styles}</style>
    </div>
  );
}

/* ----------------------- Sous-composant équipe ------------------------- */

function TeamBar({
  teams,
  teamId,
  onSelect,
}: {
  teams: Team[];
  teamId: string;
  onSelect: (id: string) => void;
}) {
  if (teams.length <= 1) return null;

  return (
    <div className="ga-teambar">
      <label>Équipe</label>

      <select value={teamId} onChange={(e) => onSelect(e.target.value)}>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name || "Sans nom"} {t.cat || t.category ? `· ${t.cat || t.category}` : ""}
          </option>
        ))}
      </select>

      <style jsx>{`
        .ga-teambar {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          margin-bottom: 1rem;
        }

        .ga-teambar label {
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #6B1A2C;
        }

        .ga-teambar select {
          padding: 0.5rem 0.8rem;
          border: 1px solid #e1d8cc;
          border-radius: 8px;
          font-size: 0.9rem;
          background: #fff;
          color: #0F0F12;
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}

/* ----------------------------- Styles ---------------------------------- */

const styles = `
  .ga {
    font-family: 'Roboto', system-ui, sans-serif;
    color: #0F0F12;
    width: 100%;
    min-width: 0;
  }

  .ga-empty,
  .ga-noevents {
    background: #FFF8EF;
    border: 1px dashed #D4A24C;
    border-radius: 12px;
    padding: 1.4rem;
    color: #6B1A2C;
  }

  .ga-empty {
    text-align: center;
    font-weight: 700;
  }

  .ga-hint {
    background: #FFF8E7;
    border: 1px solid #D4A24C;
    border-radius: 8px;
    padding: 0.7rem 1rem;
    margin-bottom: 1.1rem;
    font-size: 0.85rem;
    color: #6B1A2C;
  }

  .ga-h3 {
    margin: 1.4rem 0 0.6rem;
    font-size: 0.95rem;
    color: #6B1A2C;
    font-family: 'Oswald', sans-serif;
    font-weight: 800;
    text-transform: uppercase;
    border-bottom: 1.5px solid #D4A24C;
    padding-bottom: 0.3rem;
  }

  .ga-h3:first-of-type {
    margin-top: 0;
  }

  .ga-count {
    font-size: 0.75rem;
    font-weight: 400;
    color: #8a7b73;
    text-transform: none;
  }

  .ga-muted {
    color: #8a7b73;
    font-size: 0.88rem;
  }

  .ga-tablewrap {
    overflow-x: auto;
    border: 1px solid #ece3d6;
    border-radius: 8px;
  }

  .ga-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    font-size: 0.85rem;
  }

  .ga-table thead tr {
    background: #6B1A2C;
    color: #fff;
    font-size: 0.76rem;
  }

  .ga-table th {
    padding: 0.55rem 0.5rem;
    text-align: center;
    font-weight: 700;
  }

  .ga-table th.left,
  .ga-table td.left {
    text-align: left;
  }

  .ga-table td {
    padding: 0.5rem;
    border-bottom: 1px solid #f0f0f0;
  }

  .ga-table td.c {
    text-align: center;
  }

  .ga-table input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: #6B1A2C;
    cursor: pointer;
  }

  .ga-table input[type='checkbox']:disabled,
  .ga-pres:disabled,
  .ga-amount:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  .ga-amount {
    width: 72px;
    padding: 0.2rem 0.35rem;
    border: 1px solid #e1d8cc;
    border-radius: 4px;
    font-size: 0.82rem;
    text-align: right;
    font-family: inherit;
  }

  .ga-player {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .ga-player img,
  .ga-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex: 0 0 auto;
  }

  .ga-player.sm img,
  .ga-avatar.sm {
    width: 24px;
    height: 24px;
  }

  .ga-avatar {
    background: #6B1A2C;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .ga-avatar.sm {
    font-size: 0.65rem;
  }

  .ga-presbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .ga-mini {
    border: 1px solid #6B1A2C;
    color: #6B1A2C;
    background: #fff;
    border-radius: 7px;
    padding: 0.25rem 0.6rem;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
  }

  .ga-mini.danger {
    border-color: #c5283d;
    color: #c5283d;
  }

  .ga-legend {
    margin-left: auto;
    display: flex;
    gap: 0.35rem;
    font-size: 0.7rem;
  }

  .lg {
    padding: 0.05rem 0.4rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .lg.ok {
    background: #DCFCE7;
    color: #15803D;
  }

  .lg.ko {
    background: #FEE2E2;
    color: #9F1239;
  }

  .lg.none {
    background: #F2F2F2;
    color: #777;
  }

  .ga-tablewrap.pres {
    max-height: 62vh;
  }

  .ga-prestable {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    font-size: 0.78rem;
  }

  .ga-prestable thead {
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .ga-prestable thead th {
    background: #6B1A2C;
    color: #fff;
    padding: 0.35rem 0.3rem;
    text-align: center;
    font-weight: 700;
  }

  .ga-prestable th.sticky-l,
  .ga-prestable td.sticky-l {
    position: sticky;
    left: 0;
    z-index: 1;
    text-align: left;
    min-width: 140px;
  }

  .ga-prestable th.sticky-l {
    z-index: 3;
    background: #6B1A2C;
  }

  .ga-prestable td.sticky-l {
    background: #fff;
    border-right: 2px solid #D4A24C;
    font-weight: 600;
  }

  .ga-prestable th.ev {
    min-width: 58px;
  }

  .ev-ic {
    display: flex;
    justify-content: center;
  }

  .ev-ic :global(svg) {
    background: #fff;
    border-radius: 5px;
    padding: 2px;
  }

  .ev-d {
    display: block;
    font-size: 0.68rem;
    margin-top: 0.1rem;
  }

  .ev-t {
    display: block;
    font-size: 0.6rem;
    opacity: 0.85;
  }

  .total-h {
    background: #5a1525 !important;
  }

  .ga-prestable td.cell {
    padding: 0;
    text-align: center;
    border-bottom: 1px solid #f5f5f5;
    border-right: 1px solid #f5f5f5;
  }

  .ga-pres {
    width: 100%;
    height: 34px;
    border: none;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 700;
    font-family: inherit;
    background: #fff;
    color: #bbb;
  }

  .ga-pres.ok {
    background: #DCFCE7;
    color: #15803D;
  }

  .ga-pres.ko {
    background: #FEE2E2;
    color: #9F1239;
  }

  .ga-prestable td.total {
    text-align: center;
    background: #FAF7F0;
    font-weight: 700;
    border-left: 2px solid #D4A24C;
  }

  .ga-prestable td.total .pct {
    font-size: 0.65rem;
    color: #8a7b73;
    font-weight: 400;
  }

  .ga-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    margin: 0.6rem 0;
    cursor: pointer;
  }

  .ga-toggle input {
    width: 16px;
    height: 16px;
    accent-color: #6B1A2C;
  }

  .ga-tip {
    font-size: 0.72rem;
    color: #8a7b73;
    margin-top: 0.5rem;
  }
`;
