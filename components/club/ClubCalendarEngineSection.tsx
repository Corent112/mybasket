"use client";

// components/club/ClubCalendarEngineSection.tsx
import { useEffect, useMemo, useState } from "react";
import {
  createClubEvent,
  deleteClubEvent,
  listClubEvents,
  replaceEventRecipients,
  type ClubEvent,
  type EventRecipientInput,
} from "@/lib/club-engine";
import {
  listClubCoaches,
  listClubPlayers,
  listClubTeams,
  type ClubCoach,
  type ClubPlayer,
  type ClubTeam,
} from "@/lib/club-core";

const EVENT_TYPES = ["training", "match", "meeting", "stage", "tournament", "video", "other"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toTime(min?: number | null) {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fromTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export default function ClubCalendarEngineSection({ clubId }: { clubId: string }) {
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [coaches, setCoaches] = useState<ClubCoach[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [teamId, setTeamId] = useState("");
  const [coachId, setCoachId] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [eventType, setEventType] = useState("training");
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState(today());
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("19:30");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [filterTeamId, setFilterTeamId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");
    try {
      const [eventRows, teamRows, coachRows, playerRows] = await Promise.all([
        listClubEvents({ clubId }),
        listClubTeams(clubId),
        listClubCoaches(clubId),
        listClubPlayers(clubId),
      ]);
      setEvents(eventRows);
      setTeams(teamRows);
      setCoaches(coachRows);
      setPlayers(playerRows);
    } catch (e: any) {
      setError(e?.message || "Calendrier impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const teamPlayers = useMemo(() => {
    if (!teamId) return players;
    return players.filter((player) => player.teamId === teamId);
  }, [players, teamId]);

  const visibleEvents = useMemo(() => {
    return events.filter((event) => !filterTeamId || event.teamId === filterTeamId);
  }, [events, filterTeamId]);

  const grouped = useMemo(() => {
    const map = new Map<string, ClubEvent[]>();
    visibleEvents.forEach((event) => {
      const key = event.eventDate;
      map.set(key, [...(map.get(key) || []), event]);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibleEvents]);

  function buildRecipients(): EventRecipientInput[] {
    const rows: EventRecipientInput[] = [];

    if (teamId) rows.push({ recipientType: "team", teamId });

    if (coachId) {
      const coach = coaches.find((item) => item.id === coachId);
      rows.push({
        recipientType: "coach",
        coachId,
        userId: coach?.userId || null,
        email: coach?.email || "",
      });
    }

    selectedPlayerIds.forEach((playerId) => {
      const player = players.find((item) => item.id === playerId);
      if (!player) return;

      rows.push({
        recipientType: "player",
        teamId: player.teamId,
        playerId: player.id,
        email: player.email || player.parentEmail || "",
      });
    });

    return rows;
  }

  async function saveEvent() {
    setError("");
    setMessage("");

    if (fromTime(end) <= fromTime(start)) {
      setError("L’heure de fin doit être après l’heure de début.");
      return;
    }

    setSaving(true);

    try {
      await createClubEvent({
        clubId,
        teamId: teamId || null,
        coachId: coachId || null,
        title: title || "Événement",
        description,
        eventType,
        eventDate,
        startMin: fromTime(start),
        endMin: fromTime(end),
        allDay: false,
        location,
        source: "manual",
        recipients: buildRecipients(),
      });

      setTitle("");
      setDescription("");
      setLocation("");
      setSelectedPlayerIds([]);
      setMessage("Événement créé et partagé aux destinataires.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Événement non créé.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(event: ClubEvent) {
    if (!confirm(`Supprimer "${event.title}" ?`)) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await deleteClubEvent(event.id, clubId);
      setMessage("Événement supprimé.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateRecipients(event: ClubEvent) {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const recipients: EventRecipientInput[] = [];

      if (event.teamId) {
        recipients.push({ recipientType: "team", teamId: event.teamId });
        players.filter((player) => player.teamId === event.teamId).forEach((player) => {
          recipients.push({
            recipientType: "player",
            teamId: player.teamId,
            playerId: player.id,
            email: player.email || player.parentEmail || "",
          });
        });
      }

      if (event.coachId) {
        const coach = coaches.find((item) => item.id === event.coachId);
        recipients.push({
          recipientType: "coach",
          coachId: event.coachId,
          userId: coach?.userId || null,
          email: coach?.email || "",
        });
      }

      await replaceEventRecipients({ clubId, eventId: event.id, recipients });
      setMessage("Destinataires régénérés.");
    } catch (e: any) {
      setError(e?.message || "Régénération impossible.");
    } finally {
      setSaving(false);
    }
  }

  function togglePlayer(playerId: string) {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]
    );
  }

  return (
    <section className="engine">
      <div className="top">
        <div>
          <p>CALENDRIER CENTRAL</p>
          <h2>Moteur Club</h2>
          <span>Ce que tu crées ici est relié aux équipes, coachs et joueurs ciblés.</span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <aside className="form">
          <h3>Nouvel événement</h3>
          <label>Type
            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              {EVENT_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label>Titre<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="U15 - Match vs Versailles" /></label>
          <label>Date<input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></label>
          <div className="times">
            <label>Début<input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>Fin<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <label>Lieu<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Gymnase..." /></label>
          <label>Équipe
            <select value={teamId} onChange={(e) => { setTeamId(e.target.value); setSelectedPlayerIds([]); }}>
              <option value="">Aucune</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label>Coach
            <select value={coachId} onChange={(e) => setCoachId(e.target.value)}>
              <option value="">Aucun</option>
              {coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
            </select>
          </label>

          <div className="playersPick">
            <strong>Joueurs ciblés</strong>
            <div className="pickActions">
              <button type="button" className="ghost" onClick={() => setSelectedPlayerIds(teamPlayers.map((p) => p.id))}>Tous</button>
              <button type="button" className="ghost" onClick={() => setSelectedPlayerIds([])}>Aucun</button>
            </div>
            <div className="playersBox">
              {teamPlayers.map((player) => (
                <label key={player.id}>
                  <input type="checkbox" checked={selectedPlayerIds.includes(player.id)} onChange={() => togglePlayer(player.id)} />
                  {player.lastName} {player.firstName}
                </label>
              ))}
            </div>
          </div>

          <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <button disabled={saving} onClick={saveEvent}>{saving ? "Création..." : "Créer"}</button>
        </aside>

        <main className="calendar">
          <div className="calendarTools">
            <select value={filterTeamId} onChange={(e) => setFilterTeamId(e.target.value)}>
              <option value="">Toutes les équipes</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </div>

          {grouped.map(([date, items]) => (
            <div className="day" key={date}>
              <h3>{date}</h3>
              {items.map((event) => (
                <article className="event" key={event.id}>
                  <div>
                    <strong>{event.title}</strong>
                    <span>{event.eventType} · {toTime(event.startMin)} → {toTime(event.endMin)} · {event.location || "Lieu non renseigné"}</span>
                    <small>{teams.find((team) => team.id === event.teamId)?.name || "—"} · {coaches.find((coach) => coach.id === event.coachId)?.name || "—"}</small>
                  </div>
                  <div className="eventActions">
                    <button className="ghost" onClick={() => regenerateRecipients(event)}>Cibler équipe</button>
                    <button className="danger" onClick={() => removeEvent(event)}>Supprimer</button>
                  </div>
                </article>
              ))}
            </div>
          ))}

          {!grouped.length && <div className="empty">Aucun événement.</div>}
        </main>
      </div>

      <style jsx>{`
        .engine{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .layout{display:grid;grid-template-columns:360px 1fr;gap:18px;padding:18px}.form,.calendar{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.form{background:#fffdf8}.form h3,.day h3{margin:0 0 14px;color:#6b1a2c}
        label{display:grid;gap:6px;margin-bottom:12px;color:#6b7280;font-weight:900;font-size:.78rem}input,select,textarea{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}textarea{min-height:90px}.times{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.ghost{background:#fffaf2;color:#6b1a2c}.danger{background:#fff0f0;color:#b91c1c;border-color:#f1d3cf}.calendarTools{margin-bottom:18px}.pickActions{display:flex;gap:8px}
        .playersPick{display:grid;gap:8px;margin:14px 0}.playersPick strong{color:#6b1a2c}.playersBox{max-height:170px;overflow:auto;border:1px solid #eadfd5;border-radius:16px;padding:10px;background:#fff}.playersBox label{display:flex;gap:8px;align-items:center;margin:0 0 7px}
        .day{margin-bottom:18px}.event{border:1px solid #eadfd5;border-radius:18px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;gap:12px;align-items:center}.event strong{display:block;color:#6b1a2c}.event span,.event small{display:block;color:#6b7280;font-weight:800;margin-top:4px}.eventActions{display:flex;gap:8px;flex-wrap:wrap}.empty{padding:30px;color:#6b7280;font-weight:900;text-align:center}
        @media(max-width:900px){.layout,.event{grid-template-columns:1fr;display:grid}.times{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}
