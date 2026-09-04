"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import InstitutionalPlanning from "@/components/institutionnel/InstitutionalPlanning";
import InstitutionalResources from "@/components/institutionnel/InstitutionalResources";

type EventRow = {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  event_type: string;
  event_domain: "training" | "player";
  location: string | null;
  intervenant: string | null;
  description?: string | null;
  source_type?: string | null;
  cohort_id?: string | null;
};

type Cohort = {
  id: string;
  name: string;
  planning_title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  training_programs?: { name?: string | null; code?: string | null } | null;
};

type TrainingBlock = {
  cohort_id: string;
  training_day: string;
};

type TrainingRange = {
  cohortId: string;
  title: string;
  fullTitle: string;
  start: string;
  end: string;
  location: string | null;
};

type ResourceType =
  | "file"
  | "note"
  | "attendance_sheet"
  | "convocation"
  | "planning"
  | "pedagogical_scenario"
  | "presentation"
  | "evaluation"
  | "form"
  | "document"
  | "other";

type EventResource = {
  id: string;
  event_id: string;
  resource_type: ResourceType;
  title: string;
  note: string | null;
  document_id: string | null;
  file_url: string | null;
  storage_path: string | null;
  completed: boolean;
};

type EventForm = {
  id?: string;
  event_date: string;
  start_time: string;
  end_time: string;
  title: string;
  event_type: string;
  event_domain: "training" | "player";
  location: string;
  intervenant: string;
  description: string;
  cohort_id: string;
};

const MONTHS = [
  "JANVIER",
  "FÉVRIER",
  "MARS",
  "AVRIL",
  "MAI",
  "JUIN",
  "JUILLET",
  "AOÛT",
  "SEPTEMBRE",
  "OCTOBRE",
  "NOVEMBRE",
  "DÉCEMBRE",
];
const DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const pad = (n: number) => String(n).padStart(2, "0");
const frDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const blankEvent = (date: string): EventForm => ({
  event_date: date,
  start_time: "09:00",
  end_time: "10:00",
  title: "",
  event_type: "formation",
  event_domain: "training",
  location: "",
  intervenant: "",
  description: "",
  cohort_id: "",
});

const RESOURCE_OPTIONS: {
  value: ResourceType;
  label: string;
  icon: string;
  defaultTitle: string;
}[] = [
  { value: "file", label: "Fichier", icon: "📎", defaultTitle: "Fichier" },
  { value: "note", label: "Note", icon: "📝", defaultTitle: "Note" },
  {
    value: "attendance_sheet",
    label: "Feuille d’émargement",
    icon: "✅",
    defaultTitle: "Feuille d’émargement",
  },
  {
    value: "convocation",
    label: "Convocation",
    icon: "✉️",
    defaultTitle: "Convocation",
  },
  { value: "planning", label: "Planning", icon: "📅", defaultTitle: "Planning" },
  {
    value: "pedagogical_scenario",
    label: "Scénario pédagogique",
    icon: "🎓",
    defaultTitle: "Scénario pédagogique",
  },
  {
    value: "presentation",
    label: "Présentation",
    icon: "🖥️",
    defaultTitle: "Présentation",
  },
  {
    value: "evaluation",
    label: "Évaluation",
    icon: "📋",
    defaultTitle: "Évaluation",
  },
  { value: "form", label: "Formulaire", icon: "🧾", defaultTitle: "Formulaire" },
  { value: "document", label: "Document", icon: "📄", defaultTitle: "Document" },
  { value: "other", label: "Autre", icon: "➕", defaultTitle: "Élément à préparer" },
];

function resourceMeta(type: ResourceType) {
  return (
    RESOURCE_OPTIONS.find((x) => x.value === type) ||
    RESOURCE_OPTIONS[RESOURCE_OPTIONS.length - 1]
  );
}

function color(type: string) {
  if (type === "formation") return { bg: "#D4A24C", fg: "#2B2119" };
  if (type === "detection" || type === "selection" || type === "stage")
    return { bg: "#6B1A2C", fg: "#fff" };
  if (type === "meeting") return { bg: "#2563EB", fg: "#fff" };
  return { bg: "#64748B", fg: "#fff" };
}

function normalizedCohortYear(value: string) {
  return String(value || "")
    .replace(/promotion/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\d{4})\s*[\/–—-]\s*(\d{4})/, "$1-$2");
}

