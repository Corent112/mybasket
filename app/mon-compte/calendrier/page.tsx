"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type CalendarEventType = "training" | "game" | "meeting" | "formation" | "other";
type RecurrenceType = "none" | "weekly" | "monthly" | "yearly";

type CalendarEvent = {
  id: string;
  user_id: string | null;
  owner_id?: string | null;
  title: string;
  description: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: CalendarEventType | null;
  session_id: string | null;
  attachment_url: string | null;
  visibility?: string | null;
  created_at?: string | null;
};

type EventForm = {
  title: string;
  description: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  event_type: CalendarEventType;
  recurrence: RecurrenceType;
  recurrence_count: string;
};

const EVENT_LABELS: Record<CalendarEventType, string> = {
  training: "Séance",
  game: "Match",
  meeting: "Réunion",
  formation: "Formation",
  other: "Autre",
};

const blankForm = (): EventForm => ({
  title: "",
  description: "",
  event_date: "",
  start_time: "",
  end_time: "",
  location: "",
  event_type: "training",
  recurrence: "none",
  recurrence_count: "12",
});

function formatDate(date: string | null) {
  if (!date) return "Date non définie";

  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;

  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(time: string | null) {
  if (!time) return "—";
  return time.slice(0, 5);
}

function eventLabel(type: CalendarEvent["event_type"]) {
  return EVENT_LABELS[type ?? "other"] ?? "Autre";
}

function sortEvents(events: CalendarEvent[]) {
  return [...events].sort((a, b) => {
    const dateA = a.event_date || "9999-12-31";
    const dateB = b.event_date || "9999-12-31";
    const timeA = a.start_time || "99:99";
    const timeB = b.start_time || "99:99";

    return dateA.localeCompare(dateB) || timeA.localeCompare(timeB);
  });
}

function toDateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function addMonthsKeepDay(date: Date, months: number) {
  const sourceDay = date.getDate();
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);

  if (next.getDate() !== sourceDay) {
    next.setDate(0);
  }

  return next;
}

function buildRecurringDates(startDate: string, recurrence: RecurrenceType, countRaw: string) {
  const count = Math.min(Math.max(Number(countRaw) || 1, 1), 120);
  const start = new Date(`${startDate}T12:00:00`);

  if (Number.isNaN(start.getTime())) return [];

  return Array.from({ length: recurrence === "none" ? 1 : count }, (_, index) => {
    const next = new Date(start);

    if (recurrence === "weekly") {
      next.setDate(start.getDate() + index * 7);
    }

    if (recurrence === "monthly") {
      return toDateInputValue(addMonthsKeepDay(start, index));
    }

    if (recurrence === "yearly") {
      next.setFullYear(start.getFullYear() + index);
    }

    return toDateInputValue(next);
  });
}

function recurrenceLabel(type: RecurrenceType) {
  if (type === "weekly") return "Toutes les semaines";
  if (type === "monthly") return "Tous les mois";
  if (type === "yearly") return "Tous les ans";
  return "Aucune";
}

