"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type CalendarEventType = "training" | "game" | "meeting" | "formation" | "other";
type RecurrenceType = "none" | "weekly" | "monthly" | "yearly";

type Team = { id: string; name: string };

type CalendarEvent = {
  id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: CalendarEventType | null;
  session_id: string | null;
  attachment_url: string | null;
  match_id?: string | null;
  team_id?: string | null;
  game_plan_id?: string | null;
  visibility?: string | null;
  created_at?: string | null;
  recurrence_id?: string | null;
  recurrence_occurrence_date?: string | null;
  virtual?: boolean;
};

type RecurringRule = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  team_id: string | null;
  event_type: CalendarEventType;
  recurrence_type: Exclude<RecurrenceType, "none">;
  occurrence_count: number;
  is_active: boolean;
  created_at?: string | null;
};

type EventForm = {
  title: string;
  description: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  team_id: string;
  event_type: CalendarEventType;
  recurrence: RecurrenceType;
  recurrence_count: string;
};

type HistoryState = {
  titles: string[];
  locations: string[];
};

const EVENT_LABELS: Record<CalendarEventType, string> = {
  training: "Séance",
  game: "Match",
  meeting: "Réunion",
  formation: "Formation",
  other: "Autre",
};

const HISTORY_KEY = "mybasket_calendar_history_v2";

const blankForm = (): EventForm => ({
  title: "",
  description: "",
  event_date: "",
  start_time: "",
  end_time: "",
  location: "",
  team_id: "",
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

function todayIso() {
  return toDateInputValue(new Date());
}

function addMonthsKeepDay(date: Date, months: number) {
  const sourceDay = date.getDate();
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== sourceDay) next.setDate(0);
  return next;
}

function buildRecurringDates(
  startDate: string,
  recurrence: RecurrenceType,
  countRaw: string | number,
) {
  const count = Math.min(Math.max(Number(countRaw) || 1, 1), 120);
  const start = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(start.getTime())) return [];

  return Array.from({ length: recurrence === "none" ? 1 : count }, (_, index) => {
    const next = new Date(start);
    if (recurrence === "weekly") next.setDate(start.getDate() + index * 7);
    if (recurrence === "monthly") return toDateInputValue(addMonthsKeepDay(start, index));
    if (recurrence === "yearly") next.setFullYear(start.getFullYear() + index);
    return toDateInputValue(next);
  });
}

function recurrenceLabel(type: RecurrenceType, startDate?: string) {
  if (type === "weekly") {
    if (startDate) {
      const d = new Date(`${startDate}T12:00:00`);
      if (!Number.isNaN(d.getTime())) {
        const weekday = d.toLocaleDateString("fr-FR", { weekday: "long" });
        return `Tous les ${weekday}s`;
      }
    }
    return "Toutes les semaines";
  }
  if (type === "monthly") return "Tous les mois";
  if (type === "yearly") return "Tous les ans";
  return "Aucune";
}

function uniqueHistory(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase("fr-FR");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result.slice(0, 80);
}

function readLocalHistory(): HistoryState {
  if (typeof window === "undefined") return { titles: [], locations: [] };
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return { titles: [], locations: [] };
    const parsed = JSON.parse(raw) as Partial<HistoryState>;
    return {
      titles: Array.isArray(parsed.titles) ? uniqueHistory(parsed.titles) : [],
      locations: Array.isArray(parsed.locations) ? uniqueHistory(parsed.locations) : [],
    };
  } catch {
    return { titles: [], locations: [] };
  }
}

function writeLocalHistory(next: HistoryState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // non bloquant
  }
}

function SmartInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);

  const filtered = useMemo(() => {
    const query = value.trim().toLocaleLowerCase("fr-FR");
    if (!focused) return [];
    if (!query) return suggestions.slice(0, 6);

    const starts = suggestions.filter((item) =>
      item.toLocaleLowerCase("fr-FR").startsWith(query),
    );
    const contains = suggestions.filter(
      (item) =>
        !starts.includes(item) &&
        item.toLocaleLowerCase("fr-FR").includes(query),
    );
    return [...starts, ...contains].slice(0, 6);
  }, [focused, suggestions, value]);

  return (
    <div className="smartInput">
      <input
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 140)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {filtered.length > 0 && (
        <div className="suggestions">
          {filtered.map((item) => (
            <button
              type="button"
              key={item}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(item);
                setFocused(false);
              }}
            >
              <span>↳</span>
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MonCalendrier() {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [recurrences, setRecurrences] = useState<RecurringRule[]>([]);
  const [history, setHistory] = useState<HistoryState>({ titles: [], locations: [] });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingSeriesId, setDeletingSeriesId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(blankForm());

  useEffect(() => {
    void loadEvents();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function materializeDueRecurrences(userId: string, rules?: RecurringRule[]) {
    let series = rules;

    if (!series) {
      const { data, error } = await supabase
        .from("calendar_recurrences")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (error) {
        console.error("Erreur chargement récurrences:", error);
        return;
      }
      series = (data ?? []) as RecurringRule[];
    }

    if (!series.length) return;

    const today = todayIso();
    const dueRows: Array<Record<string, unknown>> = [];

    for (const rule of series) {
      const dates = buildRecurringDates(
        rule.start_date,
        rule.recurrence_type,
        rule.occurrence_count,
      );

      for (const date of dates) {
        // Les occurrences FUTURES restent virtuelles : elles sont visibles
        // dans Mon Calendrier mais n'existent pas dans calendar_events.
        if (date > today) continue;

        dueRows.push({
          user_id: userId,
          title: rule.title,
          description: rule.description,
          event_date: date,
          start_time: rule.start_time,
          end_time: rule.end_time,
          location: rule.location,
          team_id: rule.team_id,
          event_type: rule.event_type,
          session_id: null,
          attachment_url: null,
          visibility: "private",
          recurrence_id: rule.id,
          recurrence_occurrence_date: date,
        });
      }
    }

    if (!dueRows.length) return;

    const { error } = await supabase
      .from("calendar_events")
      .upsert(dueRows, {
        onConflict: "recurrence_id,recurrence_occurrence_date",
        ignoreDuplicates: true,
      });

    if (error) {
      console.error("Erreur matérialisation récurrences:", error);
    }
  }

  async function loadEvents() {
    setLoading(true);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setEvents([]);
      setRecurrences([]);
      setLoading(false);
      return;
    }

    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .select("id,name")
      .order("name");

    if (teamError) console.error("Erreur chargement équipes calendrier:", teamError);
    setTeams((teamData ?? []) as Team[]);

    const { data: recurrenceData, error: recurrenceError } = await supabase
      .from("calendar_recurrences")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("start_date", { ascending: true });

    if (recurrenceError) {
      console.error("Erreur chargement séries calendrier:", recurrenceError);
    }

    const rules = (recurrenceData ?? []) as RecurringRule[];
    setRecurrences(rules);

    await materializeDueRecurrences(user.id, rules);

    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Erreur chargement calendrier:", error);
      setEvents([]);
      setLoading(false);
      return;
    }

    const realEvents = sortEvents((data ?? []) as CalendarEvent[]);

    // Historique intelligent = événements existants + modèles récurrents + localStorage.
    const local = readLocalHistory();
    const nextHistory = {
      titles: uniqueHistory([
        ...local.titles,
        ...realEvents.map((event) => event.title),
        ...rules.map((rule) => rule.title),
      ]),
      locations: uniqueHistory([
        ...local.locations,
        ...realEvents.map((event) => event.location),
        ...rules.map((rule) => rule.location),
      ]),
    };
    setHistory(nextHistory);
    writeLocalHistory(nextHistory);

    // Génère les occurrences futures UNIQUEMENT pour l'affichage du calendrier.
    // Elles ne peuvent donc pas fausser présence, statistiques, charge, etc.
    const materialized = new Set(
      realEvents
        .filter((event) => event.recurrence_id && event.recurrence_occurrence_date)
        .map(
          (event) =>
            `${event.recurrence_id}|${event.recurrence_occurrence_date}`,
        ),
    );

    const futureVirtualEvents: CalendarEvent[] = [];
    const today = todayIso();

    for (const rule of rules) {
      const dates = buildRecurringDates(
        rule.start_date,
        rule.recurrence_type,
        rule.occurrence_count,
      );

      for (const date of dates) {
        if (date <= today) continue;
        if (materialized.has(`${rule.id}|${date}`)) continue;

        futureVirtualEvents.push({
          id: `virtual:${rule.id}:${date}`,
          user_id: user.id,
          title: rule.title,
          description: rule.description,
          event_date: date,
          start_time: rule.start_time,
          end_time: rule.end_time,
          location: rule.location,
          team_id: rule.team_id,
          event_type: rule.event_type,
          session_id: null,
          attachment_url: null,
          recurrence_id: rule.id,
          recurrence_occurrence_date: date,
          visibility: "private",
          virtual: true,
        });
      }
    }

    setEvents(sortEvents([...realEvents, ...futureVirtualEvents]));
    setLoading(false);
  }

  function updateForm<K extends keyof EventForm>(key: K, value: EventForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function rememberForm() {
    const next: HistoryState = {
      titles: uniqueHistory([form.title, ...history.titles]),
      locations: uniqueHistory([form.location, ...history.locations]),
    };
    setHistory(next);
    writeLocalHistory(next);
  }

  async function createEvent() {
    if (!form.title.trim()) return alert("Ajoute un titre à l’évènement.");
    if (!form.event_date) return alert("Ajoute une date.");

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

    if (form.recurrence === "none") {
      const { error } = await supabase.from("calendar_events").insert({
        user_id: user.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_date: form.event_date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location.trim() || null,
        team_id: form.team_id || null,
        event_type: form.event_type,
        session_id: null,
        attachment_url: null,
        visibility: "private",
      });

      if (error) {
        console.error("Erreur création évènement:", error);
        alert(`Erreur création évènement : ${error.message}`);
        setCreating(false);
        return;
      }
    } else {
      const { data: rule, error } = await supabase
        .from("calendar_recurrences")
        .insert({
          user_id: user.id,
          title: form.title.trim(),
          description: form.description.trim() || null,
          start_date: form.event_date,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          location: form.location.trim() || null,
          team_id: form.team_id || null,
          event_type: form.event_type,
          recurrence_type: form.recurrence,
          occurrence_count: Math.min(
            Math.max(Number(form.recurrence_count) || 1, 1),
            120,
          ),
          is_active: true,
        })
        .select("*")
        .single();

      if (error || !rule) {
        console.error("Erreur création récurrence:", error);
        alert(
          `Erreur création récurrence : ${
            error?.message || "Impossible de créer la série."
          }`,
        );
        setCreating(false);
        return;
      }

      // Crée seulement l'occurrence du jour / passée si nécessaire.
      // Les suivantes restent virtuelles jusqu'à leur date.
      await materializeDueRecurrences(user.id, [rule as RecurringRule]);
    }

    rememberForm();
    setForm(blankForm());
    setShowForm(false);
    setCreating(false);
    await loadEvents();
  }

  async function deleteSeries(recurrenceId: string) {
    if (!recurrenceId) return;
    if (
      !window.confirm(
        "Supprimer cette série récurrente ? Les événements déjà passés restent dans l’historique.",
      )
    ) {
      return;
    }

    setDeletingSeriesId(recurrenceId);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setDeletingSeriesId(null);
      return;
    }

    const { error } = await supabase
      .from("calendar_recurrences")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", recurrenceId)
      .eq("user_id", user.id);

    if (error) {
      alert(`Impossible de supprimer la série : ${error.message}`);
      setDeletingSeriesId(null);
      return;
    }

    setDeletingSeriesId(null);
    await loadEvents();
  }

  async function deleteEvent(id: string) {
    const eventToDelete = events.find((event) => event.id === id);
    if (!eventToDelete) return;

    if (eventToDelete.virtual && eventToDelete.recurrence_id) {
      await deleteSeries(eventToDelete.recurrence_id);
      return;
    }

    const linkedSessionId = eventToDelete.session_id;
    const ok = confirm(
      linkedSessionId
        ? "Supprimer cette séance ? Elle disparaîtra du calendrier, de la fiche équipe et de Mes séances."
        : "Supprimer cet évènement du calendrier ?",
    );
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

    if (linkedSessionId) {
      const { error: sessionError } = await supabase
        .from("practice_sessions")
        .delete()
        .eq("id", linkedSessionId)
        .or(`user_id.eq.${user.id},owner_id.eq.${user.id}`);

      if (sessionError) {
        console.error("Erreur suppression séance liée:", sessionError);
        alert(
          `Impossible de supprimer la séance de MyBasket : ${sessionError.message}`,
        );
        setDeletingId(null);
        return;
      }

      const { error: calendarError } = await supabase
        .from("calendar_events")
        .delete()
        .eq("session_id", linkedSessionId)
        .eq("user_id", user.id);

      if (calendarError) {
        console.error("Erreur nettoyage calendrier:", calendarError);
        await loadEvents();
        setDeletingId(null);
        return;
      }

      setEvents((prev) =>
        prev.filter((event) => event.session_id !== linkedSessionId),
      );
      setDeletingId(null);
      return;
    }

    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Erreur suppression évènement:", error);
      alert(`Erreur suppression évènement : ${error.message}`);
      setDeletingId(null);
      return;
    }

    setEvents((prev) => prev.filter((event) => event.id !== id));
    setDeletingId(null);
  }

  const grouped = useMemo(
    () =>
      events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
        const key = event.event_date || "Sans date";
        if (!acc[key]) acc[key] = [];
        acc[key].push(event);
        return acc;
      }, {}),
    [events],
  );

  const weeklyLabel = recurrenceLabel("weekly", form.event_date);

  if (loading)
    return <main className="calendarPage">Chargement du calendrier...</main>;

  return (
    <main className="calendarPage">
      <section className="calendarHero">
        <div>
          <h1>MON CALENDRIER</h1>
          <p>
            Séances, matchs, réunions et formations liés à ton activité coach.
          </p>
        </div>
        <div className="heroActions">
          <button
            type="button"
            className="createBtn"
            onClick={() => setShowForm((value) => !value)}
          >
            {showForm ? "Fermer" : "+ Ajouter"}
          </button>
          <button type="button" onClick={loadEvents}>
            ↻ Actualiser
          </button>
        </div>
      </section>

      {showForm && (
        <section className="eventForm">
          <div className="formHeader">
            <div>
              <span>CALENDRIER</span>
              <h2>Créer un évènement</h2>
            </div>
            <small>
              Les champs déjà utilisés te seront reproposés automatiquement.
            </small>
          </div>

          <div className="formGrid">
            <label>
              Titre *
              <SmartInput
                value={form.title}
                onChange={(value) => updateForm("title", value)}
                suggestions={history.titles}
                placeholder="Ex : Entraînement U18"
              />
            </label>

            <label>
              Type
              <select
                value={form.event_type}
                onChange={(event) =>
                  updateForm(
                    "event_type",
                    event.target.value as CalendarEventType,
                  )
                }
              >
                <option value="training">Séance</option>
                <option value="game">Match</option>
                <option value="meeting">Réunion</option>
                <option value="formation">Formation</option>
                <option value="other">Autre</option>
              </select>
            </label>

            <label>
              Équipe associée
              <select value={form.team_id} onChange={(event) => updateForm("team_id", event.target.value)}>
                <option value="">Aucune équipe</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>

            <label>
              Date *
              <input
                type="date"
                value={form.event_date}
                onChange={(event) =>
                  updateForm("event_date", event.target.value)
                }
              />
            </label>

            <label>
              Heure début
              <input
                type="time"
                value={form.start_time}
                onChange={(event) =>
                  updateForm("start_time", event.target.value)
                }
              />
            </label>

            <label>
              Heure fin
              <input
                type="time"
                value={form.end_time}
                onChange={(event) =>
                  updateForm("end_time", event.target.value)
                }
              />
            </label>

            <label>
              Lieu / gymnase
              <SmartInput
                value={form.location}
                onChange={(value) => updateForm("location", value)}
                suggestions={history.locations}
                placeholder="Ex : Carpentier"
              />
            </label>
          </div>

          <div className="recurrenceBox">
            <div className="recurrenceIntro">
              <div className="repeatIcon">↻</div>
              <div>
                <strong>Récurrence</strong>
                <span>
                  Les événements futurs apparaissent dans ton calendrier mais ne
                  sont pas comptés ailleurs avant leur date.
                </span>
              </div>
            </div>

            <div className="recurrenceControls">
              <select
                value={form.recurrence}
                onChange={(event) =>
                  updateForm(
                    "recurrence",
                    event.target.value as RecurrenceType,
                  )
                }
              >
                <option value="none">Aucune</option>
                <option value="weekly">{weeklyLabel}</option>
                <option value="monthly">Tous les mois</option>
                <option value="yearly">Tous les ans</option>
              </select>

              {form.recurrence !== "none" && (
                <label className="occurrences">
                  <span>Nombre</span>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={form.recurrence_count}
                    onChange={(event) =>
                      updateForm("recurrence_count", event.target.value)
                    }
                  />
                </label>
              )}
            </div>
          </div>

          <label className="full">
            Description
            <textarea
              value={form.description}
              onChange={(event) =>
                updateForm("description", event.target.value)
              }
              placeholder="Infos utiles, consignes, rendez-vous..."
            />
          </label>

          <div className="formActions">
            <button
              type="button"
              className="cancel"
              onClick={() => setShowForm(false)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="save"
              disabled={creating}
              onClick={createEvent}
            >
              {creating
                ? "Création..."
                : form.recurrence === "none"
                  ? "Créer l’évènement"
                  : `Créer la série (${form.recurrence_count || 1})`}
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
                  <article
                    className={`eventCard ${
                      event.session_id ? "clickableEvent" : ""
                    } ${event.virtual ? "futureRecurring" : ""}`}
                    key={event.id}
                    onClick={() => {
                      if (event.session_id)
                        window.location.href = `/seances/${event.session_id}`;
                    }}
                  >
                    <div className="eventType">
                      {eventLabel(event.event_type)}
                      {event.virtual && <small>RÉCURRENT À VENIR</small>}
                    </div>

                    <div className="eventMain">
                      <div className="eventTitleLine">
                        <h3>{event.title}</h3>
                        {event.recurrence_id && <span className="repeatBadge">↻</span>}
                      </div>
                      <p>{event.description || "Aucune description."}</p>
                      <div className="meta">
                        <span>
                          🕒 {formatTime(event.start_time)} -{" "}
                          {formatTime(event.end_time)}
                        </span>
                        <span>📍 {event.location || "Lieu non défini"}</span>
                      </div>
                      {event.virtual && (
                        <div className="futureHint">
                          Prévu automatiquement · ne compte pas encore dans les
                          suivis.
                        </div>
                      )}
                    </div>

                    <div
                      className="actions"
                      onClick={(eventClick) => eventClick.stopPropagation()}
                    >
                      {event.session_id && (
                        <Link href={`/seances/${event.session_id}`}>
                          Voir séance
                        </Link>
                      )}
                      {event.session_id && (
                        <Link href={`/seances/apercu/${event.session_id}`}>
                          👁 Fiche PDF
                        </Link>
                      )}
                      {event.match_id && event.team_id && (
                        <Link
                          href={`/equipes/${event.team_id}?match=${event.match_id}`}
                        >
                          Boxscore complet
                        </Link>
                      )}
                      {event.attachment_url && (
                        <a
                          href={event.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ouvrir le PDF
                        </a>
                      )}

                      {event.virtual && event.recurrence_id ? (
                        <button
                          type="button"
                          disabled={deletingSeriesId === event.recurrence_id}
                          onClick={() => deleteSeries(event.recurrence_id!)}
                        >
                          {deletingSeriesId === event.recurrence_id
                            ? "..."
                            : "Supprimer série"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={deletingId === event.id}
                          onClick={() => deleteEvent(event.id)}
                        >
                          {deletingId === event.id ? "..." : "Supprimer"}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <style jsx>{`
        .calendarPage{min-height:100%;background:#fff;color:#111}
        .calendarHero{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:34px;border-bottom:3px solid #d4a24c;padding-bottom:18px}
        .calendarHero h1{margin:0;color:#7a0d24;font-size:42px;font-family:Oswald,Roboto,sans-serif;font-weight:900}
        .calendarHero p{margin:6px 0 0;color:#666}
        .heroActions{display:flex;gap:10px;flex-wrap:wrap}
        .calendarHero button{height:42px;border:2px solid #7a0d24;background:white;color:#7a0d24;border-radius:999px;padding:0 16px;font-weight:900;cursor:pointer}
        .calendarHero .createBtn{background:#7a0d24;color:white}

        .eventForm{border:1px solid #eee;border-radius:18px;padding:22px;margin-bottom:28px;box-shadow:0 8px 24px rgba(0,0,0,.06);background:#fff}
        .formHeader{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px}
        .formHeader span{display:block;color:#d4a24c;font-size:10px;font-weight:1000;letter-spacing:.12em}
        .eventForm h2{margin:2px 0 0;color:#7a0d24;font-family:Oswald,Roboto,sans-serif;font-size:26px}
        .formHeader small{max-width:340px;color:#888;text-align:right;font-weight:700}
        .formGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        label{display:flex;flex-direction:column;gap:6px;color:#7a0d24;font-weight:900;font-size:13px;text-transform:uppercase}
        input,select,textarea{border:1px solid #ddd;border-radius:10px;padding:11px 12px;font:inherit;color:#111;background:#fff;text-transform:none;font-weight:500}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#d4a24c;box-shadow:0 0 0 3px rgba(212,162,76,.12)}
        textarea{min-height:110px;resize:vertical}
        .full{margin-top:14px}

        .smartInput{position:relative}
        .smartInput>input{width:100%}
        .suggestions{position:absolute;z-index:30;top:calc(100% + 5px);left:0;right:0;background:white;border:1px solid #eadfd7;border-radius:11px;box-shadow:0 14px 30px rgba(44,21,18,.13);overflow:hidden}
        .suggestions button{width:100%;border:0;border-bottom:1px solid #f1ebe7;background:#fff;text-align:left;padding:10px 12px;color:#2b211d;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:8px}
        .suggestions button:last-child{border-bottom:0}
        .suggestions button:hover{background:#fff8ee;color:#7a0d24}
        .suggestions span{color:#d4a24c}

        .recurrenceBox{margin-top:16px;border:1px solid #eadfd5;border-radius:14px;padding:13px 14px;background:#fffaf3;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
        .recurrenceIntro{display:flex;align-items:center;gap:10px;min-width:280px}
        .repeatIcon{width:36px;height:36px;border-radius:10px;background:#7a0d24;color:white;display:grid;place-items:center;font-size:18px;font-weight:1000}
        .recurrenceIntro strong{display:block;color:#7a0d24}
        .recurrenceIntro span{display:block;color:#74675f;font-size:11px;margin-top:2px;max-width:520px}
        .recurrenceControls{display:flex;align-items:center;gap:8px}
        .recurrenceControls select{min-width:180px}
        .occurrences{display:flex;flex-direction:row;align-items:center;gap:6px;text-transform:none;color:#76665d;font-size:11px}
        .occurrences input{width:74px;padding:10px;text-align:center;font-weight:900}

        .formActions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
        .formActions button{border:none;border-radius:999px;padding:12px 18px;cursor:pointer;font-weight:900}
        .cancel{background:#f2f2f2}
        .save{background:#7a0d24;color:#fff}
        .save:disabled{opacity:.55;cursor:not-allowed}

        .empty{border:1px dashed #ddd;border-radius:14px;padding:50px;text-align:center;color:#777}
        .days{display:flex;flex-direction:column;gap:26px}
        .day h2{color:#7a0d24;font-family:Oswald,Roboto,sans-serif;text-transform:capitalize;margin:0 0 14px}
        .events{display:flex;flex-direction:column;gap:14px}
        .eventCard{display:grid;grid-template-columns:125px 1fr 240px;gap:18px;align-items:center;border:1px solid #eee;border-radius:14px;padding:18px;box-shadow:0 8px 24px rgba(0,0,0,.06);background:#fff}
        .futureRecurring{border-style:dashed;background:#fffdf8;box-shadow:none}
        .clickableEvent{cursor:pointer}
        .eventType{background:#f6eadc;color:#7a0d24;border-radius:14px;padding:9px 12px;text-align:center;font-weight:900}
        .eventType small{display:block;margin-top:4px;font-size:8px;letter-spacing:.06em;color:#9a6c1c}
        .eventTitleLine{display:flex;align-items:center;gap:8px}
        .eventMain h3{margin:0 0 8px;font-family:Oswald,Roboto,sans-serif;font-size:24px}
        .repeatBadge{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:#fff1d6;color:#8a5c0b;font-weight:1000}
        .eventMain p{color:#666;margin:0 0 10px;white-space:pre-line}
        .meta{display:flex;gap:12px;flex-wrap:wrap;color:#7a0d24;font-weight:900}
        .futureHint{margin-top:8px;color:#9a6c1c;font-size:10px;font-weight:800}
        .actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
        .actions a,.actions button{height:38px;border:none;border-radius:8px;padding:0 12px;font-weight:900;cursor:pointer;text-decoration:none;display:grid;place-items:center;font-size:13px}
        .actions a{background:#7a0d24;color:white}
        .actions button{background:#ffe8ec;color:#c5283d}

        @media(max-width:1000px){
          .eventCard,.formGrid{grid-template-columns:1fr}
          .actions{justify-content:flex-start}
          .formHeader{align-items:flex-start;flex-direction:column}
          .formHeader small{text-align:left}
        }
        @media(max-width:650px){
          .recurrenceControls{width:100%;flex-wrap:wrap}
          .recurrenceControls select{flex:1;min-width:0}
        }
      `}</style>
    </main>
  );
}
