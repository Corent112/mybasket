"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTeam } from "@/lib/equipes-store";
import type { Team } from "@/types/player";

type Status = "present" | "late" | "absent";
type Training = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  team_id: string | null;
  session_id: string | null;
  assigned_player_ids: string[] | null;
};

const statuses = [["present", "Présent"], ["late", "Retard"], ["absent", "Absent"]] as const;

export default function TrainingAttendance({ team, eventId }: { team: Team; eventId?: string }) {
  const db = useMemo(createClient, []);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  const teamId = team.id;
  const [sessions, setSessions] = useState<Training[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [changes, setChanges] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [loadedRoster, setLoadedRoster] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [qrCode, setQrCode] = useState<{ path: string; image: string }>();
  const [phoneStatus, setPhoneStatus] = useState("");
  const writeVersion = useRef(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error("Connecte-toi pour faire l’appel.");
        const result = await db.from("calendar_events")
          .select("id,title,event_date,start_time,team_id,session_id,assigned_player_ids")
          .or(`user_id.eq.${user.id},owner_id.eq.${user.id}`)
          .or(`team_id.eq.${teamId},and(team_id.is.null,session_id.not.is.null)`)
          .in("event_type", ["training", "entrainement", "entraînement"])
          .order("event_date", { ascending: false }).order("start_time");
        if (result.error) throw result.error;
        const training = (result.data ?? []) as Training[];
        const practiceIds = [...new Set(training.filter(event => !event.team_id && event.session_id).map(event => event.session_id!))];
        const linkedTeams = new Map<string, string>();
        if (practiceIds.length) {
          const practice = await db.from("practice_sessions").select("id,team_id").in("id", practiceIds);
          if (practice.error) throw practice.error;
          for (const row of practice.data ?? []) if (row.team_id) linkedTeams.set(row.id, row.team_id);
        }
        if (!active) return;
        const available = training.map(event => ({
          ...event,
          team_id: event.team_id || (event.session_id ? linkedTeams.get(event.session_id) || null : null),
        })).filter(event => event.team_id === teamId);
        const initial = eventId ? available.find(event => event.id === eventId) : available.find(event => event.event_date === today);
        if (eventId && !initial) setError("Cette séance est introuvable pour cette équipe.");
        setSessions(available);
        setSessionId(initial?.id || "");
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "Impossible de charger les entraînements.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [db, eventId, teamId, today]);

  const session = sessions.find(training => training.id === sessionId);
  const expected = session?.assigned_player_ids || [];
  const players = team.players.filter(player => !expected.length || expected.includes(player.id));
  const rosterKey = sessionId && teamId ? `${sessionId}:${teamId}` : "";

  useEffect(() => {
    if (!rosterKey) return;
    let active = true;
    setReading(true);
    setLoadedRoster("");
    async function readRoster(initial = false) {
      const version = writeVersion.current;
      try {
        const { data, error } = await db.from("player_event_presence").select("player_id,status")
          .eq("team_id", teamId).eq("event_id", sessionId);
        if (error) throw error;
        if (!active || version !== writeVersion.current) return;
        const existing = (data ?? []) as { player_id: string; status: Status }[];
        setMarks(Object.fromEntries(existing.map(row => [row.player_id, row.status])));
        setLoadedRoster(rosterKey);
      } catch {
        if (active && initial) setError("Impossible de charger les présences de cette séance.");
      } finally {
        if (active) setReading(false);
      }
    }
    function refreshRoster() {
      if (document.visibilityState === "visible") void readRoster();
    }
    void readRoster(true);
    const interval = window.setInterval(refreshRoster, 5000);
    document.addEventListener("visibilitychange", refreshRoster);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshRoster);
    };
  }, [db, teamId, sessionId, rosterKey]);

  function canSwitch() {
    return !Object.keys(changes).length || window.confirm("Changer de sélection et abandonner les pointages non enregistrés ?");
  }

  function selectRoster(trainingId: string) {
    if (!canSwitch()) return;
    setLoadedRoster("");
    setReading(false);
    setMarks({});
    setChanges({});
    setSaved(false);
    setError("");
    setPhoneStatus("");
    setQrCode(undefined);
    setSessionId(trainingId);
  }

  async function save() {
    if (saving || !rosterKey || loadedRoster !== rosterKey) return;
    const rows = players.flatMap(player => changes[player.id] ? [{
      team_id: teamId, event_id: sessionId, player_id: player.id, status: changes[player.id], updated_at: new Date().toISOString(),
    }] : []);
    if (!rows.length) return;
    writeVersion.current++;
    setSaving(true);
    setError("");
    try {
      const { error } = await db.from("player_event_presence").upsert(rows, { onConflict: "team_id,player_id,event_id" });
      if (error) throw error;
      setMarks(current => ({ ...current, ...changes }));
      setChanges({});
      setSaved(true);
    } catch {
      setError("Impossible d’enregistrer les présences. Tu peux réessayer.");
    } finally {
      writeVersion.current++;
      setSaving(false);
    }
  }

  const phonePath = sessionId ? `/equipes/${encodeURIComponent(teamId)}/appel?seance=${encodeURIComponent(sessionId)}` : "";
  async function showQrCode() {
    const path = phonePath;
    try {
      const { default: QRCode } = await import("qrcode");
      const image = await QRCode.toDataURL(new URL(path, window.location.origin).href, { width: 220, margin: 2 });
      setQrCode({ path, image });
    } catch {
      setPhoneStatus("QR code indisponible. Utilise le lien de la séance.");
    }
  }

  const qrImage = qrCode?.path === phonePath ? qrCode.image : "";

  return <section className="attendance">
    <h2>Appel à l’entraînement{eventId ? ` · ${team.name}` : ""}</h2>
    {loading && <p role="status">Chargement des séances…</p>}
    {error && <p role="alert">{error}</p>}
    {saved && <p role="status">Présences enregistrées.</p>}
    {!loading && <fieldset disabled={saving}>
      {!eventId && <label>Entraînement
        <select value={sessionId} onChange={event => selectRoster(event.target.value)}>
          <option value="">Choisir une séance</option>
          {sessions.map(training => <option key={training.id} value={training.id}>
            {new Date(training.event_date + "T12:00:00").toLocaleDateString("fr-FR")} · {training.start_time?.slice(0, 5) || "Sans heure"} · {training.title}
          </option>)}
        </select>
      </label>}
      {eventId && session && <p>{session.title} · {new Date(session.event_date + "T12:00:00").toLocaleDateString("fr-FR")} {session.start_time?.slice(0, 5)}</p>}
      {!eventId && phonePath && <div className="phone">
        <a href={phonePath}>Ouvrir le formulaire</a>
        <button type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(new URL(phonePath, window.location.origin).href);
            setPhoneStatus("Lien copié.");
          } catch {
            setPhoneStatus("Tu peux ouvrir le formulaire pour copier son adresse.");
          }
        }}>Copier le lien</button>
        <button type="button" aria-expanded={!!qrImage} onClick={() => qrImage ? setQrCode(undefined) : void showQrCode()}>QR code</button>
        {qrImage && <div className="qr"><img src={qrImage} width={220} height={220} alt="QR code du formulaire d’appel de cette séance" /><small>Scanne avec ton téléphone et connecte-toi à MyBasket si nécessaire.</small></div>}
        {phoneStatus && <small role="status">{phoneStatus}</small>}
      </div>}
      {!sessions.length && <p>Aucun entraînement associé à cette équipe. Choisis cette équipe en créant la séance dans Mon Calendrier.</p>}
      {reading && <p role="status">Chargement des présences…</p>}
      {!!rosterKey && loadedRoster === rosterKey && <>
        {!players.length && <p>Aucun joueur à pointer pour cette séance.</p>}
        <ul>
          {players.map(player => <li key={player.id}>
            <strong>{player.firstName} {player.lastName}</strong>
            <div role="group" aria-label={`Présence de ${player.firstName} ${player.lastName || ""}`}>
              {statuses.map(([status, label]) => <button type="button" key={status}
                aria-pressed={(changes[player.id] || marks[player.id]) === status}
                onClick={() => {
                  setSaved(false);
                  setChanges(current => {
                    const next = { ...current };
                    if (marks[player.id] === status || current[player.id] === status) delete next[player.id];
                    else next[player.id] = status;
                    return next;
                  });
                }}>{label}</button>)}
            </div>
          </li>)}
        </ul>
        {!!players.length && <div className="save">
          <span>{players.filter(player => ["present", "late"].includes(changes[player.id] || marks[player.id])).length} présent(s)</span>
          <button type="button" disabled={!Object.keys(changes).length} onClick={save}>{saving ? "Enregistrement…" : eventId ? "Envoyer l’appel" : "Enregistrer l’appel"}</button>
        </div>}
      </>}
    </fieldset>}
    <style jsx>{`
      .attendance{color:#281c21}.attendance h2{color:#6b1a2c;font-size:1.1rem}
      fieldset{padding:0;border:0;min-width:0}label{display:grid;gap:6px;margin:12px 0;font-weight:700}
      select,button{border:1px solid #d9c8cc;background:#fff;border-radius:9px;color:inherit;font:inherit;min-height:44px;padding:8px}
      select{width:100%}ul{list-style:none;padding:0;margin:0}li{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 0;border-bottom:1px solid #eadfe1}
      li div{display:flex;flex-wrap:wrap;gap:6px}button{cursor:pointer}button[aria-pressed="true"],.save button{background:#6b1a2c;color:#fff;border-color:#6b1a2c}
      .phone{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0 18px}.phone a{color:#6b1a2c;font-weight:700}.qr{flex-basis:100%;display:grid;gap:6px}
      button:disabled{opacity:.5;cursor:default}.save{position:sticky;bottom:0;background:white;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 0}
    `}</style>
  </section>;
}


export function MobileTrainingAttendance({ teamId, eventId }: { teamId: string; eventId: string }) {
  const [team, setTeam] = useState<Team>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void getTeam(teamId).then(result => {
      if (active && result && !result.isShared && !result.isScoutTeam) setTeam(result);
    }).catch(() => undefined).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [teamId]);
  if (!eventId) return <p role="alert">Ouvre le lien de la séance depuis la fiche équipe.</p>;
  if (loading) return <p role="status">Chargement de l’appel…</p>;
  if (!team) return <p role="alert">Cette équipe est inaccessible avec ce compte.</p>;
  return <TrainingAttendance key={eventId} team={team} eventId={eventId} />;
}
