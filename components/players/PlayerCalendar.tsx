"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CalendarRow = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: string | null;
  assigned_player_ids: string[] | null;
  participant_statuses: Record<string, string> | null;
};

type EventKind = "health" | "school" | "training" | "other";
type CalendarView = "day" | "week" | "month";

const COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  health: { bg: "#FDE8EC", fg: "#9B1C31", label: "Santé" },
  school: { bg: "#EEE7FA", fg: "#6741A5", label: "Scolaire" },
  training: { bg: "#FFF0D7", fg: "#9A5C00", label: "Entraînement" },
  game: { bg: "#E6F6E9", fg: "#26733B", label: "Match" },
  other: { bg: "#E7F0FC", fg: "#245B9B", label: "Autre" },
};

function eventKind(row: CalendarRow) {
  const raw = String(row.event_type || "").toLowerCase();
  if (["game", "match"].includes(raw)) return "game";
  if (["training", "entrainement", "entraînement"].includes(raw)) return "training";
  if (["health", "medical", "sante", "santé"].includes(raw)) return "health";
  if (["school", "scolaire", "cours"].includes(raw)) return "school";
  return "other";
}

function mondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function PlayerCalendar({
  teamId,
  playerId,
  playerName,
  guardianEmails = [],
  school,
}: {
  teamId: string;
  playerId: string;
  playerName: string;
  guardianEmails?: string[];
  school?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [cursor, setCursor] = useState(() => mondayOf(new Date()));
  const [events, setEvents] = useState<CalendarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EventKind>("health");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(iso(new Date()));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [notifyPlayer, setNotifyPlayer] = useState(true);
  const [notifyParents, setNotifyParents] = useState(false);
  const [notifySchool, setNotifySchool] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<CalendarView>("week");

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() + i);
    return d;
  }), [cursor]);

  const range = useMemo(() => {
    if (view === "day") return { start: iso(cursor), end: iso(cursor) };
    if (view === "month") {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
      return { start: iso(first), end: iso(last) };
    }
    return { start: iso(week[0]), end: iso(week[6]) };
  }, [view, cursor, week]);

  async function reload() {
    setLoading(true);
    const start = range.start;
    const end = range.end;
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id,title,description,event_date,start_time,end_time,location,event_type,assigned_player_ids,participant_statuses")
      .eq("team_id", teamId)
      .gte("event_date", start)
      .lte("event_date", end)
      .order("event_date")
      .order("start_time");

    if (error) console.error("Calendrier joueur :", error);
    const rows = ((data || []) as CalendarRow[]).filter((row) => {
      const assigned = Array.isArray(row.assigned_player_ids) ? row.assigned_player_ids.map(String) : [];
      return assigned.length === 0 || assigned.includes(String(playerId));
    });
    setEvents(rows);
    setLoading(false);
  }

  useEffect(() => { void reload(); }, [teamId, playerId, cursor, view]); // eslint-disable-line react-hooks/exhaustive-deps

  function movePeriod(delta: number) {
    setCursor((current) => {
      const next = new Date(current);
      if (view === "month") next.setMonth(next.getMonth() + delta);
      else next.setDate(next.getDate() + delta * (view === "week" ? 7 : 1));
      return view === "week" ? mondayOf(next) : next;
    });
  }

  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const startOffset = (first.getDay() + 6) % 7;
    const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return { startOffset, total };
  }, [cursor]);

  async function saveEvent() {
    if (!date || !title.trim()) return alert("Ajoute au minimum un titre et une date.");
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert("Session utilisateur indisponible.");

      const recipients = [
        notifyPlayer ? `Joueur: ${playerName}` : "",
        notifyParents && guardianEmails.length ? `Parent(s): ${guardianEmails.join(", ")}` : "",
        notifySchool && school ? `École: ${school}` : "",
      ].filter(Boolean);

      const description = [
        notes.trim(),
        recipients.length ? `À prévenir: ${recipients.join(" · ")}` : "",
      ].filter(Boolean).join("\n");

      const { error } = await supabase.from("calendar_events").insert({
        user_id: user.id,
        owner_id: user.id,
        team_id: teamId,
        title: title.trim(),
        description: description || null,
        event_date: date,
        start_time: startTime || null,
        end_time: endTime || null,
        location: location.trim() || null,
        event_type: kind,
        assigned_player_ids: [playerId],
        visibility: "private",
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;

      setOpen(false);
      setTitle(""); setStartTime(""); setEndTime(""); setLocation(""); setNotes("");
      setNotifyPlayer(true); setNotifyParents(false); setNotifySchool(false);
      await reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'ajouter le rendez-vous.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="pc">
      <div className="head">
        <div><small>EMPLOI DU TEMPS</small><h2>Calendrier de {playerName}</h2><p>Cours, entraînements, matchs et rendez-vous individuels.</p></div>
        <button className="add" onClick={() => setOpen(true)}>+ Ajouter un rendez-vous</button>
      </div>

      <div className="toolbar">
        <button className="today" onClick={() => setCursor(view === "week" ? mondayOf(new Date()) : new Date())}>Aujourd'hui</button>
        <div className="nav">
          <button onClick={() => movePeriod(-1)}>‹</button>
          <strong>{view === "month"
            ? cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
            : view === "day"
              ? cursor.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
              : `${week[0].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — ${week[6].toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`}
          </strong>
          <button onClick={() => movePeriod(1)}>›</button>
        </div>
        <div className="viewSwitch">
          {(["day","week","month"] as CalendarView[]).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item === "day" ? "Jour" : item === "week" ? "Semaine" : "Mois"}</button>)}
        </div>
      </div>

      {view === "week" && <div className="week">
        {week.map((day) => {
          const dayIso = iso(day);
          const dayEvents = events.filter((event) => event.event_date === dayIso);
          return <div className="day" key={dayIso}>
            <div className="dayHead"><b>{day.toLocaleDateString("fr-FR", { weekday: "short" })}</b><span>{day.getDate()}</span></div>
            <div className="dayBody">{dayEvents.map((event) => {
              const meta = COLORS[eventKind(event)] || COLORS.other;
              const status = event.participant_statuses?.[String(playerId)]; return <article key={event.id} style={{ background: meta.bg, color: meta.fg }}><small>{event.start_time?.slice(0,5) || "Journée"} · {meta.label}</small><strong>{event.title}</strong>{status && <em className={`status ${status}`}>{status === "present" ? "Présent" : status === "absent" ? "Absent" : status === "uncertain" ? "Incertain" : "Convoqué"}</em>}{event.location && <span>{event.location}</span>}</article>;
            })}{!loading && !dayEvents.length && <span className="empty">—</span>}</div>
          </div>;
        })}
      </div>}

      {view === "day" && <div className="dayView">
        {events.length ? events.map((event) => {
          const meta = COLORS[eventKind(event)] || COLORS.other;
          const status = event.participant_statuses?.[String(playerId)]; return <article key={event.id} className="timelineEvent"><time>{event.start_time?.slice(0,5) || "Journée"}</time><div style={{ background: meta.bg, color: meta.fg }}><small>{meta.label}</small><strong>{event.title}</strong>{status && <em className={`status ${status}`}>{status === "present" ? "Présent" : status === "absent" ? "Absent" : status === "uncertain" ? "Incertain" : "Convoqué"}</em>}{event.end_time && <span>jusqu'à {event.end_time.slice(0,5)}</span>}{event.location && <span>{event.location}</span>}</div></article>;
        }) : !loading && <div className="noEvent">Aucun événement ce jour.</div>}
      </div>}

      {view === "month" && <div className="month">
        {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map((d) => <div className="monthHead" key={d}>{d}</div>)}
        {Array.from({length:monthDays.startOffset}).map((_,i)=><div className="monthCell muted" key={`empty-${i}`} />)}
        {Array.from({length:monthDays.total}).map((_,i)=>{
          const day=i+1; const d=new Date(cursor.getFullYear(),cursor.getMonth(),day,12); const ds=iso(d);
          const dayEvents=events.filter((event)=>event.event_date===ds);
          return <button className="monthCell" key={ds} onClick={()=>{setCursor(d);setView("day")}}><b>{day}</b>{dayEvents.slice(0,3).map((event)=>{const meta=COLORS[eventKind(event)]||COLORS.other;return <span key={event.id} style={{background:meta.bg,color:meta.fg}}>{event.start_time?.slice(0,5)} {event.title}</span>})}{dayEvents.length>3&&<small>+{dayEvents.length-3}</small>}</button>
        })}
      </div>}

      <div className="legend">
        {Object.entries(COLORS).map(([key, value]) => <span key={key}><i style={{ background: value.bg, borderColor: value.fg }} />{value.label}</span>)}
      </div>

      {open && <div className="overlay" onClick={() => setOpen(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modalHead"><div><small>NOUVEL ÉVÉNEMENT</small><h3>Ajouter au calendrier</h3></div><button onClick={() => setOpen(false)}>×</button></div>
          <div className="kinds">
            {(["health","school","training","other"] as EventKind[]).map((value) => <button key={value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}>{COLORS[value].label}</button>)}
          </div>
          <label>Titre<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "health" ? "Kiné, médecin, nutritionniste…" : kind === "school" ? "Cours, rendez-vous scolaire…" : "Titre de l'événement"} /></label>
          <div className="two"><label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label>Lieu<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lieu" /></label></div>
          <div className="two"><label>Début<input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label><label>Fin<input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label></div>
          <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <div className="notify"><b>Personnes à prévenir</b><label><input type="checkbox" checked={notifyPlayer} onChange={(e) => setNotifyPlayer(e.target.checked)} /> Joueur · {playerName}</label>
            {guardianEmails.length > 0 && <label><input type="checkbox" checked={notifyParents} onChange={(e) => setNotifyParents(e.target.checked)} /> Parent(s) · {guardianEmails.join(" · ")}</label>}
            {school && <label><input type="checkbox" checked={notifySchool} onChange={(e) => setNotifySchool(e.target.checked)} /> École · {school}</label>}
            <small>Les destinataires choisis sont enregistrés avec le rendez-vous. L'envoi automatique sera branché sur le canal de notification MyBasket.</small>
          </div>
          <button className="save" disabled={saving} onClick={saveEvent}>{saving ? "Enregistrement…" : "Ajouter le rendez-vous"}</button>
        </div>
      </div>}

      <style jsx>{`
        .pc{display:grid;gap:12px}.head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start}.head small,.modalHead small{color:#d4a24c;font-weight:1000;letter-spacing:.12em}.head h2{margin:3px 0;color:#6b1a2c}.head p{margin:0;color:#7c716b;font-size:.78rem}.add,.save{border:0;background:#6b1a2c;color:#fff;border-radius:10px;padding:10px 13px;font-weight:900}
        .toolbar{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center}.nav{display:flex;align-items:center;gap:7px;border:1px solid #eadfd8;background:#fffaf6;border-radius:12px;padding:8px}.nav button,.today{border:1px solid #e1d6cf;background:#fff;border-radius:8px;padding:8px 10px;color:#6b1a2c;font-weight:900}.nav strong{flex:1;text-align:center;text-transform:capitalize}.viewSwitch{display:flex;border:1px solid #e1d6cf;border-radius:9px;overflow:hidden}.viewSwitch button{border:0;border-right:1px solid #e1d6cf;background:#fff;padding:8px 10px;color:#6b1a2c;font-weight:900}.viewSwitch button:last-child{border:0}.viewSwitch button.active{background:#6b1a2c;color:#fff}
        .week{display:grid;grid-template-columns:repeat(7,minmax(110px,1fr));border:1px solid #eadfd8;border-radius:14px;overflow:auto;background:#fff}.day{min-height:240px;border-right:1px solid #eee4df}.day:last-child{border:0}.dayHead{padding:9px;text-align:center;border-bottom:1px solid #eee4df;text-transform:capitalize}.dayHead b,.dayHead span{display:block}.dayHead span{font-size:1.2rem;color:#6b1a2c;font-weight:1000}.dayBody{padding:6px;display:grid;gap:6px;align-content:start}.day article{border-radius:8px;padding:7px;display:grid;gap:2px}.day article small{font-size:.62rem}.day article strong{font-size:.72rem}.day article span{font-size:.62rem}.status{width:max-content;font-size:.58rem;font-style:normal;font-weight:900;padding:2px 5px;border-radius:999px;background:rgba(255,255,255,.75)}.status.present{color:#26733b}.status.absent{color:#9b1c31}.status.uncertain{color:#9a5c00}.status.invited{color:#6b1a2c}.empty{text-align:center;color:#bbb}
        .dayView{border:1px solid #eadfd8;border-radius:14px;padding:12px;display:grid;gap:8px;min-height:240px}.timelineEvent{display:grid;grid-template-columns:70px 1fr;gap:10px;align-items:start}.timelineEvent time{font-weight:900;color:#6b1a2c;padding-top:9px;text-align:right}.timelineEvent>div{border-radius:10px;padding:9px;display:grid;gap:2px}.timelineEvent small,.timelineEvent span{font-size:.68rem}.noEvent{color:#9a8f89;text-align:center;padding:70px 0}.month{display:grid;grid-template-columns:repeat(7,1fr);border:1px solid #eadfd8;border-radius:14px;overflow:hidden}.monthHead{background:#faf7f5;text-align:center;padding:8px;font-size:.7rem;font-weight:900}.monthCell{min-height:105px;border:0;border-top:1px solid #eee4df;border-right:1px solid #eee4df;background:#fff;padding:6px;text-align:left;display:flex;flex-direction:column;gap:3px}.monthCell b{color:#6b1a2c}.monthCell span{font-size:.58rem;padding:3px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.monthCell small{font-size:.58rem;color:#7c716b}.monthCell.muted{background:#fafafa}.legend{display:flex;gap:12px;flex-wrap:wrap;color:#786b65;font-size:.7rem}.legend span{display:flex;align-items:center;gap:5px}.legend i{width:10px;height:10px;border:1px solid;border-radius:50%}
        .overlay{position:fixed;inset:0;background:rgba(20,12,14,.5);z-index:1000;display:grid;place-items:center;padding:16px}.modal{width:min(570px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:17px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.25)}.modalHead{display:flex;justify-content:space-between}.modalHead h3{margin:3px 0 12px;color:#6b1a2c}.modalHead>button{border:0;background:#f5edef;border-radius:50%;width:30px;height:30px;color:#6b1a2c;font-size:1.2rem}.kinds{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:10px}.kinds button{border:1px solid #e1d6cf;background:#fff;border-radius:9px;padding:8px;color:#6b1a2c;font-weight:800}.kinds button.active{background:#6b1a2c;color:#fff}
        .modal>label,.two label{display:grid;gap:4px;font-size:.72rem;font-weight:900;color:#786b65;margin-bottom:9px}.modal input,.modal textarea{border:1px solid #d9cec7;border-radius:9px;padding:9px;font:inherit;background:#fff}.modal textarea{min-height:65px}.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.notify{display:grid;gap:7px;background:#faf7f5;border-radius:11px;padding:10px;margin:5px 0 12px}.notify label{font-size:.75rem}.notify small{color:#8c7f78;line-height:1.35}.save{width:100%}
        @media(max-width:760px){.head{display:grid}.toolbar{grid-template-columns:1fr}.week{grid-template-columns:repeat(7,minmax(130px,1fr))}.month{min-width:720px}.pc{overflow-x:auto}.two{grid-template-columns:1fr}.kinds{grid-template-columns:1fr 1fr}.viewSwitch button{flex:1}.timelineEvent{grid-template-columns:55px 1fr}}
      `}</style>
    </section>
  );
}
