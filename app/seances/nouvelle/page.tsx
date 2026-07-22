"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearSessionBuilderItems, loadSessionBuilderItems } from "@/lib/session-builder";

type Team = { id: string; name: string; club_logo_url?: string | null; gymnasium?: string | null };
type Player = { id: string; team_id: string; first_name?: string | null; last_name?: string | null; position_primary?: string | null };
type SessionExercise = { exercise_id: string; title: string; who: string; duration_minutes: number; situation_image_url: string; explanation: string; instructions: string; variants?: string; sort_order: number };
type CompositionTeam = { id: string; name: string; playerIds: string[] };
type TeamCompositionBlock = { id: string; title: string; playersPerTeam: number; teams: CompositionTeam[] };
type DbExercise = Partial<SessionExercise> & { duration_minutes?: number | string | null; sort_order?: number | string | null };

type DragPayload = { playerId: string; blockId: string } | null;
const POSITION_LABELS = ["PG", "SG", "SF", "PF", "C"];
const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const defaultBlock = (title = "Équipes de 3", playersPerTeam = 3): TeamCompositionBlock => ({ id: uid("block"), title, playersPerTeam, teams: [1, 2, 3].map((n) => ({ id: uid("team"), name: `Équipe ${n}`, playerIds: [] })) });
const playerName = (p?: Player) => p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Joueur" : "Joueur";
const legacyGroups = (blocks: TeamCompositionBlock[]) => Object.fromEntries((blocks[0]?.teams ?? []).map((team) => [team.name, team.playerIds]));
function legacyBlocks(groups?: Record<string, string[]> | null): TeamCompositionBlock[] {
  const teams = Object.entries(groups ?? {}).map(([name, playerIds]) => ({ id: uid("team"), name, playerIds: Array.isArray(playerIds) ? playerIds : [] }));
  return teams.length ? [{ id: uid("legacy"), title: "Équipes de travail", playersPerTeam: 0, teams }] : [];
}