export default function InstitutionalCalendarHub({
  structureId,
  onGoTraining,
  onGoPlayers,
}: {
  structureId: string;
  onGoTraining: () => void;
  onGoPlayers: () => void;
}) {
  const sb = useMemo(() => createClient(), []);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [trainingBlocks, setTrainingBlocks] = useState<TrainingBlock[]>([]);
  const [resources, setResources] = useState<EventResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventForm, setEventForm] = useState<EventForm | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [resourceType, setResourceType] = useState<ResourceType>("note");
  const [resourceTitle, setResourceTitle] = useState("Note");
  const [resourceNote, setResourceNote] = useState("");
  const [resourceBusy, setResourceBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);

  async function load() {
    setLoading(true);
    const [a, b, c] = await Promise.all([
      sb
        .from("institutional_events")
        .select(
          "id,event_date,start_time,end_time,title,event_type,event_domain,location,intervenant,description,source_type,cohort_id",
        )
        .eq("structure_id", structureId)
        .eq("archived", false)
        .order("event_date")
        .order("start_time"),
      sb
        .from("training_cohorts")
        .select(
          "id,name,planning_title,start_date,end_date,location,training_programs(name,code)",
        )
        .eq("institution_id", structureId)
        .order("created_at", { ascending: false }),
      sb
        .from("institutional_event_resources")
        .select(
          "id,event_id,resource_type,title,note,document_id,file_url,storage_path,completed",
        )
        .eq("structure_id", structureId)
        .order("created_at"),
    ]);

    if (a.error) console.error(a.error);
    if (b.error) console.error(b.error);
    if (
      c.error &&
      !String(c.error.message || "").includes("institutional_event_resources")
    )
      console.error(c.error);

    const loadedCohorts = (b.data || []) as unknown as Cohort[];
    setEvents((a.data || []) as EventRow[]);
    setCohorts(loadedCohorts);
    setResources((c.data || []) as EventResource[]);

    const cohortIds = loadedCohorts.map((item) => item.id);
    if (cohortIds.length) {
      const blocksQuery = await sb
        .from("training_schedule_blocks")
        .select("cohort_id,training_day")
        .in("cohort_id", cohortIds)
        .order("training_day");
      if (blocksQuery.error) console.error(blocksQuery.error);
      setTrainingBlocks((blocksQuery.data || []) as TrainingBlock[]);
    } else {
      setTrainingBlocks([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [structureId]); // eslint-disable-line react-hooks/exhaustive-deps

  function move(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const before = (first.getDay() + 6) % 7;
    const total = Math.ceil((before + last.getDate()) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const day = i - before + 1;
      return day < 1 || day > last.getDate() ? null : day;
    });
  }, [year, month]);

  const cohortMap = useMemo(
    () => new Map(cohorts.map((c) => [c.id, c])),
    [cohorts],
  );

  const trainingRanges = useMemo<TrainingRange[]>(() => {
    return cohorts
      .map((cohort) => {
        const dates = trainingBlocks
          .filter((block) => block.cohort_id === cohort.id)
          .map((block) => block.training_day)
          .filter(Boolean)
          .sort();

        const start = dates[0] || cohort.start_date || "";
        const end = dates[dates.length - 1] || cohort.end_date || start;
        if (!start || !end) return null;

        const formationName =
          cohort.training_programs?.name?.trim() ||
          cohort.planning_title?.trim() ||
          "Formation";
        const yearLabel = normalizedCohortYear(cohort.name);
        const fullTitle = yearLabel
          ? `${formationName} ${yearLabel}`
          : formationName;

        return {
          cohortId: cohort.id,
          title: formationName,
          fullTitle,
          start,
          end,
          location: cohort.location || null,
        };
      })
      .filter((item): item is TrainingRange => Boolean(item))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [cohorts, trainingBlocks]);

  // Les blocs détaillés du planning restent en base pour les autres modules,
  // mais le calendrier global ne les affiche plus individuellement.
  const regularEvents = useMemo(
    () => events.filter((e) => e.source_type !== "training_schedule_block"),
    [events],
  );

  const selectedEvent =
    regularEvents.find((e) => e.id === selectedEventId) || null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const eventList = regularEvents
    .filter((e) => showPast || e.event_date >= todayIso)
    .sort((a, b) =>
      `${a.event_date}${a.start_time || ""}`.localeCompare(
        `${b.event_date}${b.start_time || ""}`,
      ),
    );
  const trainingList = trainingRanges.filter(
    (range) => showPast || range.end >= todayIso,
  );

  function openTraining(cohortId: string) {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("trainingCohort", cohortId);
      url.searchParams.set("trainingTab", "planning");
      window.history.replaceState({}, "", url.toString());
    }
    onGoTraining();
  }

  function openNew(date?: string) {
    setEventForm(blankEvent(date || todayIso));
  }

  function editEvent(e: EventRow) {
    setEventForm({
      id: e.id,
      event_date: e.event_date,
      start_time: e.start_time?.slice(0, 5) || "",
      end_time: e.end_time?.slice(0, 5) || "",
      title: e.title,
      event_type: e.event_type,
      event_domain: e.event_domain || "training",
      location: e.location || "",
      intervenant: e.intervenant || "",
      description: e.description || "",
      cohort_id: e.cohort_id || "",
    });
  }

  async function saveEvent() {
    if (!eventForm || !eventForm.title.trim())
      return alert("Donne un titre à l’événement.");
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const payload = {
      structure_id: structureId,
      event_date: eventForm.event_date,
      start_time: eventForm.start_time || null,
      end_time: eventForm.end_time || null,
      title: eventForm.title.trim(),
      event_type: eventForm.event_type,
      event_domain: eventForm.event_domain,
      location: eventForm.location.trim() || null,
      intervenant: eventForm.intervenant.trim() || null,
      description: eventForm.description.trim() || null,
      cohort_id:
        eventForm.event_domain === "training"
          ? eventForm.cohort_id || null
          : null,
      updated_at: new Date().toISOString(),
    };
    const q = eventForm.id
      ? await sb
          .from("institutional_events")
          .update(payload)
          .eq("id", eventForm.id)
          .select("id")
          .single()
      : await sb
          .from("institutional_events")
          .insert({ ...payload, created_by: user.id })
          .select("id")
          .single();
    if (q.error) return alert(q.error.message);
    const id = String(q.data.id);
    setEventForm(null);
    await load();
    setSelectedEventId(id);
  }

  async function deleteEvent(e: EventRow) {
    if (!confirm(`Supprimer « ${e.title} » ?`)) return;
    const q = await sb
      .from("institutional_events")
      .update({ archived: true, archived_at: new Date().toISOString() })
      .eq("id", e.id);
    if (q.error) return alert(q.error.message);
    if (selectedEventId === e.id) setSelectedEventId(null);
    await load();
  }

  function changeResourceType(type: ResourceType) {
    setResourceType(type);
    setResourceTitle(resourceMeta(type).defaultTitle);
    setResourceNote("");
  }

  async function addSimpleResource() {
    if (!selectedEvent) return;
    const title = resourceTitle.trim() || resourceMeta(resourceType).defaultTitle;
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    setResourceBusy(true);
    try {
      let documentId: string | null = null;
      if (resourceType === "note") {
        const d = await sb
          .from("institutional_documents")
          .insert({
            structure_id: structureId,
            title,
            document_type: "event_note",
            content: {
              text: resourceNote,
              event_id: selectedEvent.id,
              event_title: selectedEvent.title,
            },
            created_by: user.id,
          })
          .select("id")
          .single();
        if (d.error) throw d.error;
        documentId = d.data.id;
      }
      const q = await sb
        .from("institutional_event_resources")
        .insert({
          structure_id: structureId,
          event_id: selectedEvent.id,
          resource_type: resourceType,
          title,
          note: resourceNote.trim() || null,
          document_id: documentId,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (q.error) throw q.error;
      setResourceNote("");
      setResourceTitle(resourceMeta(resourceType).defaultTitle);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ajout impossible");
    } finally {
      setResourceBusy(false);
    }
  }

  async function uploadResource(file: File) {
    if (!selectedEvent) return;
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    setResourceBusy(true);
    try {
      const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${structureId}/calendar/${selectedEvent.id}/${crypto.randomUUID()}-${clean}`;
      const u = await sb.storage
        .from("institutional-documents")
        .upload(path, file);
      if (u.error) throw u.error;
      const fileUrl = sb.storage
        .from("institutional-documents")
        .getPublicUrl(path).data.publicUrl;
      const d = await sb
        .from("institutional_documents")
        .insert({
          structure_id: structureId,
          title: file.name,
          document_type: "event_file",
          storage_path: path,
          file_url: fileUrl,
          content: {
            event_id: selectedEvent.id,
            event_title: selectedEvent.title,
          },
          created_by: user.id,
        })
        .select("id")
        .single();
      if (d.error) throw d.error;
      const q = await sb.from("institutional_event_resources").insert({
        structure_id: structureId,
        event_id: selectedEvent.id,
        resource_type: "file",
        title: file.name,
        document_id: d.data.id,
        storage_path: path,
        file_url: fileUrl,
        created_by: user.id,
      });
      if (q.error) throw q.error;
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import impossible");
    } finally {
      setResourceBusy(false);
    }
  }

  async function toggleResource(row: EventResource) {
    const q = await sb
      .from("institutional_event_resources")
      .update({
        completed: !row.completed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (q.error) return alert(q.error.message);
    setResources((v) =>
      v.map((x) =>
        x.id === row.id ? { ...x, completed: !x.completed } : x,
      ),
    );
  }

  async function removeResource(row: EventResource) {
    if (!confirm(`Retirer « ${row.title} » de l’événement ?`)) return;
    const q = await sb
      .from("institutional_event_resources")
      .delete()
      .eq("id", row.id);
    if (q.error) return alert(q.error.message);
    setResources((v) => v.filter((x) => x.id !== row.id));
  }

  return (
    <div className="hub">
      <div className="createEventBar">
        <div>
          <b>Événements de l’Institution</b>
          <span>
            Les formations apparaissent en un seul bandeau global ; les autres
            rendez-vous restent indépendants.
          </span>
        </div>
        <button
          type="button"
          className="primary createEventButton"
          onClick={() => openNew()}
        >
          ＋ Nouvel événement
        </button>
      </div>

      <section className="calendarCard">
        <div className="calHead">
          <div>
            <p>CALENDRIER INSTITUTION</p>
            <h3>
              {MONTHS[month]} {year}
            </h3>
            <span>
              Vision globale : une formation = un bandeau sur toute sa durée.
              Clique dessus pour ouvrir son planning détaillé.
            </span>
          </div>
          <div className="calActions">
            <button className="primary" onClick={() => openNew()}>
              ＋ Ajouter un événement
            </button>
            <button className="ghost" onClick={() => move(-1)}>
              ‹
            </button>
            <button
              className="ghost"
              onClick={() => {
                setYear(today.getFullYear());
                setMonth(today.getMonth());
              }}
            >
              Aujourd’hui
            </button>
            <button className="ghost" onClick={() => move(1)}>
              ›
            </button>
          </div>
        </div>

        <div className="legend">
          <span>
            <i style={{ background: "#D4A24C" }} /> Formation globale
          </span>
          <span>
            <i style={{ background: "#6B1A2C" }} /> Détection / sélection
          </span>
          <span>
            <i style={{ background: "#2563EB" }} /> Réunion
          </span>
          <span>
            <i style={{ background: "#64748B" }} /> Autre
          </span>
        </div>

        {loading ? (
          <div className="empty">Chargement…</div>
        ) : (
          <div className="calGrid">
            {DAYS.map((d, i) => (
              <div className="dow" key={`${d}-${i}`}>
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              if (day == null)
                return <div className="cell muted" key={`x-${i}`} />;
              const date = `${year}-${pad(month + 1)}-${pad(day)}`;
              const dayEvents = regularEvents.filter(
                (e) => e.event_date === date,
              );
              const dayTraining = trainingRanges.filter(
                (range) => date >= range.start && date <= range.end,
              );
              const isToday = date === todayIso;
              const column = i % 7;

              return (
                <div
                  className={`cell ${isToday ? "today" : ""}`}
                  key={date}
                  onDoubleClick={() => openNew(date)}
                >
                  <div className="cellTop">
                    <b>{day}</b>
                    <button
                      title="Ajouter un événement"
                      onClick={() => openNew(date)}
                    >
                      ＋
                    </button>
                  </div>

                  <div className="trainingBands">
                    {dayTraining.map((range) => {
                      const visibleStart =
                        date === range.start || column === 0;
                      const visibleEnd = date === range.end || column === 6;
                      const showTitle = date === range.start || column === 0;
                      return (
                        <button
                          key={`${range.cohortId}-${date}`}
                          className={`trainingBand ${
                            visibleStart ? "bandStart" : ""
                          } ${visibleEnd ? "bandEnd" : ""}`}
                          title={`${range.fullTitle} · ${frDate(
                            range.start,
                          )} → ${frDate(range.end)}`}
                          onClick={() => openTraining(range.cohortId)}
                        >
                          <span>{showTitle ? range.title : ""}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="dayEvents">
                    {dayEvents.map((e) => {
                      const c = color(e.event_type);
                      return (
                        <button
                          key={e.id}
                          className="event"
                          style={{ background: c.bg, color: c.fg }}
                          title={`${e.title}${
                            e.location ? ` · ${e.location}` : ""
                          }`}
                          onClick={() => setSelectedEventId(e.id)}
                        >
                          <small>{e.start_time?.slice(0, 5) || ""}</small>
                          <span>
                            {e.title}
                            {!e.location ? " ⚠" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="eventsSection">
        <div className="sectionHead">
          <div>
            <p>LISTE DES ÉVÉNEMENTS</p>
            <h3>Vue globale de la saison</h3>
            <span>
              Les formations sont regroupées sur leur période complète. Les
              autres événements gardent leur préparation et leurs documents.
            </span>
          </div>
          <div className="eventSectionActions">
            <button type="button" className="primary" onClick={() => openNew()}>
              ＋ Nouvel événement
            </button>
            <label className="pastToggle">
              <input
                type="checkbox"
                checked={showPast}
                onChange={(e) => setShowPast(e.target.checked)}
              />{" "}
              Afficher les événements passés
            </label>
          </div>
        </div>

        <div className="eventList">
          {trainingList.map((range) => (
            <article key={`training-${range.cohortId}`} className="trainingRow">
              <button
                className="eventMain"
                onClick={() => openTraining(range.cohortId)}
              >
                <div className="dateBox trainingDateBox">
                  <b>{new Date(`${range.start}T12:00:00`).getDate()}</b>
                  <span>
                    {new Date(`${range.start}T12:00:00`).toLocaleDateString(
                      "fr-FR",
                      { month: "short" },
                    )}
                  </span>
                </div>
                <div className="eventCopy">
                  <small>
                    {frDate(range.start)} → {frDate(range.end)}
                  </small>
                  <strong>{range.fullTitle}</strong>
                  <span>{range.location || "Lieu à définir"}</span>
                </div>
                <div className="ready openFormation">
                  <b>→</b>
                  <small>planning</small>
                </div>
              </button>
              <div className="eventQuick">
                <button onClick={() => openTraining(range.cohortId)}>
                  Ouvrir la formation
                </button>
              </div>
            </article>
          ))}

          {eventList.map((e) => {
            const items = resources.filter((r) => r.event_id === e.id);
            const done = items.filter((r) => r.completed).length;
            return (
              <article
                key={e.id}
                className={selectedEventId === e.id ? "selected" : ""}
              >
                <button
                  className="eventMain"
                  onClick={() => setSelectedEventId(e.id)}
                >
                  <div className="dateBox">
                    <b>{new Date(`${e.event_date}T12:00:00`).getDate()}</b>
                    <span>
                      {new Date(`${e.event_date}T12:00:00`).toLocaleDateString(
                        "fr-FR",
                        { month: "short" },
                      )}
                    </span>
                  </div>
                  <div className="eventCopy">
                    <small>
                      {frDate(e.event_date)} · {e.start_time?.slice(0, 5) || "--:--"}
                      {e.end_time ? ` – ${e.end_time.slice(0, 5)}` : ""}
                    </small>
                    <strong>{e.title}</strong>
                    <span>
                      {e.location || "⚠ Lieu manquant"}
                      {e.intervenant ? ` · ${e.intervenant}` : ""}
                      {e.cohort_id && cohortMap.get(e.cohort_id)
                        ? ` · ${
                            cohortMap.get(e.cohort_id)?.planning_title ||
                            cohortMap.get(e.cohort_id)?.name
                          }`
                        : ""}
                    </span>
                  </div>
                  <div className="ready">
                    <b>
                      {done}/{items.length}
                    </b>
                    <small>préparés</small>
                  </div>
                </button>
                <div className="eventQuick">
                  <button onClick={() => editEvent(e)}>Modifier</button>
                  <button onClick={() => setSelectedEventId(e.id)}>
                    Préparer
                  </button>
                  <button
                    className="danger"
                    onClick={() => void deleteEvent(e)}
                  >
                    Supprimer
                  </button>
                </div>
              </article>
            );
          })}

          {!trainingList.length && !eventList.length && (
            <div className="empty">
              Aucun événement à venir. Clique sur « Ajouter un événement ».
            </div>
          )}
        </div>
      </section>

      {selectedEvent && (
        <section className="prepSection">
          <div className="sectionHead">
            <div>
              <p>PRÉPARER L’ÉVÉNEMENT</p>
              <h3>{selectedEvent.title}</h3>
              <span>
                {frDate(selectedEvent.event_date)} ·{" "}
                {selectedEvent.start_time?.slice(0, 5) || "--:--"}
                {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
              </span>
            </div>
            <button className="ghost" onClick={() => setSelectedEventId(null)}>
              Fermer
            </button>
          </div>

          <div className="prepGrid">
            <div className="addResource">
              <h4>Ajouter ce qu’il faut pour l’événement</h4>
              <div className="resourceTypes">
                {RESOURCE_OPTIONS.filter((x) => x.value !== "file").map(
                  (x) => (
                    <button
                      key={x.value}
                      className={resourceType === x.value ? "active" : ""}
                      onClick={() => changeResourceType(x.value)}
                    >
                      <span>{x.icon}</span>
                      {x.label}
                    </button>
                  ),
                )}
              </div>
              <label>
                Titre
                <input
                  value={resourceTitle}
                  onChange={(e) => setResourceTitle(e.target.value)}
                />
              </label>
              {resourceType === "note" && (
                <label>
                  Contenu de la note
                  <textarea
                    value={resourceNote}
                    onChange={(e) => setResourceNote(e.target.value)}
                    placeholder="Informations, consignes, choses à prévoir…"
                  />
                </label>
              )}
              <div className="addActions">
                <label className="uploadBtn">
                  📎 Ajouter un fichier
                  <input
                    hidden
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadResource(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <button
                  disabled={resourceBusy}
                  onClick={() => void addSimpleResource()}
                >
                  {resourceBusy ? "Ajout…" : "＋ Ajouter à la liste"}
                </button>
              </div>
            </div>

            <div className="checklist">
              <h4>Liste de préparation</h4>
              {resources
                .filter((r) => r.event_id === selectedEvent.id)
                .map((r) => {
                  const meta = resourceMeta(r.resource_type);
                  return (
                    <article key={r.id} className={r.completed ? "done" : ""}>
                      <button className="check" onClick={() => void toggleResource(r)}>
                        {r.completed ? "✓" : ""}
                      </button>
                      <div className="resIcon">{meta.icon}</div>
                      <div>
                        <b>{r.title}</b>
                        <small>
                          {meta.label}
                          {r.note ? ` · ${r.note.slice(0, 90)}` : ""}
                        </small>
                      </div>
                      {r.file_url ? (
                        <button
                          className="open"
                          onClick={() => window.open(r.file_url || "", "_blank")}
                        >
                          Ouvrir
                        </button>
                      ) : r.document_id ? (
                        <span className="saved">Dans Documents</span>
                      ) : null}
                      <button className="remove" onClick={() => void removeResource(r)}>
                        ×
                      </button>
                    </article>
                  );
                })}
              {!resources.some((r) => r.event_id === selectedEvent.id) && (
                <div className="empty">Rien à préparer pour le moment.</div>
              )}
            </div>
          </div>

          <div className="eventDocsBuilder">
            <div className="sectionHead">
              <div>
                <p>CRÉER LES DOCUMENTS</p>
                <h3>Créer directement les documents de l’événement</h3>
                <span>
                  Choisis un modèle, construis le document aux couleurs de
                  l’Institution puis sélectionne les destinataires.
                </span>
              </div>
            </div>
            <InstitutionalResources
              structureId={structureId}
              compact
              eventId={selectedEvent.id}
              eventTitle={selectedEvent.title}
            />
          </div>
        </section>
      )}

      <section className="trainingLinked">
        <div className="sectionHead">
          <div>
            <p>FORMATIONS AU CALENDRIER</p>
            <h3>Une ligne globale par formation</h3>
            <span>
              Le programme détaillé reste dans Formation des cadres et n’est
              plus dupliqué ici bloc par bloc.
            </span>
          </div>
          <button onClick={onGoTraining}>Ouvrir Formation des cadres →</button>
        </div>
        <div className="linked">
          {trainingRanges.map((range) => (
            <article key={range.cohortId}>
              <time>
                {new Date(`${range.start}T12:00:00`).toLocaleDateString("fr-FR")}
                {range.end !== range.start
                  ? ` → ${new Date(`${range.end}T12:00:00`).toLocaleDateString(
                      "fr-FR",
                    )}`
                  : ""}
              </time>
              <div>
                <b>{range.fullTitle}</b>
                <small>{range.location || "Lieu —"}</small>
              </div>
              <button onClick={() => openTraining(range.cohortId)}>Ouvrir</button>
            </article>
          ))}
          {!trainingRanges.length && (
            <p className="empty">Aucune formation planifiée pour le moment.</p>
          )}
        </div>
      </section>

      <details className="advancedDetails">
        <summary>Afficher le planning avancé de l’Institution</summary>
        <section className="general">
          <div className="sectionHead">
            <div>
              <p>PLANNING AVANCÉ</p>
              <h3>Organisation détaillée de l’Institution</h3>
              <span>
                Vue complémentaire Jour / Semaine / Mois / Année et export PDF.
              </span>
            </div>
          </div>
          <InstitutionalPlanning structureId={structureId} />
        </section>
      </details>

      {eventForm && (
        <div
          className="modal"
          onMouseDown={(e) => e.target === e.currentTarget && setEventForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveEvent();
            }}
          >
            <div className="modalHead">
              <div>
                <small>CALENDRIER INSTITUTION</small>
                <h3>{eventForm.id ? "Modifier l’événement" : "Ajouter un événement"}</h3>
              </div>
              <button type="button" onClick={() => setEventForm(null)}>
                ×
              </button>
            </div>
            <div className="fields">
              <label>
                Date
                <input
                  type="date"
                  value={eventForm.event_date}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, event_date: e.target.value })
                  }
                />
              </label>
              <label>
                Rattaché à
                <select
                  value={eventForm.event_domain}
                  onChange={(e) => {
                    const domain = e.target.value as "training" | "player";
                    setEventForm({
                      ...eventForm,
                      event_domain: domain,
                      event_type: domain === "training" ? "formation" : "stage",
                      cohort_id:
                        domain === "training" ? eventForm.cohort_id : "",
                    });
                  }}
                >
                  <option value="training">Formation des cadres</option>
                  <option value="player">Formation du joueur</option>
                </select>
              </label>
              <label>
                Type
                <select
                  value={eventForm.event_type}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, event_type: e.target.value })
                  }
                >
                  {eventForm.event_domain === "training" ? (
                    <>
                      <option value="formation">Formation</option>
                      <option value="meeting">Réunion</option>
                      <option value="other">Autre</option>
                    </>
                  ) : (
                    <>
                      <option value="stage">Stage</option>
                      <option value="selection">Sélection</option>
                      <option value="detection">Détection</option>
                      <option value="meeting">Réunion</option>
                      <option value="other">Autre</option>
                    </>
                  )}
                </select>
              </label>
              <label>
                Début
                <input
                  type="time"
                  value={eventForm.start_time}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, start_time: e.target.value })
                  }
                />
              </label>
              <label>
                Fin
                <input
                  type="time"
                  value={eventForm.end_time}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, end_time: e.target.value })
                  }
                />
              </label>
              <label className="wide">
                Titre
                <input
                  autoFocus
                  value={eventForm.title}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, title: e.target.value })
                  }
                  placeholder="Ex. Réunion pédagogique"
                />
              </label>
              <label>
                Lieu{" "}
                <small style={{ fontWeight: 700, color: "#9a7d72" }}>
                  (facultatif)
                </small>
                <input
                  value={eventForm.location}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, location: e.target.value })
                  }
                />
              </label>
              <label>
                Intervenant
                <input
                  value={eventForm.intervenant}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, intervenant: e.target.value })
                  }
                />
              </label>
              {eventForm.event_domain === "training" && (
                <label className="wide">
                  Formation liée{" "}
                  <small style={{ fontWeight: 700, color: "#9a7d72" }}>
                    (facultatif)
                  </small>
                  <select
                    value={eventForm.cohort_id}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, cohort_id: e.target.value })
                    }
                  >
                    <option value="">Toutes / événement général cadres</option>
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.training_programs?.name
                          ? `${c.training_programs.name} ${normalizedCohortYear(c.name)}`
                          : c.planning_title || c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="wide">
                Description / informations
                <textarea
                  value={eventForm.description}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, description: e.target.value })
                  }
                  placeholder="Objectif, consignes, informations utiles…"
                />
              </label>
            </div>
            {!eventForm.location.trim() && (
              <div className="locationWarning">
                ⚠ Tu peux enregistrer sans lieu. Un point d’attention restera
                actif jusqu’à ce qu’un lieu soit renseigné.
              </div>
            )}
            <div className="modalActions">
              <button
                type="button"
                className="ghost"
                onClick={() => setEventForm(null)}
              >
                Annuler
              </button>
              <button type="submit" className="primary">
                💾 Enregistrer l’événement
              </button>
            </div>
          </form>
        </div>
      )}

      <style jsx>{`
        .hub{display:grid;gap:14px}.createEventBar{display:flex;align-items:center;justify-content:space-between;gap:14px;background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:12px 14px;box-shadow:0 8px 24px rgba(70,30,38,.05)}.createEventBar>div{display:grid;gap:2px}.createEventBar b{color:#4d1420;font-size:.9rem}.createEventBar span{color:#817379;font-size:.72rem}.createEventButton{font-size:.8rem;padding:11px 15px!important;white-space:nowrap}.eventSectionActions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}.hub>section,.general{background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:14px}.calHead,.sectionHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.calHead p,.sectionHead p{margin:0;color:#d4a24c;font-size:.66rem;font-weight:1000;letter-spacing:.12em}.calHead h3,.sectionHead h3{margin:3px 0;color:#4d1420}.calHead span,.sectionHead span{color:#817379;font-size:.76rem}.calActions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.ghost,.sectionHead button,.eventQuick button,.linked article>button{border:1px solid #d9c9c4;border-radius:9px;background:#fff;color:#6b1a2c;padding:8px 10px;font-weight:900;cursor:pointer}.primary{border:0!important;background:#6b1a2c!important;color:#fff!important;border-radius:9px;padding:9px 11px;font-weight:900;cursor:pointer}.legend{display:flex;gap:14px;flex-wrap:wrap;margin:12px 0 8px;font-size:.7rem;color:#74676b}.legend span{display:flex;align-items:center;gap:5px}.legend i{width:9px;height:9px;border-radius:50%}.calGrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:#e8dfda;border:1px solid #e8dfda;border-radius:11px;overflow:hidden}.dow{background:#f7f2ef;text-align:center;padding:8px;font-size:.67rem;font-weight:1000;color:#6b1a2c}.cell{background:#fff;min-height:118px;padding:7px;min-width:0;overflow:visible}.cell.muted{background:#faf8f7}.cell.today{box-shadow:inset 0 0 0 2px #d4a24c}.cellTop{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}.cellTop>b{font-size:.72rem;color:#55464b}.cellTop button{border:0;background:transparent;color:#a68b82;font-size:1rem;cursor:pointer;padding:0 3px}.trainingBands{display:grid;gap:3px;margin-bottom:3px}.trainingBand{height:21px;border:0;background:#D4A24C;color:#2B2119;margin-left:-8px;margin-right:-8px;width:calc(100% + 16px);border-radius:0;padding:3px 7px;text-align:left;cursor:pointer;overflow:hidden;position:relative;z-index:2}.trainingBand span{display:block;font-size:.62rem;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.trainingBand.bandStart{margin-left:0;width:calc(100% + 8px);border-radius:7px 0 0 7px}.trainingBand.bandEnd{margin-right:0;width:calc(100% + 8px);border-radius:0 7px 7px 0}.trainingBand.bandStart.bandEnd{width:100%;margin:0;border-radius:7px}.dayEvents{display:grid;gap:3px}.event{border:0;border-radius:6px;padding:4px 5px;display:grid;grid-template-columns:32px minmax(0,1fr);gap:3px;text-align:left;cursor:pointer;min-width:0}.event small{font-size:.57rem;font-weight:1000}.event span{font-size:.61rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pastToggle{font-size:.72rem;font-weight:800;color:#6b1a2c;display:flex;align-items:center;gap:6px}.eventList{display:grid;gap:8px;margin-top:12px}.eventList>article{border:1px solid #eadfd8;border-radius:12px;display:grid;grid-template-columns:1fr auto;align-items:center;overflow:hidden;background:#fff}.eventList>article.trainingRow{border-color:#e2c17d;background:#fffdf8}.eventList>article.selected{border-color:#d4a24c;box-shadow:0 0 0 2px rgba(212,162,76,.12)}.eventMain{border:0;background:transparent;text-align:left;display:grid;grid-template-columns:56px minmax(0,1fr) 62px;gap:10px;align-items:center;padding:10px;cursor:pointer}.dateBox{width:52px;height:52px;border-radius:11px;background:#f8f1e8;display:grid;place-items:center;align-content:center;color:#6b1a2c}.trainingDateBox{background:#f7e9c8;color:#5b4218}.dateBox b{font-size:1.2rem;line-height:1}.dateBox span{text-transform:uppercase;font-size:.58rem;font-weight:1000;margin-top:3px}.eventCopy small,.eventCopy strong,.eventCopy span{display:block}.eventCopy small{color:#9a7d72;font-size:.66rem;font-weight:800;text-transform:capitalize}.eventCopy strong{color:#42131e;font-size:.9rem;margin:2px 0}.eventCopy span{color:#75676b;font-size:.7rem}.ready{text-align:center}.ready b{display:block;color:#6b1a2c}.ready small{font-size:.6rem;color:#8a787e}.openFormation b{font-size:1.2rem}.eventQuick{display:flex;gap:5px;padding-right:10px}.eventQuick .danger{color:#a02e43}.prepSection{border-color:#dbc9a4!important;background:linear-gradient(180deg,#fff,#fffcf7)!important}.eventDocsBuilder{margin-top:14px;border-top:1px solid #eadfd8;padding-top:14px;display:grid;gap:12px}.prepGrid{display:grid;grid-template-columns:minmax(280px,.8fr) 1.4fr;gap:12px;margin-top:12px}.addResource,.checklist{border:1px solid #eadfd8;border-radius:13px;padding:12px;background:#fff}.addResource h4,.checklist h4{margin:0 0 10px;color:#4d1420}.resourceTypes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.resourceTypes button{display:flex;align-items:center;gap:6px;border:1px solid #e3d6d0;background:#fff;color:#5e4e53;border-radius:9px;padding:8px;text-align:left;font-weight:800;font-size:.7rem;cursor:pointer}.resourceTypes button.active{border-color:#6b1a2c;background:#fff5f7;color:#6b1a2c}.resourceTypes span{font-size:1rem}.addResource label{display:grid;gap:4px;margin-top:9px;font-size:.7rem;font-weight:900;color:#6b1a2c}.addResource input,.addResource textarea{border:1px solid #d9cbc5;border-radius:9px;padding:9px;font:inherit}.addResource textarea{min-height:86px;resize:vertical}.addActions{display:flex;gap:7px;justify-content:flex-end;margin-top:10px}.addActions button,.uploadBtn{border:0;border-radius:9px;background:#6b1a2c;color:#fff;padding:9px 10px;font-weight:900;font-size:.72rem;cursor:pointer}.uploadBtn{background:#fff;color:#6b1a2c;border:1px solid #d9c2c8}.checklist{display:grid;gap:7px;align-content:start}.checklist>article{display:grid;grid-template-columns:28px 36px minmax(0,1fr) auto 28px;gap:8px;align-items:center;border:1px solid #e9ded8;border-radius:10px;padding:8px}.checklist>article.done{background:#f4faf5;opacity:.78}.check{width:26px;height:26px;border:2px solid #cabcb6;background:#fff;border-radius:7px;color:#24653a;font-weight:1000;cursor:pointer}.done .check{background:#e3f4e7;border-color:#73a97f}.resIcon{width:34px;height:34px;border-radius:8px;background:#faf3ed;display:grid;place-items:center}.checklist b,.checklist small{display:block}.checklist b{font-size:.78rem;color:#4e2029}.checklist small{font-size:.65rem;color:#827378;margin-top:2px}.saved{font-size:.6rem;color:#44704f;font-weight:900}.open{border:0;background:#f5ecef;color:#6b1a2c;border-radius:7px;padding:6px 8px;font-size:.65rem;font-weight:900;cursor:pointer}.remove{border:0;background:transparent;color:#a43c4e;font-size:1.1rem;cursor:pointer}.linked{display:grid;gap:6px;margin-top:10px}.linked article{display:grid;grid-template-columns:210px minmax(0,1fr) auto;gap:10px;padding:9px;border:1px solid #eee3de;border-radius:10px;align-items:center}.linked time{font-weight:900;color:#6b1a2c}.linked b,.linked small{display:block}.linked small,.empty{color:#817379;font-size:.72rem}.advancedDetails{background:#fff;border:1px solid #eadfd8;border-radius:16px;overflow:hidden}.advancedDetails>summary{cursor:pointer;padding:13px 15px;color:#6b1a2c;font-weight:900;font-size:.78rem}.advancedDetails[open]>summary{border-bottom:1px solid #eadfd8}.advancedDetails .general{border:0;border-radius:0}.modal{position:fixed;inset:0;z-index:9999;background:rgba(27,13,17,.56);display:grid;place-items:center;padding:20px}.modal form{width:min(720px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;padding:16px;box-shadow:0 25px 80px rgba(0,0,0,.25)}.modalHead{display:flex;justify-content:space-between;align-items:flex-start}.modalHead small{color:#b37a20;font-weight:1000;letter-spacing:.1em}.modalHead h3{margin:3px 0;color:#4d1420}.modalHead>button{border:1px solid #ddcfca;background:#fff;color:#6b1a2c;border-radius:8px;width:34px;height:34px;font-size:1.2rem;cursor:pointer}.fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.fields label{display:grid;gap:4px;font-size:.72rem;font-weight:900;color:#6b1a2c}.fields .wide{grid-column:1/-1}.fields input,.fields select,.fields textarea{border:1px solid #d8c9c2;border-radius:9px;padding:9px 10px;font:inherit;background:#fff}.fields textarea{min-height:90px;resize:vertical}.locationWarning{margin-top:12px;border:1px solid #efb5bd;background:#fff4f6;color:#9d1e34;border-radius:9px;padding:9px 11px;font-size:.72rem;font-weight:800}.modalActions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.modalActions .ghost{padding:9px 11px}@media(max-width:900px){.prepGrid{grid-template-columns:1fr}.eventList>article{grid-template-columns:1fr}.eventQuick{padding:0 10px 10px;justify-content:flex-end}.linked article{grid-template-columns:1fr auto}.linked time{grid-column:1/-1}}@media(max-width:800px){.createEventBar{align-items:stretch;flex-direction:column}.createEventButton{width:100%}.eventSectionActions{justify-content:flex-start}.cell{min-height:92px;padding:4px}.trainingBand{margin-left:-5px;margin-right:-5px;width:calc(100% + 10px)}.trainingBand.bandStart,.trainingBand.bandEnd{width:calc(100% + 5px)}.event{grid-template-columns:1fr}.event small{display:none}.calHead,.sectionHead{flex-direction:column}.calActions{justify-content:flex-start}}@media(max-width:650px){.fields{grid-template-columns:1fr}.fields .wide{grid-column:auto}.eventMain{grid-template-columns:48px minmax(0,1fr)}.ready{display:none}.resourceTypes{grid-template-columns:1fr}.checklist>article{grid-template-columns:28px 34px minmax(0,1fr) 26px}.checklist .open,.checklist .saved{grid-column:3}.calGrid{overflow:auto;grid-template-columns:repeat(7,minmax(86px,1fr))}.calendarCard{overflow:hidden}.linked article{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
