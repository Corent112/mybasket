"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTeams } from "@/lib/equipes-store";

/* =====================================================================
 * MonCalendrier — transposition fidèle du calendrier de mybasket-app_24.html
 * (markup #accCalendrierSection, CSS .cal-grid/.cal-h/.cal-d/.ev,
 *  fonction renderCalendar, getEventColor, légende). Styles scopés .mb-cal.
 *
 * MODIF : l’« Équipe associée » et les événements proviennent désormais de Supabase.
 * ===================================================================== */

type EventType = "match" | "entrainement" | "tournoi" | "autre";
type Venue = "home" | "away" | "";

type Attachment = {
  name: string;
  type: string;
  dataUrl: string;
};

type CalEvent = {
  id: string;
  date: string;
  title: string;
  type: EventType;
  venue?: Venue;
  opponent?: string;
  time?: string;
  loc?: string;
  teamId?: string;
  teamName?: string;
  sessionId?: string;
  assignedPlayers?: string[];
  notes?: string;
  attachment?: Attachment;
};

type Player = {
  id: string;
  firstName: string;
  lastName?: string;
  position?: string;
  number?: string;
  avatarUrl?: string;
};

type Team = {
  id: string;
  name: string;
  logoUrl?: string;
  players: Player[];
};

type CalendarDbRow = Record<string, unknown>;

type SessionCalendarRow = {
  id: string;
  team_id?: string | null;
  team_reference_id?: string | null;
  team_name?: string | null;
  title?: string | null;
  pdf_url?: string | null;
};


const MONTHS = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE"];
const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

const uid = () => Math.random().toString(36).slice(2, 9);
const pad = (n: number) => String(n).padStart(2, "0");
const isPdf = (a: Attachment) => a.type === "application/pdf" || a.name.toLowerCase().endsWith(".pdf");
const isImage = (a: Attachment) => a.type.startsWith("image/");

// ── Équipes réelles depuis Supabase (mapping souple des champs) ──
function normalizeTeamForCalendar(team: any): Team {
  return {
    id: String(team.id ?? ""),
    name: String(team.nom || team.name || team.teamName || "Équipe"),
    logoUrl: String(
      team.logo ||
        team.logoUrl ||
        team.logo_url ||
        team.clubLogo ||
        team.clubLogoUrl ||
        team.club_logo_url ||
        "",
    ),
    players: (team.players || team.joueurs || team.effectif || team.roster || []).map((p: any) => ({
      id: String(p.id ?? p.playerId ?? uid()),
      firstName:
        p.prenom ||
        p.first_name ||
        p.firstName ||
        (p.name ? String(p.name).split(/\s+/)[0] : "") ||
        "Joueur",
      lastName: p.nom || p.last_name || p.lastName || "",
      position: p.position_primary || p.position || "",
      number: String(p.jersey_number || p.number || p.numero || p.num || ""),
      avatarUrl: String(p.avatar_url || p.photo_url || p.image_url || ""),
    })),
  };
}

function dbTypeToCalendarType(value: string | null | undefined): EventType {
  const type = String(value ?? "").toLowerCase();

  if (type === "game" || type === "match") return "match";
  if (type === "training" || type === "entrainement" || type === "entraînement") return "entrainement";
  if (type === "formation" || type === "tournoi") return "tournoi";

  return "autre";
}

function calendarTypeToDbType(value: EventType): string {
  if (value === "match") return "game";
  if (value === "entrainement") return "training";
  if (value === "tournoi") return "formation";

  return "other";
}

function normalizeCalendarRow(row: CalendarDbRow): CalEvent {
  const value = row as Record<string, any>;

  return {
    id: String(value.id ?? ""),
    date: String(value.event_date ?? ""),
    title: String(value.title ?? "Évènement"),
    type: dbTypeToCalendarType(value.event_type),
    time: value.start_time ? String(value.start_time).slice(0, 5) : undefined,
    loc: value.location ?? undefined,
    notes: value.description ?? undefined,
    teamId: value.team_id ? String(value.team_id) : undefined,
    teamName: value.team_name ? String(value.team_name) : undefined,
    sessionId: value.session_id ? String(value.session_id) : undefined,
    assignedPlayers: Array.isArray(value.assigned_player_ids)
      ? value.assigned_player_ids.map(String)
      : [],
    attachment: value.attachment_url
      ? {
          name: "Fiche séance",
          type: "application/pdf",
          dataUrl: String(value.attachment_url),
        }
      : undefined,
  };
}