export default function NouvelleSeancePage() {
  const supabase = createClient();
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamId, setTeamId] = useState("");
  const [title, setTitle] = useState("Séance rapide");
  const [theme, setTheme] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:30");
  const [location, setLocation] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<TeamCompositionBlock[]>([defaultBlock()]);
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragged, setDragged] = useState<DragPayload>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const selectedTeam = teams.find((team) => team.id === teamId);
  const filteredPlayers = useMemo(() => players.filter((player) => player.team_id === teamId), [players, teamId]);
  const selectedPlayerRows = useMemo(() => selectedPlayers.map((id) => players.find((player) => player.id === id)).filter((p): p is Player => Boolean(p)), [players, selectedPlayers]);

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (selectedTeam?.gymnasium && !location) setLocation(selectedTeam.gymnasium); }, [selectedTeam, location]);

  async function load() {
    setLoading(true);
    const sessionId = new URLSearchParams(window.location.search).get("id");
    const [{ data: teamRows }, { data: playerRows }] = await Promise.all([
      supabase.from("teams").select("*").order("name"),
      supabase.from("players").select("*").order("last_name"),
    ]);
    setTeams((teamRows ?? []) as Team[]);
    setPlayers((playerRows ?? []) as Player[]);

    if (sessionId) {
      const { data: session, error } = await supabase.from("practice_sessions").select("*").eq("id", sessionId).maybeSingle();
      if (error || !session) { alert("Séance introuvable."); setLoading(false); return; }
      setEditingId(sessionId);
      setTitle(session.title || "Séance rapide"); setTheme(session.theme || ""); setTeamId(session.team_id || "");
      setDate(session.session_date || ""); setStartTime((session.start_time || "18:00").slice(0, 5)); setEndTime((session.end_time || "19:30").slice(0, 5)); setLocation(session.location || "");
      const loadedBlocks = Array.isArray(session.team_composition_blocks) && session.team_composition_blocks.length ? session.team_composition_blocks as TeamCompositionBlock[] : legacyBlocks(session.player_groups);
      setBlocks(loadedBlocks.length ? loadedBlocks : [defaultBlock()]);
      const [{ data: exerciseRows }, { data: directRows }, { data: attendanceRows }] = await Promise.all([
        supabase.from("practice_session_exercises").select("*").eq("session_id", sessionId).order("sort_order"),
        supabase.from("practice_session_players").select("*").eq("session_id", sessionId),
        supabase.from("practice_session_attendance").select("*").eq("session_id", sessionId),
      ]);
      setExercises(((exerciseRows ?? []) as DbExercise[]).map((e, i) => ({
        exercise_id: String(e.exercise_id || ""), title: String(e.title || "Exercice"), who: String(e.who || "CP"), duration_minutes: Number(e.duration_minutes ?? 10),
        situation_image_url: String(e.situation_image_url || ""), explanation: String(e.explanation || ""), instructions: String(e.instructions || ""), variants: String(e.variants || ""), sort_order: Number(e.sort_order ?? i),
      })));
      const directIds = (directRows ?? []).filter((r: any) => r.selected !== false && !["absent", "injured", "excused"].includes(String(r.status || ""))).map((r: any) => String(r.player_id || r.id || "")).filter(Boolean);
      const attendanceIds = (attendanceRows ?? []).filter((r: any) => !["absent", "injured", "excused"].includes(String(r.status || "present"))).map((r: any) => String(r.player_id || "")).filter(Boolean);
      setSelectedPlayers(Array.from(new Set(directIds.length ? directIds : attendanceIds)));
    } else {
      const builderItems = await loadSessionBuilderItems();
      setExercises(builderItems.map((item, index) => ({ exercise_id: item.item_id ?? "", title: item.title, who: item.assigned_to ?? "CP", duration_minutes: item.duration_minutes ?? 10, situation_image_url: item.image_url ?? "", explanation: item.description ?? "", instructions: typeof item.metadata?.instructions === "string" ? item.metadata.instructions : "", variants: typeof item.metadata?.variants === "string" ? item.metadata.variants : "", sort_order: index })));
    }
    setLoading(false);
  }

  function setSelection(ids: string[]) {
    const unique = Array.from(new Set(ids)); setSelectedPlayers(unique);
    setBlocks((prev) => prev.map((block) => ({ ...block, teams: block.teams.map((team) => ({ ...team, playerIds: team.playerIds.filter((id) => unique.includes(id)) })) })));
  }
  function togglePlayer(id: string) { setSelection(selectedPlayers.includes(id) ? selectedPlayers.filter((x) => x !== id) : [...selectedPlayers, id]); }
  function updateBlock(blockId: string, patch: Partial<TeamCompositionBlock>) { setBlocks((prev) => prev.map((block) => block.id === blockId ? { ...block, ...patch } : block)); }
  function addPresetBlock(size: number) { setBlocks((prev) => [...prev, defaultBlock(size === 0 ? "Ateliers" : size === 5 ? "5 contre 5" : `Équipes de ${size}`, size)]); }
  function duplicateBlock(blockId: string) { setBlocks((prev) => { const source = prev.find((block) => block.id === blockId); return source ? [...prev, { ...source, id: uid("block"), title: `${source.title} — copie`, teams: source.teams.map((team) => ({ ...team, id: uid("team") })) }] : prev; }); }
  function removeBlock(blockId: string) { if (confirm("Supprimer ce bloc ?")) setBlocks((prev) => prev.filter((block) => block.id !== blockId)); }
  function addTeam(blockId: string) { setBlocks((prev) => prev.map((block) => block.id === blockId ? { ...block, teams: [...block.teams, { id: uid("team"), name: `Équipe ${block.teams.length + 1}`, playerIds: [] }] } : block)); }
  function updateTeam(blockId: string, teamIdValue: string, patch: Partial<CompositionTeam>) { setBlocks((prev) => prev.map((block) => block.id === blockId ? { ...block, teams: block.teams.map((team) => team.id === teamIdValue ? { ...team, ...patch } : team) } : block)); }
  function removeTeam(blockId: string, teamIdValue: string) { setBlocks((prev) => prev.map((block) => block.id === blockId ? { ...block, teams: block.teams.filter((team) => team.id !== teamIdValue) } : block)); }
  function placePlayer(blockId: string, teamIdValue: string, playerId: string) {
    if (!selectedPlayers.includes(playerId)) setSelectedPlayers((prev) => [...prev, playerId]);
    setBlocks((prev) => prev.map((block) => block.id !== blockId ? block : { ...block, teams: block.teams.map((team) => ({ ...team, playerIds: team.id === teamIdValue ? [...team.playerIds.filter((id) => id !== playerId), playerId] : team.playerIds.filter((id) => id !== playerId) })) }));
  }
  function removePlayerFromBlock(blockId: string, playerId: string) { setBlocks((prev) => prev.map((block) => block.id !== blockId ? block : { ...block, teams: block.teams.map((team) => ({ ...team, playerIds: team.playerIds.filter((id) => id !== playerId) })) })); }
  function autoDistribute(blockId: string) {
    setBlocks((prev) => prev.map((block) => {
      if (block.id !== blockId) return block;
      const target = Math.max(1, block.playersPerTeam || 1);
      const needed = Math.max(1, Math.ceil(selectedPlayers.length / target));
      const teamsCopy: CompositionTeam[] = block.teams.map((team) => ({
        ...team,
        playerIds: [] as string[],
      }));

      while (teamsCopy.length < needed) {
        teamsCopy.push({
          id: uid("team"),
          name: `Équipe ${teamsCopy.length + 1}`,
          playerIds: [] as string[],
        });
      }

      selectedPlayers.forEach((playerId, index) => {
        const targetTeam = teamsCopy[index % Math.min(needed, teamsCopy.length)];
        if (targetTeam) targetTeam.playerIds.push(playerId);
      });

      return { ...block, teams: teamsCopy };
    }));
  }
  function moveExercise(index: number, delta: number) { const target = index + delta; if (target < 0 || target >= exercises.length) return; const copy = [...exercises]; [copy[index], copy[target]] = [copy[target], copy[index]]; setExercises(copy.map((exercise, i) => ({ ...exercise, sort_order: i }))); }
  function updateExercise(index: number, field: keyof SessionExercise, value: string | number) { setExercises((prev) => prev.map((exercise, i) => i === index ? { ...exercise, [field]: value } : exercise)); }
  async function addMoreExercises() { const { data: { user } } = await supabase.auth.getUser(); if (!user) return alert("Tu dois être connecté."); if (editingId) await supabase.from("profiles").update({ active_practice_session_id: editingId }).eq("id", user.id); window.location.href = editingId ? `/exercices?session=${editingId}` : "/exercices"; }

  async function save() {
    setSaving(true);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) { setSaving(false); return alert("Tu dois être connecté."); }
    if (!teamId || !date || !theme.trim()) { setSaving(false); return alert("Renseigne l'équipe, la date et le thème."); }
    if (!exercises.length) { setSaving(false); return alert("Ajoute au moins un exercice."); }
    const payload = {
      user_id: user.id,
      visibility: "private",
      team_id: teamId,
      team_name: selectedTeam?.name ?? null,
      title: title.trim() || "Séance rapide",
      theme: theme.trim(),
      session_date: date,
      start_time: startTime,
      end_time: endTime,
      location,
      club_logo_url: selectedTeam?.club_logo_url ?? null,
      mybasket_logo_url: "/logo-mybasket02.png",
      team_composition_blocks: blocks,
      player_groups: legacyGroups(blocks),
      pdf_url: null,
    };
    let sessionId = editingId;
    if (sessionId) {
      const { error } = await supabase.from("practice_sessions").update(payload).eq("id", sessionId).eq("user_id", user.id); if (error) { setSaving(false); return alert(error.message); }
      await Promise.all([supabase.from("practice_session_exercises").delete().eq("session_id", sessionId), supabase.from("practice_session_attendance").delete().eq("session_id", sessionId), supabase.from("practice_session_players").delete().eq("session_id", sessionId)]);
    } else {
      const { data, error } = await supabase.from("practice_sessions").insert(payload).select("id").single(); if (error || !data) { setSaving(false); return alert(error?.message || "Erreur création"); } sessionId = data.id;
    }
    const chosen = players.filter((player) => selectedPlayers.includes(player.id));
    if (chosen.length) {
      await supabase.from("practice_session_attendance").insert(chosen.map((player) => ({ user_id: user.id, session_id: sessionId, player_id: player.id, first_name: player.first_name, last_name: player.last_name, status: "present", comment: "" })));
      const snapshot = await supabase.from("practice_session_players").insert(chosen.map((player) => ({ user_id: user.id, session_id: sessionId, player_id: player.id, first_name: player.first_name, last_name: player.last_name, position: player.position_primary ?? null, selected: true, status: "present" })));
      if (snapshot.error) console.warn("practice_session_players non disponible ou schéma différent", snapshot.error);
    }
    const { error: exerciseError } = await supabase.from("practice_session_exercises").insert(exercises.map((exercise, index) => ({ session_id: sessionId, user_id: user.id, exercise_id: exercise.exercise_id || null, title: exercise.title, who: exercise.who, duration_minutes: exercise.duration_minutes, situation_image_url: exercise.situation_image_url || null, explanation: exercise.explanation || null, instructions: exercise.instructions || null, sort_order: index })));
    if (exerciseError) { setSaving(false); return alert(exerciseError.message); }
    const calendarPayload = {
      user_id: user.id,
      owner_id: user.id,
      visibility: "private",
      event_type: "training",
      session_id: sessionId,
      team_id: teamId,
      team_name: selectedTeam?.name ?? null,
      assigned_player_ids: selectedPlayers,
      title: `${selectedTeam?.name ?? "Équipe"} • ${theme.trim()}`,
      description: `${title.trim() || "Séance rapide"} — Ouvrir la fiche séance`,
      event_date: date,
      start_time: startTime,
      end_time: endTime,
      location,
      attachment_url: null,
      updated_at: new Date().toISOString(),
    };

    const { data: existingCalendarEvents, error: calendarLookupError } =
      await supabase
        .from("calendar_events")
        .select("id, created_at")
        .eq("session_id", sessionId)
        .or(`user_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order("created_at", { ascending: true });

    if (calendarLookupError) {
      console.error("Erreur recherche événement calendrier:", calendarLookupError);
      setSaving(false);
      return alert("La séance est enregistrée, mais le calendrier n'a pas pu être synchronisé.");
    }

    const eventIds = (
      (existingCalendarEvents ?? []) as Array<{ id?: string | null }>
    )
      .map((event: { id?: string | null }) => String(event.id || ""))
      .filter(Boolean);

    if (eventIds.length > 0) {
      const [primaryEventId, ...duplicateEventIds] = eventIds;

      const { error: updateCalendarError } = await supabase
        .from("calendar_events")
        .update(calendarPayload)
        .eq("id", primaryEventId);

      if (updateCalendarError) {
        console.error("Erreur mise à jour calendrier:", updateCalendarError);
        setSaving(false);
        return alert("La séance est enregistrée, mais l'événement calendrier n'a pas pu être mis à jour.");
      }

      if (duplicateEventIds.length > 0) {
        await supabase.from("calendar_events").delete().in("id", duplicateEventIds);
      }
    } else {
      const { error: insertCalendarError } = await supabase
        .from("calendar_events")
        .insert(calendarPayload);

      if (insertCalendarError) {
        console.error("Erreur création événement calendrier:", insertCalendarError);
        setSaving(false);
        return alert("La séance est enregistrée, mais son événement calendrier n'a pas pu être créé.");
      }
    }

    await supabase
      .from("profiles")
      .update({ active_practice_session_id: null })
      .eq("id", user.id);

    await clearSessionBuilderItems();
    setSaving(false);
    window.location.href = `/seances/${sessionId}`;
  }

  if (loading) return <main className="page loading">Chargement du mode Coach…</main>;
  return <main className="page">
    <header className="hero"><span>MYBASKET · MODE COACH</span><h1>{editingId ? "MODIFIER LA SÉANCE" : "CONSTRUIRE LA SÉANCE"}</h1><p>Prépare les présents, compose tes groupes et organise ton practice plan.</p></header>

    <section className="panel info"><div className="panelTitle"><span>01</span><div><h2>Informations</h2><p>Cadre général de la séance</p></div></div><div className="infoGrid"><label>Titre<input value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>Équipe<select value={teamId} onChange={(e) => { setTeamId(e.target.value); setSelection([]); }}><option value="">Choisir</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Thème<input value={theme} onChange={(e) => setTheme(e.target.value)} /></label><label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label>Début<input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label><label>Fin<input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label><label className="wide">Lieu<input value={location} onChange={(e) => setLocation(e.target.value)} /></label></div></section>

    <section className="panel coachMode"><div className="panelTitle"><span>02</span><div><h2>Mode Coach</h2><p>Sélectionne puis déplace les joueurs dans chaque composition</p></div></div>
      <div className="coachLayout">
        <aside className="presenceRail"><div className="railHeader"><div><strong>JOUEURS PRÉSENTS</strong><small>{selectedPlayers.length} sélectionné{selectedPlayers.length > 1 ? "s" : ""}</small></div><div><button onClick={() => setSelection(filteredPlayers.map((player) => player.id))}>Tout</button><button onClick={() => setSelection([])}>Vider</button></div></div>
          <div className="roster">{filteredPlayers.map((player) => { const selected = selectedPlayers.includes(player.id); return <button type="button" key={player.id} className={`rosterCard ${selected ? "selected" : ""}`} onClick={() => togglePlayer(player.id)} draggable={selected} onDragStart={() => selected && setDragged({ playerId: player.id, blockId: "pool" })}><span className="check">{selected ? "✓" : "+"}</span><span><b>{playerName(player)}</b><small>{player.position_primary || "Poste non défini"}</small></span></button>; })}</div>
        </aside>

        <div className="compositionArea"><div className="compositionToolbar"><div><strong>COMPOSITIONS DYNAMIQUES</strong><small>Un joueur peut être utilisé dans chaque bloc, une seule fois par bloc.</small></div><div className="presetButtons"><button onClick={() => addPresetBlock(3)}>+ 3x3</button><button onClick={() => addPresetBlock(4)}>+ 4x4</button><button onClick={() => addPresetBlock(5)}>+ 5x5</button><button onClick={() => addPresetBlock(0)}>+ Ateliers</button></div></div>
          {blocks.map((block, blockIndex) => <article className={`compositionBlock tone${blockIndex % 4}`} key={block.id}><div className="blockHeader"><div className="blockIdentity"><span>BLOC {String(blockIndex + 1).padStart(2, "0")}</span><input value={block.title} onChange={(e) => updateBlock(block.id, { title: e.target.value })} /></div><label>Joueurs / équipe<input type="number" min={0} value={block.playersPerTeam} onChange={(e) => updateBlock(block.id, { playersPerTeam: Number(e.target.value) })} /></label><button className="auto" onClick={() => autoDistribute(block.id)}>⚡ Répartir automatiquement</button><button onClick={() => duplicateBlock(block.id)}>Dupliquer</button><button className="iconDanger" onClick={() => removeBlock(block.id)}>×</button></div>
            <div className="blockPool" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragged?.playerId) removePlayerFromBlock(block.id, dragged.playerId); setDragged(null); }}><span>DISPONIBLES POUR CE BLOC</span><div>{selectedPlayerRows.filter((player) => !block.teams.some((team) => team.playerIds.includes(player.id))).map((player) => <div draggable key={player.id} className="miniPlayer" onDragStart={() => setDragged({ playerId: player.id, blockId: block.id })}><b>{playerName(player)}</b><small>{player.position_primary || "—"}</small></div>)}</div></div>
            <div className="teamGrid">{block.teams.map((team, teamIndex) => { const targetKey = `${block.id}:${team.id}`; const slots = Math.max(block.playersPerTeam || 0, team.playerIds.length, 1); return <section key={team.id} className={`teamCard teamTone${teamIndex % 5} ${dropTarget === targetKey ? "isTarget" : ""}`} onDragOver={(e) => { e.preventDefault(); setDropTarget(targetKey); }} onDragLeave={() => setDropTarget(null)} onDrop={() => { if (dragged?.playerId) placePlayer(block.id, team.id, dragged.playerId); setDragged(null); setDropTarget(null); }}><div className="teamHead"><span>{teamIndex + 1}</span><input value={team.name} onChange={(e) => updateTeam(block.id, team.id, { name: e.target.value })} /><button onClick={() => removeTeam(block.id, team.id)}>×</button></div><div className="slots">{Array.from({ length: slots }).map((_, slotIndex) => { const player = players.find((p) => p.id === team.playerIds[slotIndex]); return <div key={`${team.id}-${slotIndex}`} className={`slot ${player ? "filled" : ""}`}>{player ? <div draggable onDragStart={() => setDragged({ playerId: player.id, blockId: block.id })}><span className="position">{POSITION_LABELS[slotIndex] || `P${slotIndex + 1}`}</span><span><b>{playerName(player)}</b><small>{player.position_primary || "Poste libre"}</small></span><button onClick={() => removePlayerFromBlock(block.id, player.id)}>×</button></div> : <><span className="position">{POSITION_LABELS[slotIndex] || `P${slotIndex + 1}`}</span><em>Déposer un joueur</em></>}</div>; })}</div></section>; })}</div><button className="addTeam" onClick={() => addTeam(block.id)}>+ Ajouter une équipe</button>
          </article>)}
        </div>
      </div>
    </section>

    <section className="panel"><div className="panelTitle horizontal"><span>03</span><div><h2>Practice plan</h2><p>Ordre, temps et responsabilité de chaque exercice</p></div><button className="goldButton" onClick={addMoreExercises}>+ Ajouter des exercices</button></div>{exercises.map((exercise, index) => <article className="exercise" key={`${exercise.exercise_id}-${index}`}><div className="exerciseIndex">{String(index + 1).padStart(2, "0")}</div><div className="exerciseContent"><input className="exerciseTitle" value={exercise.title} onChange={(e) => updateExercise(index, "title", e.target.value)} /><div className="exerciseMeta"><label>Qui<select value={exercise.who} onChange={(e) => updateExercise(index, "who", e.target.value)}>{["CP", "AC1", "AC2", "PP", "RV"].map((code) => <option key={code}>{code}</option>)}</select></label><label>Temps<input type="number" min={0} value={exercise.duration_minutes} onChange={(e) => updateExercise(index, "duration_minutes", Number(e.target.value))} /></label></div><textarea value={exercise.explanation} placeholder="Déroulement" onChange={(e) => updateExercise(index, "explanation", e.target.value)} /><textarea value={exercise.instructions} placeholder="Consignes ou variantes" onChange={(e) => updateExercise(index, "instructions", e.target.value)} /></div><div className="exerciseActions"><button disabled={index === 0} onClick={() => moveExercise(index, -1)}>↑</button><button disabled={index === exercises.length - 1} onClick={() => moveExercise(index, 1)}>↓</button><button className="dangerSmall" onClick={() => setExercises((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, sort_order: i })))}>Supprimer</button></div></article>)}</section>

    <div className="saveBar"><div><strong>{selectedPlayers.length} joueurs · {blocks.length} blocs · {exercises.length} exercices</strong><small>Les données sont enregistrées dans Supabase.</small></div><button onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer la séance"}</button></div>

    <style jsx>{`
      .page{min-height:100vh;background:#f2f0eb;color:#111;padding:34px 24px 110px}.loading{text-align:center}.hero{max-width:1400px;margin:0 auto 24px;background:#101012;color:white;border-radius:24px;padding:34px 38px;position:relative;overflow:hidden}.hero:after{content:"";position:absolute;width:300px;height:300px;border:70px solid #d4a24c33;border-radius:50%;right:-100px;top:-150px}.hero span{color:#d4a24c;font-size:12px;font-weight:900;letter-spacing:2px}.hero h1{font-size:42px;margin:8px 0 4px}.hero p{color:#bbb;margin:0}.panel{max-width:1400px;margin:18px auto;background:#fff;border-radius:22px;padding:24px;box-shadow:0 18px 50px #0000000c}.panelTitle{display:flex;align-items:center;gap:12px;margin-bottom:20px}.panelTitle>span{width:42px;height:42px;border-radius:14px;background:#111;color:#d4a24c;display:grid;place-items:center;font-weight:900}.panelTitle h2{margin:0;font-size:24px}.panelTitle p{margin:2px 0 0;color:#777}.panelTitle.horizontal .goldButton{margin-left:auto}.infoGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.infoGrid label,.blockHeader label,.exerciseMeta label{display:flex;flex-direction:column;gap:6px;font-weight:800;font-size:12px}.wide{grid-column:span 2}input,select,textarea{border:1px solid #dedbd5;border-radius:11px;padding:11px 12px;background:white;font:inherit}button{border:0;border-radius:10px;padding:10px 13px;font-weight:900;cursor:pointer}.coachLayout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:18px}.presenceRail{background:#111;color:white;border-radius:18px;padding:16px;align-self:start;position:sticky;top:15px}.railHeader{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:14px}.railHeader strong,.compositionToolbar strong{display:block;font-size:12px;letter-spacing:1px}.railHeader small,.compositionToolbar small{display:block;color:#999;margin-top:3px}.railHeader button{padding:6px 8px;background:#2a2a2d;color:white}.roster{display:flex;flex-direction:column;gap:8px}.rosterCard{display:flex;align-items:center;text-align:left;gap:10px;background:#1c1c1f;color:white;border:1px solid #333;width:100%;transition:.2s transform,.2s border-color,.2s background}.rosterCard:hover{transform:translateX(3px)}.rosterCard.selected{border-color:#d4a24c;background:#29251e}.rosterCard .check{width:26px;height:26px;border-radius:9px;background:#333;display:grid;place-items:center;color:#d4a24c}.rosterCard b,.rosterCard small{display:block}.rosterCard small{font-size:10px;color:#999;margin-top:2px}.compositionArea{min-width:0}.compositionToolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.presetButtons{display:flex;gap:7px;flex-wrap:wrap}.presetButtons button{background:#f0e8d9;color:#6b4a17}.compositionBlock{border:1px solid #e4dfd5;border-radius:18px;padding:16px;margin-bottom:16px;background:linear-gradient(135deg,#fff,#fbfaf7)}.tone1{border-top:4px solid #466a87}.tone2{border-top:4px solid #8a5d72}.tone3{border-top:4px solid #5e7c55}.tone0{border-top:4px solid #d4a24c}.blockHeader{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.blockIdentity{display:flex;flex-direction:column;min-width:230px;margin-right:auto}.blockIdentity span{font-size:10px;font-weight:900;color:#a5782d;letter-spacing:1px}.blockIdentity input{font-size:20px;font-weight:900;border:0;padding:3px 0}.blockHeader label{flex-direction:row;align-items:center}.blockHeader label input{width:64px}.auto{background:#111;color:#d4a24c}.iconDanger{background:#8b1028;color:#fff;font-size:18px}.blockPool{margin:14px 0;padding:11px;border:1px dashed #c8b48e;border-radius:13px;background:#faf5eb}.blockPool>span{font-size:10px;font-weight:900;color:#8a672b}.blockPool>div{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.miniPlayer{background:white;border:1px solid #ded7ca;border-radius:11px;padding:8px 10px;cursor:grab;box-shadow:0 5px 12px #00000008}.miniPlayer b,.miniPlayer small{display:block}.miniPlayer small{font-size:9px;color:#888}.teamGrid{display:grid;grid-template-columns:repeat(3,minmax(210px,1fr));gap:12px}.teamCard{border:1px solid #dedbd5;border-radius:16px;overflow:hidden;background:#fff;min-height:185px;transition:.2s transform,.2s box-shadow}.teamCard.isTarget{transform:translateY(-4px);box-shadow:0 15px 35px #d4a24c33}.teamHead{display:grid;grid-template-columns:34px 1fr 30px;align-items:center;background:#171719;padding:8px}.teamHead>span{width:25px;height:25px;border-radius:9px;background:#d4a24c;display:grid;place-items:center;font-weight:900}.teamHead input{border:0;background:transparent;color:white;font-weight:900;padding:6px}.teamHead button{background:transparent;color:#aaa;padding:4px}.slots{padding:9px}.slot{display:grid;grid-template-columns:38px 1fr;align-items:center;min-height:44px;border-bottom:1px solid #eee}.slot:last-child{border-bottom:0}.slot>div{grid-column:1/-1;display:grid;grid-template-columns:38px 1fr 25px;align-items:center;cursor:grab;animation:playerIn .25s ease}.slot .position{font-size:11px;font-weight:900;color:#a17226}.slot em{color:#aaa;font-size:11px}.slot b,.slot small{display:block}.slot small{font-size:9px;color:#888}.slot button{background:transparent;color:#999;padding:3px}.teamTone1 .teamHead{background:#284c68}.teamTone2 .teamHead{background:#6b374e}.teamTone3 .teamHead{background:#476040}.teamTone4 .teamHead{background:#5d4a2f}.addTeam{margin-top:11px;background:#eee9df;color:#664b20}.exercise{display:grid;grid-template-columns:55px 1fr auto;gap:14px;border:1px solid #e6e1d8;border-radius:16px;padding:14px;margin-top:11px}.exerciseIndex{font-size:28px;font-weight:900;color:#d4a24c}.exerciseContent{display:grid;grid-template-columns:1fr 180px;gap:10px}.exerciseTitle{font-size:18px;font-weight:900}.exerciseMeta{display:grid;grid-template-columns:1fr 1fr;gap:8px}.exercise textarea{grid-column:1/-1;min-height:72px}.exerciseActions{display:flex;flex-direction:column;gap:6px}.dangerSmall{background:#8b1028;color:#fff}.goldButton{background:#d4a24c}.saveBar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);width:min(1040px,calc(100% - 32px));background:#111;color:white;border-radius:18px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 18px 45px #0005;z-index:20}.saveBar strong,.saveBar small{display:block}.saveBar small{color:#999;margin-top:3px}.saveBar button{background:#d4a24c;color:#111;padding:14px 22px}@keyframes playerIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}@media(max-width:1100px){.coachLayout{grid-template-columns:1fr}.presenceRail{position:static}.roster{display:grid;grid-template-columns:repeat(3,1fr)}.teamGrid{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.page{padding:18px 12px 120px}.hero h1{font-size:30px}.infoGrid,.teamGrid,.roster{grid-template-columns:1fr}.wide{grid-column:auto}.compositionToolbar,.saveBar{align-items:flex-start}.exercise{grid-template-columns:40px 1fr}.exerciseActions{grid-column:2;flex-direction:row}.exerciseContent{grid-template-columns:1fr}.saveBar{flex-direction:column;gap:10px}.saveBar button{width:100%}}
    `}</style>
  </main>;
}