export default function MonCalendrier() {
  const supabase = createClient();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(blankForm());

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .or(`user_id.eq.${user.id},owner_id.eq.${user.id}`)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Erreur chargement calendrier:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      setEvents([]);
      setLoading(false);
      return;
    }

    setEvents(sortEvents((data ?? []) as CalendarEvent[]));
    setLoading(false);
  }

  function updateForm<K extends keyof EventForm>(key: K, value: EventForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function createEvent() {
    if (!form.title.trim()) {
      alert("Ajoute un titre à l’évènement.");
      return;
    }

    if (!form.event_date) {
      alert("Ajoute une date.");
      return;
    }

    setCreating(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("Tu dois être connecté pour créer un évènement.");
      setCreating(false);
      return;
    }

    const dates = buildRecurringDates(
      form.event_date,
      form.recurrence,
      form.recurrence_count
    );

    const rows = dates.map((date, index) => ({
      user_id: user.id,
      owner_id: user.id,
      title:
        form.recurrence === "none"
          ? form.title.trim()
          : `${form.title.trim()} (${index + 1}/${dates.length})`,
      description:
        form.recurrence === "none"
          ? form.description.trim() || null
          : `${form.description.trim() || ""}${
              form.description.trim() ? "\n\n" : ""
            }Récurrence : ${recurrenceLabel(form.recurrence)}.`,
      event_date: date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location.trim() || null,
      event_type: form.event_type,
      session_id: null,
      attachment_url: null,
      visibility: "private",
    }));

    const { error } = await supabase.from("calendar_events").insert(rows);

    if (error) {
      console.error("Erreur création évènement:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      alert(`Erreur création évènement : ${error.message}`);
      setCreating(false);
      return;
    }

    setForm(blankForm());
    setShowForm(false);
    setCreating(false);
    await loadEvents();
  }

  async function deleteEvent(id: string) {
    const ok = confirm("Supprimer cet évènement du calendrier ?");
    if (!ok) return;

    setDeletingId(id);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("Tu dois être connecté pour supprimer un évènement.");
      setDeletingId(null);
      return;
    }

    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", id)
      .or(`user_id.eq.${user.id},owner_id.eq.${user.id}`);

    if (error) {
      console.error("Erreur suppression évènement:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      alert(`Erreur suppression évènement : ${error.message}`);
      setDeletingId(null);
      return;
    }

    setEvents((prev) => prev.filter((event) => event.id !== id));
    setDeletingId(null);
  }

  const grouped = useMemo(() => {
    return events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      const key = event.event_date || "Sans date";

      if (!acc[key]) acc[key] = [];

      acc[key].push(event);

      return acc;
    }, {});
  }, [events]);

  if (loading) {
    return <main className="calendarPage">Chargement du calendrier...</main>;
  }

  return (
    <main className="calendarPage">
      <section className="calendarHero">
        <div>
          <h1>MON CALENDRIER</h1>
          <p>Séances, matchs, réunions et formations liés à ton activité coach.</p>
        </div>

        <div className="heroActions">
          <button type="button" className="createBtn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Fermer" : "+ Ajouter"}
          </button>

          <button type="button" onClick={loadEvents}>
            ↻ Actualiser
          </button>
        </div>
      </section>

      {showForm && (
        <section className="eventForm">
          <h2>Créer un évènement</h2>

          <div className="formGrid">
            <label>
              Titre *
              <input
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                placeholder="Ex : Entraînement U18"
              />
            </label>

            <label>
              Type
              <select
                value={form.event_type}
                onChange={(e) => updateForm("event_type", e.target.value as CalendarEventType)}
              >
                <option value="training">Séance</option>
                <option value="game">Match</option>
                <option value="meeting">Réunion</option>
                <option value="formation">Formation</option>
                <option value="other">Autre</option>
              </select>
            </label>

            <label>
              Date *
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => updateForm("event_date", e.target.value)}
              />
            </label>

            <label>
              Heure début
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => updateForm("start_time", e.target.value)}
              />
            </label>

            <label>
              Heure fin
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => updateForm("end_time", e.target.value)}
              />
            </label>

            <label>
              Lieu
              <input
                value={form.location}
                onChange={(e) => updateForm("location", e.target.value)}
                placeholder="Gymnase, salle, terrain..."
              />
            </label>

            <label>
              Récurrence
              <select
                value={form.recurrence}
                onChange={(e) => updateForm("recurrence", e.target.value as RecurrenceType)}
              >
                <option value="none">Aucune</option>
                <option value="weekly">Toutes les semaines</option>
                <option value="monthly">Tous les mois</option>
                <option value="yearly">Tous les ans</option>
              </select>
            </label>

            {form.recurrence !== "none" && (
              <label>
                Nombre d’occurrences
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={form.recurrence_count}
                  onChange={(e) => updateForm("recurrence_count", e.target.value)}
                />
              </label>
            )}
          </div>

          <label className="full">
            Description
            <textarea
              value={form.description}
              onChange={(e) => updateForm("description", e.target.value)}
              placeholder="Infos utiles, consignes, rendez-vous..."
            />
          </label>

          <div className="formActions">
            <button type="button" className="cancel" onClick={() => setShowForm(false)}>
              Annuler
            </button>

            <button type="button" className="save" disabled={creating} onClick={createEvent}>
              {creating ? "Création..." : "Créer l’évènement"}
            </button>
          </div>
        </section>
      )}

      {events.length === 0 ? (
        <div className="empty">Aucun évènement pour le moment.</div>
      ) : (
        <section className="days">
          {Object.entries(grouped).map(([date, dayEvents]) => (
            <div className="day" key={date}>
              <h2>{date === "Sans date" ? date : formatDate(date)}</h2>

              <div className="events">
                {dayEvents.map((event) => (
                  <article className="eventCard" key={event.id}>
                    <div className="eventType">{eventLabel(event.event_type)}</div>

                    <div className="eventMain">
                      <h3>{event.title}</h3>

                      <p>{event.description || "Aucune description."}</p>

                      <div className="meta">
                        <span>
                          🕒 {formatTime(event.start_time)} - {formatTime(event.end_time)}
                        </span>

                        <span>📍 {event.location || "Lieu non défini"}</span>
                      </div>
                    </div>

                    <div className="actions">
                      {event.session_id && (
                        <Link href={`/seances/${event.session_id}`}>Voir séance</Link>
                      )}

                      {event.attachment_url && (
                        <a href={event.attachment_url} target="_blank" rel="noreferrer">
                          PDF
                        </a>
                      )}

                      <button
                        type="button"
                        disabled={deletingId === event.id}
                        onClick={() => deleteEvent(event.id)}
                      >
                        {deletingId === event.id ? "..." : "Supprimer"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <style jsx>{`
        .calendarPage {
          min-height: 100%;
          background: #fff;
          color: #111;
        }

        .calendarHero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
          margin-bottom: 34px;
          border-bottom: 3px solid #d4a24c;
          padding-bottom: 18px;
        }

        .calendarHero h1 {
          margin: 0;
          color: #7a0d24;
          font-size: 42px;
          font-family: Oswald, Roboto, sans-serif;
          font-weight: 900;
        }

        .calendarHero p {
          margin: 6px 0 0;
          color: #666;
        }

        .heroActions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .calendarHero button {
          height: 42px;
          border: 2px solid #7a0d24;
          background: white;
          color: #7a0d24;
          border-radius: 999px;
          padding: 0 16px;
          font-weight: 900;
          cursor: pointer;
        }

        .calendarHero .createBtn {
          background: #7a0d24;
          color: white;
        }

        .eventForm {
          border: 1px solid #eee;
          border-radius: 18px;
          padding: 22px;
          margin-bottom: 28px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
          background: #fff;
        }

        .eventForm h2 {
          margin: 0 0 18px;
          color: #7a0d24;
          font-family: Oswald, Roboto, sans-serif;
          font-size: 26px;
        }

        .formGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          color: #7a0d24;
          font-weight: 900;
          font-size: 13px;
          text-transform: uppercase;
        }

        input,
        select,
        textarea {
          border: 1px solid #ddd;
          border-radius: 10px;
          padding: 11px 12px;
          font: inherit;
          color: #111;
          background: #fff;
          text-transform: none;
          font-weight: 500;
        }

        textarea {
          min-height: 110px;
          resize: vertical;
        }

        .full {
          margin-top: 14px;
        }

        .formActions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 18px;
        }

        .formActions button {
          border: none;
          border-radius: 999px;
          padding: 12px 18px;
          cursor: pointer;
          font-weight: 900;
        }

        .formActions .cancel {
          background: #f2f2f2;
          color: #111;
        }

        .formActions .save {
          background: #7a0d24;
          color: white;
        }

        .formActions button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .empty {
          border: 1px dashed #ddd;
          border-radius: 14px;
          padding: 50px;
          text-align: center;
          color: #777;
        }

        .days {
          display: flex;
          flex-direction: column;
          gap: 26px;
        }

        .day h2 {
          color: #7a0d24;
          font-family: Oswald, Roboto, sans-serif;
          text-transform: capitalize;
          margin: 0 0 14px;
        }

        .events {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .eventCard {
          display: grid;
          grid-template-columns: 110px 1fr 240px;
          gap: 18px;
          align-items: center;
          border: 1px solid #eee;
          border-radius: 14px;
          padding: 18px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
        }

        .eventType {
          background: #f6eadc;
          color: #7a0d24;
          border-radius: 999px;
          padding: 9px 12px;
          text-align: center;
          font-weight: 900;
        }

        .eventMain h3 {
          margin: 0 0 8px;
          color: #111;
          font-family: Oswald, Roboto, sans-serif;
          font-size: 24px;
        }

        .eventMain p {
          color: #666;
          margin: 0 0 10px;
          white-space: pre-line;
        }

        .meta {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          color: #7a0d24;
          font-weight: 900;
        }

        .actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          flex-wrap: wrap;
        }

        .actions a,
        .actions button {
          height: 38px;
          border: none;
          border-radius: 8px;
          padding: 0 12px;
          font-weight: 900;
          cursor: pointer;
          text-decoration: none;
          display: grid;
          place-items: center;
          font-size: 13px;
        }

        .actions a {
          background: #7a0d24;
          color: white;
        }

        .actions button {
          background: #ffe8ec;
          color: #c5283d;
        }

        .actions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 1000px) {
          .eventCard,
          .formGrid {
            grid-template-columns: 1fr;
          }

          .actions {
            justify-content: flex-start;
          }
        }
      `}</style>
    </main>
  );
}