// Schéma de couleurs identique au HTML de référence (getEventColor)
function getEventColor(ev: CalEvent): { bg: string; fg: string } {
  if (ev.type === "match") {
    if (ev.venue === "away") return { bg: "#E63946", fg: "#fff" };
    if (ev.venue === "home") return { bg: "#16A34A", fg: "#fff" };
    return { bg: "#6B7280", fg: "#fff" };
  }
  if (ev.type === "entrainement") return { bg: "#2563EB", fg: "#fff" };
  if (ev.type === "tournoi") return { bg: "#F59E0B", fg: "#fff" };
  return { bg: "#60A5FA", fg: "#fff" };
}
function venueLabel(ev: CalEvent): string {
  if (ev.type === "match") return ev.venue === "home" ? "🏠 " : ev.venue === "away" ? "🚌 " : "🏀 ";
  if (ev.type === "entrainement") return "🏋 ";
  if (ev.type === "tournoi") return "🏆 ";
  return "📌 ";
}

// Ouvre la pièce jointe dans une nouvelle fenêtre et lance l'impression
function printAttachment(att: Attachment) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { window.alert("Autorise les pop-ups pour imprimer la pièce jointe."); return; }
  const safeName = att.name.replace(/[<>&"]/g, "");
  let content: string;
  if (isImage(att)) {
    content = `<img src="${att.dataUrl}" style="max-width:100%;display:block;margin:0 auto" />`;
  } else if (isPdf(att)) {
    content = `<iframe src="${att.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`;
  } else {
    content = `<p style="font-family:sans-serif">Fichier : ${safeName}</p>` +
      `<a href="${att.dataUrl}" download="${safeName}">Télécharger le fichier</a>`;
  }
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${safeName}</title>` +
    `<style>html,body{margin:0;padding:0}</style></head>` +
    `<body onload="setTimeout(function(){try{window.focus();window.print();}catch(e){}},400)">${content}</body></html>`
  );
  win.document.close();
}

export default function MonCalendrier() {
  const supabase = createClient();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0..11
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Équipes réelles (« Mes équipes »)
  const [teams, setTeams] = useState<Team[]>([]);

  // Modale événement (créer / éditer)
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fDate, setFDate] = useState("");
  const [fTime, setFTime] = useState("");
  const [fType, setFType] = useState<EventType>("entrainement");
  const [fVenue, setFVenue] = useState<Venue>("home");
  const [fOpp, setFOpp] = useState("");
  const [fLoc, setFLoc] = useState("");
  const [fTeam, setFTeam] = useState<string>("");
  const [fPlayers, setFPlayers] = useState<string[]>([]);
  const [fNotes, setFNotes] = useState("");
  const [fAttach, setFAttach] = useState<Attachment | null>(null);

  // Modales de prévisualisation
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [sessionPreviewId, setSessionPreviewId] = useState<string | null>(null);

  const togglePlayer = (pid: string) =>
    setFPlayers((p) => (p.includes(pid) ? p.filter((x) => x !== pid) : [...p, pid]));
  const selectedTeam = teams.find((t) => t.id === fTeam) || null;

  // Upload → stocke name / type / dataUrl via FileReader
  const onAttach = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFAttach({ name: file.name, type: file.type, dataUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  };

  /* Chargement Supabase au montage */
  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    await Promise.all([loadTeams(), loadEvents()]);
  }

  async function loadTeams() {
    try {
      const loadedTeams = await getTeams();
      let normalizedTeams = (loadedTeams ?? [])
        .map(normalizeTeamForCalendar)
        .filter((team) => team.id);

      const teamIds = normalizedTeams.map((team) => team.id);
      if (teamIds.length > 0) {
        const { data: playerRows } = await supabase
          .from("players")
          .select("id, team_id, first_name, last_name, position_primary, jersey_number, avatar_url")
          .in("team_id", teamIds)
          .order("last_name", { ascending: true });

        const playersByTeam = new Map<string, Player[]>();
        for (const row of playerRows ?? []) {
          const teamKey = String(row.team_id || "");
          const player: Player = {
            id: String(row.id),
            firstName: String(row.first_name || "Joueur"),
            lastName: String(row.last_name || ""),
            position: String(row.position_primary || ""),
            number: String(row.jersey_number || ""),
            avatarUrl: String(row.avatar_url || ""),
          };
          playersByTeam.set(teamKey, [...(playersByTeam.get(teamKey) || []), player]);
        }

        normalizedTeams = normalizedTeams.map((team) => ({
          ...team,
          players: playersByTeam.get(team.id)?.length
            ? playersByTeam.get(team.id) || []
            : team.players,
        }));
      }

      setTeams(normalizedTeams);
    } catch (error) {
      console.error("Erreur chargement équipes calendrier:", error);
      setTeams([]);
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

    const normalizedEvents: CalEvent[] = ((data ?? []) as CalendarDbRow[]).map(
      (row) => normalizeCalendarRow(row),
    );

    const sessionIds: string[] = normalizedEvents
      .map((event: CalEvent) => event.sessionId)
      .filter((value: string | undefined): value is string => Boolean(value));

    if (sessionIds.length > 0) {
      const { data: sessionRows } = await supabase
        .from("practice_sessions")
        .select("id, team_id, team_reference_id, team_name, title, pdf_url")
        .in("id", sessionIds);

      const typedSessionRows = (sessionRows ?? []) as SessionCalendarRow[];
      const sessionsById = new Map<string, SessionCalendarRow>(
        typedSessionRows.map((row: SessionCalendarRow) => [
          String(row.id),
          row,
        ]),
      );

      for (const event of normalizedEvents) {
        if (!event.sessionId) continue;
        const relatedSession = sessionsById.get(event.sessionId);
        if (!relatedSession) continue;

        event.teamId = event.teamId || String(relatedSession.team_reference_id || relatedSession.team_id || "");
        event.teamName =
          event.teamName ||
          String(relatedSession.team_name || "") ||
          teams.find((team) => team.id === event.teamId)?.name ||
          String(relatedSession.title || "");

        if (!event.attachment && relatedSession.pdf_url) {
          event.attachment = {
            name: "Fiche séance",
            type: "application/pdf",
            dataUrl: String(relatedSession.pdf_url),
          };
        }
      }
    }

    setEvents(normalizedEvents);
    setLoading(false);
  }

  /* Navigation mois (identique calPrev/calNext) */
  const prev = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  /* Calcul grille (identique renderCalendar) */
  const startDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const dim = new Date(year, month + 1, 0).getDate();
  const title = `${MONTHS[month]} ${year}`;

  /* Modale événement */
  const openCreate = (ds: string) => {
    setEditingId(null);
    setFTitle(""); setFDate(ds); setFTime(""); setFType("entrainement");
    setFVenue("home"); setFOpp(""); setFLoc("");
    setFTeam(""); setFPlayers([]); setFNotes(""); setFAttach(null);
    setOpen(true);
  };
  const openEdit = (id: string) => {
    const e = events.find((x) => x.id === id); if (!e) return;
    setEditingId(id);
    setFTitle(e.title); setFDate(e.date); setFTime(e.time || ""); setFType(e.type);
    setFVenue(e.venue || "home"); setFOpp(e.opponent || ""); setFLoc(e.loc || "");
    setFTeam(e.teamId || ""); setFPlayers(e.assignedPlayers || []);
    setFNotes(e.notes || ""); setFAttach(e.attachment || null);
    setOpen(true);
  };
  const saveEvent = async () => {
    if (!fDate) return; // seule la date est requise (le titre est optionnel)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      window.alert("Connecte-toi pour enregistrer un événement.");
      return;
    }

    const payload = {
      user_id: user.id,
      owner_id: user.id,
      title: fTitle.trim() || "Entraînement",
      description: fNotes || null,
      event_date: fDate,
      start_time: fTime || null,
      end_time: null,
      location: fLoc || null,
      event_type: calendarTypeToDbType(fType),
      session_id:
        events.find((event) => event.id === editingId)?.sessionId || null,
      team_id:
        fTeam ||
        events.find((event) => event.id === editingId)?.teamId ||
        null,
      team_name:
        selectedTeam?.name ||
        events.find((event) => event.id === editingId)?.teamName ||
        null,
      assigned_player_ids: fPlayers,
      attachment_url: fAttach?.dataUrl || null,
      visibility: "private",
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { error } = await supabase
        .from("calendar_events")
        .update(payload)
        .eq("id", editingId)
        .or(`user_id.eq.${user.id},owner_id.eq.${user.id}`);

      if (error) {
        console.error("Erreur modification événement:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        window.alert(`Impossible de modifier l'événement : ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("calendar_events").insert(payload);

      if (error) {
        console.error("Erreur création événement:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        window.alert(`Impossible de créer l'événement : ${error.message}`);
        return;
      }
    }

    await loadEvents();
    setOpen(false);
  };

  const deleteEvent = async () => {
    if (!editingId) return;
    if (!window.confirm("Supprimer cet événement ?")) return;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      window.alert("Connecte-toi pour supprimer un événement.");
      return;
    }

    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", editingId)
      .or(`user_id.eq.${user.id},owner_id.eq.${user.id}`);

    if (error) {
      console.error("Erreur suppression événement:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      window.alert(`Impossible de supprimer l'événement : ${error.message}`);
      return;
    }

    await loadEvents();
    setOpen(false);
  };

  if (loading) {
    return (
      <div className="mb-cal">
        <div className="cal-head">
          <h2 className="cal-title">{title}</h2>
        </div>
        <p style={{ color: "#6B6B6B", fontWeight: 700 }}>Chargement du calendrier...</p>
        {sessionPreviewId && (
        <div
          className="cal-overlay cal-session-overlay"
          onClick={() => setSessionPreviewId(null)}
        >
          <div
            className="cal-session-preview"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cal-modal-head">
              <div>
                <span>FICHE SÉANCE</span>
                <b>
                  {events.find((event) => event.sessionId === sessionPreviewId)
                    ?.title || "Séance"}
                </b>
              </div>
              <button
                className="cal-x"
                onClick={() => setSessionPreviewId(null)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <iframe
              src={`/seances/${sessionPreviewId}?embed=1`}
              title="Aperçu de la fiche séance"
            />
          </div>
        </div>
      )}

      <style jsx>{`
          .mb-cal{
            --bordeaux:#6B1A2C; --or:#D4A24C; --or-l:#E8C078;
            --noir:#0F0F12; --blanc:#FFFFFF;
            --gris-bg:#F5F5F5; --gris-med:#C8C8C8; --gris-text:#6B6B6B; --rouge:#E63946;
            --varsity:'Alfa Slab One',serif;
            color:var(--noir);
          }
          .cal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.85rem;flex-wrap:wrap;gap:.5rem}
          .cal-title{font-family:var(--varsity);letter-spacing:.05em;margin:0}
        `}</style>
      </div>
    );
  }

  return (
    <div className="mb-cal">
      {/* En-tête : titre + navigation + ajout (markup d'origine) */}
      <div className="cal-head">
        <h2 className="cal-title">{title}</h2>
        <div className="cal-actions">
          <button className="btn btn-outline btn-small" onClick={prev}>‹</button>
          <button className="btn btn-outline btn-small" onClick={next}>›</button>
          <button className="btn btn-black btn-small" onClick={() => openCreate(`${year}-${pad(month + 1)}-${pad(today.getDate())}`)}>+ Événement</button>
        </div>
      </div>

      {/* Grille calendrier */}
      <div className="cal-grid">
        {DAYS.map((d, i) => <div key={"h" + i} className="cal-h">{d}</div>)}
        {Array.from({ length: startDay }).map((_, i) => <div key={"e" + i} className="cal-d empty" />)}
        {Array.from({ length: dim }).map((_, i) => {
          const d = i + 1;
          const ds = `${year}-${pad(month + 1)}-${pad(d)}`;
          const evs = events.filter((e) => e.date === ds);
          const isT = year === today.getFullYear() && month === today.getMonth() && d === today.getDate();
          return (
            <div key={"d" + d} className={"cal-d" + (isT ? " today" : "")} onClick={() => openCreate(ds)}>
              <div className="dn">{d}</div>
              {evs.map((e) => {
                const col = getEventColor(e);
                const tip = `${e.title}${e.opponent ? " vs " + e.opponent : ""}${e.time ? " · " + e.time : ""}${e.venue === "home" ? " · 🏠 Domicile" : e.venue === "away" ? " · 🚌 Extérieur" : ""}${e.loc ? " · " + e.loc : ""}`;
                return (
                  <div
                    key={e.id}
                    className="ev"
                    style={{ background: col.bg, color: col.fg }}
                    title={tip}
                    onClick={(ev) => { ev.stopPropagation(); openEdit(e.id); }}
                  >
                    {venueLabel(e)}{e.title}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Légende (markup d'origine) */}
      <div className="cal-legend">
        <span className="leg-title">Légende :</span>
        <span className="leg-item"><span className="leg-sw" style={{ background: "#16A34A" }} />🏠 Match domicile</span>
        <span className="leg-item"><span className="leg-sw" style={{ background: "#E63946" }} />🚌 Match extérieur</span>
        <span className="leg-item"><span className="leg-sw" style={{ background: "#2563EB" }} />🏋 Entraînement</span>
        <span className="leg-item"><span className="leg-sw" style={{ background: "#F59E0B" }} />🏆 Tournoi</span>
        <span className="leg-item"><span className="leg-sw" style={{ background: "#60A5FA" }} />📌 Autre</span>
      </div>

      {/* Modale créer / éditer (enrichie) */}
      {open && (
        <div className="cal-overlay" onClick={() => setOpen(false)}>
          <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cal-modal-head">
              <b>{editingId ? "Modifier l'événement" : "Nouvel événement"}</b>
              <button className="cal-x" onClick={() => setOpen(false)} aria-label="Fermer">✕</button>
            </div>

            <div className="cal-body">
              <div className="cal-row2">
                <div className="cal-fld">
                  <label>Date <span className="req">*</span></label>
                  <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
                </div>
                <div className="cal-fld">
                  <label>Heure</label>
                  <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} />
                </div>
              </div>

              <div className="cal-fld">
                <label>Type</label>
                <select value={fType} onChange={(e) => setFType(e.target.value as EventType)}>
                  <option value="match">Match</option>
                  <option value="entrainement">Entraînement</option>
                  <option value="tournoi">Tournoi</option>
                  <option value="autre">Autre</option>
                </select>
              </div>

              <div className="cal-fld">
                <label>Équipe associée</label>
                <select value={fTeam} onChange={(e) => { setFTeam(e.target.value); setFPlayers([]); }}>
                  <option value="">Aucune</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {teams.length === 0 ? (
                  <p className="cal-help">Aucune équipe trouvée — crée d'abord une équipe dans « Mes équipes ».</p>
                ) : (
                  <p className="cal-help">
                    {"Pour les entraînements, ça permet de gérer la présence et l'historique dans la gestion d'équipe."}
                  </p>
                )}
              </div>

              <div className="cal-fld">
                <label>Titre (optionnel)</label>
                <input type="text" value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="Entraînement" />
              </div>

              <div className="cal-fld">
                <label>Adversaire</label>
                <input type="text" value={fOpp} onChange={(e) => setFOpp(e.target.value)} placeholder="Ex : Massy" />
              </div>

              <div className="cal-fld">
                <label>Lieu (salle / gymnase)</label>
                <input type="text" value={fLoc} onChange={(e) => setFLoc(e.target.value)} placeholder="Ex : Gymnase municipal" />
              </div>

              <div className="cal-fld">
                <label>Joueurs assignés</label>
                {selectedTeam ? (
                  selectedTeam.players.length ? (
                    <div className="cal-players">
                      {selectedTeam.players.map((player) => (
                        <button
                          type="button"
                          key={player.id}
                          className={
                            "cal-player-card" +
                            (fPlayers.includes(player.id) ? " on" : "")
                          }
                          onClick={() => togglePlayer(player.id)}
                        >
                          <span className="cal-player-avatar">
                            {player.avatarUrl ? (
                              <img
                                src={player.avatarUrl}
                                alt={`${player.firstName} ${player.lastName || ""}`}
                              />
                            ) : (
                              <b>{player.firstName.slice(0, 1).toUpperCase()}</b>
                            )}
                          </span>
                          <span className="cal-player-info">
                            <strong>
                              {player.firstName} {player.lastName || ""}
                            </strong>
                            <small>
                              {player.position || "Poste non défini"}
                              {player.number ? ` · #${player.number}` : ""}
                            </small>
                          </span>
                          <span className="cal-player-check">
                            {fPlayers.includes(player.id) ? "✓" : "+"}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="cal-pempty">Cette équipe n'a pas encore de joueurs.</span>
                  )
                ) : (
                  <span className="cal-pempty">Sélectionne une équipe pour assigner des joueurs.</span>
                )}
              </div>

              <div className="cal-fld">
                <label>Notes</label>
                <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Infos complémentaires…" />
              </div>
              <div className="cal-fld">
                <label>Pièce jointe (PDF, image, doc…)</label>
                <div className="cal-attach">
                  <label className="cal-attach-btn">
                    📎 Ajouter une pièce jointe
                    <input type="file" accept=".pdf,image/*,.doc,.docx,.txt" hidden
                      onChange={(e) => onAttach(e.target.files?.[0])} />
                  </label>
                  {fAttach && (
                    <span className="cal-attach-name">
                      <span className="cal-attach-fn" title={fAttach.name}>{fAttach.name}</span>
                      <button type="button" className="cal-attach-act" onClick={() => {
                          const linkedSessionId = events.find(
                            (event) => event.id === editingId,
                          )?.sessionId;
                          if (linkedSessionId) {
                            setSessionPreviewId(linkedSessionId);
                          } else {
                            setPreview(fAttach);
                          }
                        }}>Consulter</button>
                      <button type="button" className="cal-attach-rm" onClick={() => setFAttach(null)} aria-label="Retirer">Retirer ✕</button>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="cal-modal-actions">
              {editingId && <button type="button" className="cal-del" onClick={deleteEvent}>Supprimer</button>}
              <span className="spacer" />
              <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Annuler</button>
              <button type="button" className="btn btn-black" onClick={saveEvent}>💾 Sauvegarder</button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de prévisualisation de la pièce jointe */}
      {preview && (
        <div className="cal-overlay cal-overlay-top" onClick={() => setPreview(null)}>
          <div className="cal-preview" onClick={(e) => e.stopPropagation()}>
            <div className="cal-modal-head">
              <b>{preview.name}</b>
              <button className="cal-x" onClick={() => setPreview(null)} aria-label="Fermer">✕</button>
            </div>
            <div className="cal-preview-body">
              {isImage(preview) ? (
                <img src={preview.dataUrl} alt={preview.name} />
              ) : isPdf(preview) ? (
                <iframe src={preview.dataUrl} title={preview.name} />
              ) : (
                <div className="cal-preview-other">
                  <p>Aperçu non disponible pour ce type de fichier.</p>
                  <a className="btn btn-outline btn-small" href={preview.dataUrl} download={preview.name}>Ouvrir le fichier</a>
                </div>
              )}
            </div>
            <div className="cal-modal-actions">
              <span className="spacer" />
              <button type="button" className="btn btn-outline" onClick={() => setPreview(null)}>Fermer</button>
              <button type="button" className="btn btn-black" onClick={() => printAttachment(preview)}>🖨 Imprimer</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .mb-cal{
          --bordeaux:#6B1A2C; --or:#D4A24C; --or-l:#E8C078;
          --noir:#0F0F12; --blanc:#FFFFFF;
          --gris-bg:#F5F5F5; --gris-med:#C8C8C8; --gris-text:#6B6B6B; --rouge:#E63946;
          --varsity:'Alfa Slab One',serif;
          color:var(--noir);
        }
        /* En-tête (reprend les styles inline du HTML) */
        .cal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.85rem;flex-wrap:wrap;gap:.5rem}
        .cal-title{font-family:var(--varsity);letter-spacing:.05em;margin:0}
        .cal-actions{display:flex;gap:.4rem}

        /* Boutons (repris à l'identique de la référence) */
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;padding:.6rem 1.25rem;border-radius:999px;font-weight:500;font-size:.92rem;transition:.15s;cursor:pointer;border:none;background:none;color:inherit;font-family:inherit}
        .btn-small{padding:.35rem .85rem;font-size:.82rem}
        .btn-black{background:var(--noir);color:var(--blanc)}
        .btn-black:hover{background:var(--bordeaux);transform:translateY(-1px)}
        .btn-outline{background:transparent;border:1.5px solid var(--noir);color:var(--noir)}
        .btn-outline:hover{background:var(--noir);color:var(--blanc)}
        .btn-red{background:var(--rouge);color:var(--blanc)}
        .btn-red:hover{background:#B91C2C}

        /* Grille calendrier — valeurs EXACTES du HTML de référence */
        .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--gris-med);border:1px solid var(--gris-med);border-radius:6px;overflow:hidden}
        .cal-h{background:var(--noir);color:var(--blanc);padding:.45rem;text-align:center;font-weight:700;font-size:.8rem}
        .cal-d{background:var(--blanc);min-height:72px;padding:.35rem;cursor:pointer;font-size:.82rem;position:relative}
        .cal-d:hover{background:var(--gris-bg)}
        .cal-d.empty{background:var(--gris-bg);cursor:default;opacity:.5}
        .cal-d.today{background:rgba(212,162,76,.15)}
        .cal-d .dn{font-weight:700}
        .cal-d .ev{font-size:.68rem;font-weight:600;padding:1px 4px;border-radius:3px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}

        /* Légende (styles inline d'origine) */
        .cal-legend{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.85rem;padding:.6rem .85rem;background:#FAF7F0;border-radius:6px;font-size:.72rem;align-items:center}
        .leg-title{font-weight:600;color:var(--bordeaux)}
        .leg-item{display:inline-flex;align-items:center;gap:.25rem}
        .leg-sw{width:14px;height:14px;border-radius:3px;display:inline-block}

        /* Modale enrichie */
        .cal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:1rem}
        .cal-overlay-top{z-index:1100;background:rgba(0,0,0,.65)}
        .cal-modal{width:520px;max-width:96vw;max-height:90vh;overflow-y:auto;background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.4)}
        .cal-modal-head{display:flex;align-items:center;justify-content:space-between;padding:1.1rem 1.4rem;border-bottom:1px solid var(--gris-med)}
        .cal-modal-head b{font-family:var(--varsity);font-size:1.25rem;letter-spacing:.03em;color:var(--noir)}
        .cal-x{cursor:pointer;color:var(--gris-text);font-size:1.2rem;line-height:1;border:none;background:none;padding:.2rem}
        .cal-x:hover{color:var(--noir)}

        .cal-body{padding:1rem 1.4rem;display:flex;flex-direction:column;gap:.9rem}
        .cal-fld{display:flex;flex-direction:column;gap:.35rem}
        .cal-fld label{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--gris-text)}
        .cal-fld .req{color:var(--rouge)}
        .cal-fld input,.cal-fld select,.cal-fld textarea{padding:.6rem .8rem;border:1px solid var(--gris-med);border-radius:10px;font-size:.9rem;font-family:inherit;background:var(--gris-bg);color:var(--noir);transition:.15s}
        .cal-fld input:focus,.cal-fld select:focus,.cal-fld textarea:focus{outline:none;border-color:var(--or);background:#fff;box-shadow:0 0 0 3px rgba(212,162,76,.18)}
        .cal-fld textarea{resize:vertical;min-height:72px}
        .cal-row2{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
        .cal-help{font-size:.74rem;color:var(--gris-text);line-height:1.4;margin:.1rem 0 0}

        .cal-players{display:flex;flex-wrap:wrap;gap:.4rem}
        .cal-pchip{display:inline-flex;align-items:center;gap:.2rem;padding:.4rem .75rem;border:1.5px solid var(--gris-med);border-radius:999px;font-size:.8rem;font-weight:600;cursor:pointer;background:#fff;color:var(--noir);transition:.13s}
        .cal-pchip:hover{border-color:var(--noir)}
        .cal-pchip.on{background:var(--bordeaux);border-color:var(--bordeaux);color:#fff}
        .cal-pempty{font-size:.78rem;color:var(--gris-text)}

        .cal-attach{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
        .cal-attach-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem .9rem;border:1.5px dashed var(--gris-med);border-radius:10px;font-size:.82rem;font-weight:600;cursor:pointer;color:var(--noir);background:#fff;transition:.13s}
        .cal-attach-btn:hover{border-color:var(--or)}
        .cal-attach-name{display:inline-flex;align-items:center;gap:.5rem;font-size:.8rem;color:var(--noir);background:var(--gris-bg);padding:.4rem .6rem;border-radius:8px;max-width:100%}
        .cal-attach-fn{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cal-attach-act{border:1.5px solid var(--noir);background:#fff;color:var(--noir);border-radius:999px;padding:.25rem .7rem;font-size:.74rem;font-weight:700;cursor:pointer;transition:.13s}
        .cal-attach-act:hover{background:var(--noir);color:#fff}
        .cal-attach-rm{border:none;background:none;color:var(--rouge);font-size:.74rem;font-weight:700;cursor:pointer;white-space:nowrap}
        .cal-attach-rm:hover{text-decoration:underline}

        .cal-modal-actions{display:flex;align-items:center;gap:.6rem;padding:1rem 1.4rem 1.4rem}
        .cal-modal-actions .spacer{flex:1}
        .cal-del{border:none;background:none;color:var(--rouge);font-weight:600;font-size:.82rem;cursor:pointer;padding:.3rem .2rem}
        .cal-del:hover{text-decoration:underline}

        /* Modale de prévisualisation */
        .cal-preview{width:760px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.45);overflow:hidden}
        .cal-preview-body{flex:1;min-height:0;overflow:auto;background:#f2f2f2;display:flex;align-items:center;justify-content:center;padding:1rem}
        .cal-preview-body img{max-width:100%;max-height:74vh;object-fit:contain;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.2)}
        .cal-preview-body iframe{width:100%;height:74vh;border:0;background:#fff;border-radius:6px}
        .cal-preview-other{display:flex;flex-direction:column;align-items:center;gap:.85rem;color:var(--gris-text);font-size:.9rem;text-align:center}

        .cal-session-card{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem;border:1px solid #ead9cb;border-radius:16px;background:linear-gradient(135deg,#fff8ef,#fff)}
        .cal-session-card span{display:block;color:var(--or);font-size:.68rem;font-weight:950;letter-spacing:.12em}
        .cal-session-card strong,.cal-session-card small{display:block}
        .cal-session-card strong{margin-top:.25rem;color:var(--bordeaux);font-size:1rem}
        .cal-session-card small{margin-top:.2rem;color:var(--gris-text);font-size:.78rem}
        .cal-session-card button{border:0;border-radius:999px;padding:.7rem 1rem;background:var(--bordeaux);color:#fff;font-weight:900;cursor:pointer}
        .cal-players{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem!important}
        .cal-player-card{display:grid;grid-template-columns:40px 1fr 28px;align-items:center;gap:.65rem;width:100%;padding:.65rem;border:1px solid #e8ded8;border-radius:14px;background:#fff;text-align:left;cursor:pointer;transition:.18s ease}
        .cal-player-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(107,26,44,.09)}
        .cal-player-card.on{border-color:var(--or);background:#fff8e9;box-shadow:0 0 0 2px rgba(212,162,76,.13)}
        .cal-player-avatar{width:40px;height:40px;border-radius:12px;overflow:hidden;display:grid;place-items:center;background:var(--noir);color:var(--or)}
        .cal-player-avatar img{width:100%;height:100%;object-fit:cover}
        .cal-player-info strong,.cal-player-info small{display:block}
        .cal-player-info strong{font-size:.84rem;color:var(--noir)}
        .cal-player-info small{margin-top:.15rem;color:var(--gris-text);font-size:.7rem}
        .cal-player-check{width:26px;height:26px;border-radius:9px;display:grid;place-items:center;background:#f2ece8;color:var(--bordeaux);font-weight:950}
        .cal-player-card.on .cal-player-check{background:var(--bordeaux);color:#fff}
        .cal-session-overlay{z-index:10000}
        .cal-session-preview{width:min(1180px,calc(100vw - 36px));height:min(860px,calc(100vh - 36px));display:flex;flex-direction:column;overflow:hidden;border-radius:22px;background:#fff;box-shadow:0 30px 90px rgba(0,0,0,.35)}
        .cal-session-preview .cal-modal-head span{display:block;color:var(--or);font-size:.68rem;font-weight:950;letter-spacing:.12em}
        .cal-session-preview iframe{width:100%;flex:1;border:0;background:#eef1f5}

        @media (max-width:600px){
          .cal-d{min-height:60px;padding:.25rem}
          .cal-d .ev{font-size:.6rem}
          .cal-h{font-size:.72rem;padding:.35rem}
          .cal-row2{grid-template-columns:1fr}
          .cal-preview-body iframe{height:60vh}
        }
      `}</style>
    </div>
  );
}