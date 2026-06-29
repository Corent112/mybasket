"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type CalendarEventType = "training" | "game" | "meeting" | "formation" | "other";

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

const EVENT_LABELS: Record<CalendarEventType, string> = {
  training: "Séance",
  game: "Match",
  meeting: "Réunion",
  formation: "Formation",
  other: "Autre",
};

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

export default function MonCalendrier() {
  const supabase = createClient();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
          <p>
            Séances, matchs, réunions et formations liés à ton activité coach.
          </p>
        </div>

        <button type="button" onClick={loadEvents}>
          ↻ Actualiser
        </button>
      </section>

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
                    <div className="eventType">
                      {eventLabel(event.event_type)}
                    </div>

                    <div className="eventMain">
                      <h3>{event.title}</h3>

                      <p>{event.description || "Aucune description."}</p>

                      <div className="meta">
                        <span>
                          🕒 {formatTime(event.start_time)} -{" "}
                          {formatTime(event.end_time)}
                        </span>

                        <span>📍 {event.location || "Lieu non défini"}</span>
                      </div>
                    </div>

                    <div className="actions">
                      {event.session_id && (
                        <Link href={`/seances/${event.session_id}`}>
                          Voir séance
                        </Link>
                      )}

                      {event.attachment_url && (
                        <a
                          href={event.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                        >
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
          .eventCard {
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
