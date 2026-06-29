"use client";

// components/club/ClubConvocationsSection.tsx
import { useEffect, useMemo, useState } from "react";
import type { ClubEvent } from "@/lib/club-engine";
import type { ClubPlayer, ClubTeam } from "@/lib/club-core";
import {
  generateEventRecipients,
  getConvocationWorkspace,
  getEventTeam,
  getRecipientPlayer,
  listEventAttendances,
  listEventRecipients,
  markConvocationsSent,
  saveEventAttendance,
  type EventAttendance,
  type EventRecipient,
} from "@/lib/club-convocations";

const STATUS = [
  { value: "present", label: "Présent" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Retard" },
  { value: "injured", label: "Blessé" },
  { value: "excused", label: "Excusé" },
] as const;

export default function ClubConvocationsSection({ clubId }: { clubId: string }) {
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [eventId, setEventId] = useState("");
  const [recipients, setRecipients] = useState<EventRecipient[]>([]);
  const [attendances, setAttendances] = useState<EventAttendance[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedEvent = events.find((event) => event.id === eventId) || null;
  const selectedTeam = selectedEvent ? getEventTeam(selectedEvent, teams) : null;

  async function load() {
    setError("");
    try {
      const data = await getConvocationWorkspace(clubId);
      setEvents(data.events);
      setTeams(data.teams);
      setPlayers(data.players);
      if (!eventId && data.events[0]) setEventId(data.events[0].id);
    } catch (e: any) {
      setError(e?.message || "Convocations impossibles à charger.");
    }
  }

  async function loadEventDetails(id: string) {
    if (!id) return;
    try {
      const [recRows, attRows] = await Promise.all([
        listEventRecipients(clubId, id),
        listEventAttendances(clubId, id),
      ]);
      setRecipients(recRows);
      setAttendances(attRows);
    } catch (e: any) {
      setError(e?.message || "Détails événement impossibles à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  useEffect(() => {
    loadEventDetails(eventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const roster = useMemo(() => {
    if (!selectedEvent?.teamId) return [];
    return players.filter((player) => player.teamId === selectedEvent.teamId);
  }, [players, selectedEvent]);

  async function generate() {
    if (!selectedEvent?.teamId) {
      setError("Cet événement n’est pas relié à une équipe.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const rows = await generateEventRecipients({
        clubId,
        eventId: selectedEvent.id,
        teamId: selectedEvent.teamId,
      });
      setRecipients(rows);
      setMessage("Convocations générées depuis l’effectif.");
    } catch (e: any) {
      setError(e?.message || "Génération impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function send() {
    if (!selectedEvent) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await markConvocationsSent({ clubId, eventId: selectedEvent.id });
      await loadEventDetails(selectedEvent.id);
      setMessage("Convocations marquées comme envoyées.");
    } catch (e: any) {
      setError(e?.message || "Envoi impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function setPresence(playerId: string, status: (typeof STATUS)[number]["value"]) {
    if (!selectedEvent) return;

    try {
      const attendance = await saveEventAttendance({
        clubId,
        eventId: selectedEvent.id,
        teamId: selectedEvent.teamId,
        playerId,
        status,
      });

      setAttendances((prev) => [
        attendance,
        ...prev.filter((item) => item.playerId !== playerId),
      ]);
    } catch (e: any) {
      setError(e?.message || "Présence non enregistrée.");
    }
  }

  function currentStatus(playerId: string) {
    return attendances.find((item) => item.playerId === playerId)?.status || "";
  }

  return (
    <section className="convoc">
      <div className="top">
        <div>
          <p>CONVOCATIONS</p>
          <h2>Présences & réponses</h2>
          <span>Un événement → une équipe → convocations → présences.</span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <aside className="events">
          <h3>Événements</h3>
          {events.map((event) => (
            <button
              key={event.id}
              className={event.id === eventId ? "active" : ""}
              onClick={() => setEventId(event.id)}
            >
              <strong>{event.title}</strong>
              <span>{event.eventDate} · {event.eventType}</span>
            </button>
          ))}
        </aside>

        <main className="main">
          {selectedEvent ? (
            <>
              <div className="eventHead">
                <div>
                  <p>ÉVÉNEMENT</p>
                  <h3>{selectedEvent.title}</h3>
                  <span>{selectedEvent.eventDate} · {selectedTeam?.name || "Sans équipe"}</span>
                </div>
                <div className="actions">
                  <button disabled={saving} onClick={generate}>Générer</button>
                  <button disabled={saving || !recipients.length} onClick={send}>Marquer envoyé</button>
                </div>
              </div>

              <div className="kpis">
                <b>{roster.length}<small>effectif</small></b>
                <b>{recipients.length}<small>convoqués</small></b>
                <b>{attendances.filter((a) => a.status === "present").length}<small>présents</small></b>
                <b>{attendances.filter((a) => a.status === "absent").length}<small>absents</small></b>
              </div>

              <div className="table">
                <div className="row head">
                  <span>Joueur</span>
                  <span>Convocation</span>
                  <span>Présence</span>
                  <span>Actions</span>
                </div>

                {(recipients.length ? recipients : roster.map((player) => ({
                  id: player.id,
                  clubId,
                  eventId: selectedEvent.id,
                  playerId: player.id,
                  teamId: player.teamId,
                  recipientType: "player",
                  status: "non généré",
                  response: null,
                  responseAt: null,
                  sentAt: null,
                }))).map((recipient) => {
                  const player = getRecipientPlayer(recipient as EventRecipient, players);
                  if (!player) return null;

                  return (
                    <div className="row" key={recipient.id}>
                      <span>{player.lastName} {player.firstName}</span>
                      <span>{recipient.status}</span>
                      <span>{currentStatus(player.id) || "—"}</span>
                      <span className="buttons">
                        {STATUS.map((item) => (
                          <button
                            key={item.value}
                            className={currentStatus(player.id) === item.value ? "selected" : ""}
                            onClick={() => setPresence(player.id, item.value)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty">Crée d’abord un événement dans le calendrier central.</div>
          )}
        </main>
      </div>

      <style jsx>{`
        .convoc{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p,.eventHead p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span,.eventHead span{color:#6b7280;font-weight:700}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .layout{display:grid;grid-template-columns:300px 1fr;gap:18px;padding:18px}.events,.main{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.events{background:#fffdf8}.events h3,.eventHead h3{margin:0 0 14px;color:#6b1a2c}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer}.events button{width:100%;display:grid;text-align:left;background:#fff;color:#111827;border-radius:16px;margin-bottom:8px}.events button.active{border-color:#6b1a2c;box-shadow:0 0 0 3px rgba(107,26,44,.12)}.events button span{color:#6b7280;font-size:.75rem}
        .eventHead{display:flex;justify-content:space-between;gap:14px;align-items:center}.actions{display:flex;gap:8px;flex-wrap:wrap}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.kpis b{border:1px solid #eadfd5;background:#fff8ee;border-radius:20px;padding:16px;text-align:center;color:#6b1a2c;font-size:1.4rem}.kpis small{display:block;color:#6b7280;font-size:.72rem}
        .table{border:1px solid #eef2f7;border-radius:18px;overflow:hidden}.row{display:grid;grid-template-columns:1.2fr .8fr .8fr 2fr;border-bottom:1px solid #eef2f7}.row span{padding:12px;font-weight:800}.row.head{background:#f8fafc;color:#6b7280}.buttons{display:flex;gap:6px;flex-wrap:wrap}.buttons button{font-size:.72rem;background:#fffaf2;color:#6b1a2c}.buttons button.selected{background:#6b1a2c;color:white}.empty{padding:40px;text-align:center;color:#6b7280;font-weight:900}
        @media(max-width:980px){.layout{grid-template-columns:1fr}.kpis,.row{grid-template-columns:1fr}.row.head{display:none}}
      `}</style>
    </section>
  );
}
