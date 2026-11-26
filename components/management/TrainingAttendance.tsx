"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

export default function TrainingAttendance({ team }: { team: Team }) {
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
        const initial = available.find(event => event.event_date === today);
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
  }, [db, teamId, today]);

  const session = sessions.find(training => training.id === sessionId);
  const expected = session?.assigned_player_ids || [];
  const players = team.players.filter(player => !expected.length || expected.includes(player.id));
  const rosterKey = sessionId && teamId ? `${sessionId}:${teamId}` : "";

  useEffect(() => {
    if (!rosterKey) return;
    let active = true;
    setReading(true);
    setLoadedRoster("");
    async function readRoster() {
      try {
        const { data, error } = await db.from("player_event_presence").select("player_id,status")
          .eq("team_id", teamId).eq("event_id", sessionId);
        if (error) throw error;
        if (!active) return;
        const existing = (data ?? []) as { player_id: string; status: Status }[];
        setMarks(Object.fromEntries(existing.map(row => [row.player_id, row.status])));
        setLoadedRoster(rosterKey);
      } catch {
        if (active) setError("Impossible de charger les présences de cette séance.");
      } finally {
        if (active) setReading(false);
      }
    }
    void readRoster();
    return () => { active = false; };
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
    setSessionId(trainingId);
  }

  async function save() {
    if (saving || !rosterKey || loadedRoster !== rosterKey) return;
    const rows = players.flatMap(player => changes[player.id] ? [{
      team_id: teamId, event_id: sessionId, player_id: player.id, status: changes[player.id], updated_at: new Date().toISOString(),
    }] : []);
    if (!rows.length) return;
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
      setSaving(false);
    }
  }

  return <section className="attendance">
    <h2>Appel à l’entraînement</h2>
    {loading && <p role="status">Chargement des séances…</p>}
    {error && <p role="alert">{error}</p>}
    {saved && <p role="status">Présences enregistrées.</p>}
    {!loading && <fieldset disabled={saving}>
      <label>Entraînement
        <select value={sessionId} onChange={event => selectRoster(event.target.value)}>
          <option value="">Choisir une séance</option>
          {sessions.map(training => <option key={training.id} value={training.id}>
            {new Date(training.event_date + "T12:00:00").toLocaleDateString("fr-FR")} · {training.start_time?.slice(0, 5) || "Sans heure"} · {training.title}
          </option>)}
        </select>
      </label>
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
          <button type="button" disabled={!Object.keys(changes).length} onClick={save}>{saving ? "Enregistrement…" : "Enregistrer l’appel"}</button>
        </div>}
      </>}
    </fieldset>}
    <style jsx>{`
      .attendance{color:#281c21}.attendance h2{color:#6b1a2c;font-size:1.1rem}
      fieldset{padding:0;border:0;min-width:0}label{display:grid;gap:6px;margin:12px 0;font-weight:700}
      select,button{border:1px solid #d9c8cc;background:#fff;border-radius:9px;color:inherit;font:inherit;min-height:44px;padding:8px}
      select{width:100%}ul{list-style:none;padding:0;margin:0}li{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 0;border-bottom:1px solid #eadfe1}
      li div{display:flex;flex-wrap:wrap;gap:6px}button{cursor:pointer}button[aria-pressed="true"],.save button{background:#6b1a2c;color:#fff;border-color:#6b1a2c}
      button:disabled{opacity:.5;cursor:default}.save{position:sticky;bottom:0;background:white;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 0}
    `}</style>
  </section>;
}
