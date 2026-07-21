"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { openFileSameTab } from "@/lib/client-file-actions";
import { cleanPracticeText, parsePracticeDuration, shortCoachCode } from "@/lib/practice-session-format";

type TeamCompositionBlock = { id: string; title: string; playersPerTeam: number; teams: Array<{ id: string; name: string; playerIds: string[] }> };
type Session = { id: string; team_id: string | null; title: string; theme: string | null; session_date: string | null; start_time: string | null; end_time: string | null; location: string | null; club_logo_url: string | null; mybasket_logo_url: string | null; pdf_url: string | null; team_composition_blocks?: TeamCompositionBlock[] | null; player_groups?: Record<string, string[]> | null };
type Player = { id: string; first_name: string | null; last_name: string | null; position: "guard" | "forward" | "center" };
type Exercise = { id: string; title: string; who: string | null; duration_minutes: number | null; situation_image_url: string | null; situation_image_urls?: string[] | null; image_urls?: string[] | null; schema_urls?: string[] | null; explanation: string | null; instructions: string | null; variants?: string | null; metadata?: Record<string, unknown> | null };

const PRESENT = new Set(["present", "late"]);
function normalizePosition(value?: string | null): Player["position"] { const p = String(value || "").toLowerCase(); if (p.includes("pivot") || p.includes("center") || p.includes("poste 5")) return "center"; if (p.includes("ailier") || p.includes("forward") || p.includes("poste 3") || p.includes("poste 4")) return "forward"; return "guard"; }
function name(player: Player) { return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(); }
function images(exercise: Exercise) { const metadata = exercise.metadata as Record<string, unknown> | null; return Array.from(new Set([exercise.situation_image_url, ...(exercise.situation_image_urls ?? []), ...(exercise.image_urls ?? []), ...(exercise.schema_urls ?? []), ...((metadata?.situation_image_urls as string[] | undefined) ?? []), ...((metadata?.image_urls as string[] | undefined) ?? []), ...((metadata?.schema_urls as string[] | undefined) ?? [])].filter((value): value is string => typeof value === "string" && Boolean(value)))); }
function blocksFrom(session: Session): TeamCompositionBlock[] { if (Array.isArray(session.team_composition_blocks) && session.team_composition_blocks.length) return session.team_composition_blocks; const entries = Object.entries(session.player_groups ?? {}); return entries.length ? [{ id: "legacy", title: "Équipes de travail", playersPerTeam: 0, teams: entries.map(([teamName, ids], index) => ({ id: `legacy-${index}`, name: teamName, playerIds: Array.isArray(ids) ? ids : [] })) }] : []; }

export default function SeanceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const supabase = createClient();
  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [ready, setReady] = useState(false);
  const [generating, setGenerating] = useState(false);

  const grouped = useMemo(() => ({ guard: players.filter((p) => p.position === "guard"), forward: players.filter((p) => p.position === "forward"), center: players.filter((p) => p.position === "center") }), [players]);
  const total = useMemo(() => exercises.reduce((sum, exercise) => sum + parsePracticeDuration(exercise.duration_minutes, 0), 0), [exercises]);
  const blocks = useMemo(() => session ? blocksFrom(session) : [], [session]);
  const byId = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  useEffect(() => { if (id) void load(id); }, [id]);

  async function load(sessionId: string) {
    setReady(false);
    const { data: sessionRow, error } = await supabase.from("practice_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (error || !sessionRow) { setSession(null); setReady(true); return; }
    const [{ data: direct }, { data: attendance }, { data: exerciseRows }] = await Promise.all([
      supabase.from("practice_session_players").select("*").eq("session_id", sessionId),
      supabase.from("practice_session_attendance").select("*").eq("session_id", sessionId),
      supabase.from("practice_session_exercises").select("*").eq("session_id", sessionId).order("sort_order", { ascending: true }),
    ]);
    const directPresent = (direct ?? []).filter((row: any) => row.selected !== false && (!row.status || PRESENT.has(String(row.status))));
    let ids = directPresent.map((row: any) => String(row.player_id || row.id || "")).filter(Boolean);
    if (!ids.length) ids = (attendance ?? []).filter((row: any) => PRESENT.has(String(row.status || "present"))).map((row: any) => String(row.player_id || "")).filter(Boolean);
    let roster: any[] = [];
    if (ids.length) { const { data } = await supabase.from("players").select("id, first_name, last_name, position_primary, position").in("id", Array.from(new Set(ids))); roster = data ?? []; }
    else if (sessionRow.team_id) { const { data } = await supabase.from("players").select("id, first_name, last_name, position_primary, position").eq("team_id", sessionRow.team_id).order("last_name"); roster = data ?? []; }
    setSession(sessionRow as Session);
    setPlayers(roster.map((player) => ({ id: player.id, first_name: player.first_name, last_name: player.last_name, position: normalizePosition(player.position_primary ?? player.position) })));
    setExercises((exerciseRows ?? []) as Exercise[]);
    setReady(true);
  }

  async function generatePdf() { if (!id) return; setGenerating(true); const response = await fetch(`/api/seances/${id}/pdf`, { method: "POST" }); const data = await response.json(); setGenerating(false); if (!response.ok) return alert(data.error ?? "Erreur génération PDF"); await load(id); openFileSameTab(data.pdfUrl); }
  async function remove() { if (!id || !confirm("Supprimer cette séance ?")) return; const { error } = await supabase.from("practice_sessions").delete().eq("id", id); if (error) return alert("Erreur suppression séance."); router.push("/mon-compte/seances"); }

  if (!ready) return <main className="page loading">Chargement de la séance…</main>;
  if (!session) return <main className="page loading">Séance introuvable.</main>;
  const fmtDate = session.session_date ? new Date(session.session_date).toLocaleDateString("fr-FR") : "—";

  return <main className="page">
    <div className="actions"><button onClick={() => router.push("/seances")}>← Retour</button><div><button onClick={() => router.push(`/seances/nouvelle?id=${id}`)}>✎ Modifier</button><button onClick={generatePdf} disabled={generating}>{generating ? "Génération…" : "↓ Télécharger PDF"}</button><button onClick={() => session.pdf_url ? openFileSameTab(session.pdf_url) : generatePdf()}>↗ Ouvrir PDF</button><button className="danger" onClick={remove}>Supprimer</button></div></div>

    <section className="hero"><div className="logo"><img src={session.mybasket_logo_url || "/logo-mybasket02.png"} alt="MyBasket" /></div><div className="heroText"><span>MYBASKET · PRACTICE PLAN</span><h1>{session.title}</h1><p>{fmtDate} · {(session.start_time || "").slice(0, 5)} — {(session.end_time || "").slice(0, 5)}</p><p>{session.theme || "Sans thème"} · {session.location || "Lieu non défini"} · {total} min</p></div><div className="logo">{session.club_logo_url ? <img src={session.club_logo_url} alt="Club" /> : <b>CLUB</b>}</div></section>

    <section className="present"><div className="sectionTitle"><span>01</span><div><h2>Joueurs présents</h2><p>Classés par poste principal</p></div></div><div className="positionGrid">{(["guard", "forward", "center"] as const).map((key) => <div key={key}><h3>{key === "guard" ? "GUARDS" : key === "forward" ? "FORWARDS" : "CENTERS"}</h3>{grouped[key].length ? grouped[key].map((player) => <div className="presentPlayer" key={player.id}><span>✓</span>{name(player)}</div>) : <p className="empty">—</p>}</div>)}</div></section>

    <section className="playbook"><div className="sectionTitle"><span>02</span><div><h2>Practice plan</h2><p>{exercises.length} exercice{exercises.length > 1 ? "s" : ""}</p></div></div>{exercises.map((exercise, index) => { const exerciseImages = images(exercise); return <article className="exerciseCard" key={exercise.id}><div className="exerciseHeader"><div><small>EXERCICE {String(index + 1).padStart(2, "0")}</small><h3>{exercise.title}</h3></div><div className="badges"><span>{shortCoachCode(exercise.who)}</span><b>{parsePracticeDuration(exercise.duration_minutes, 0)} MIN</b></div></div><div className={`schemas ${exerciseImages.length === 1 ? "single" : ""}`}>{exerciseImages.length ? exerciseImages.map((src, imageIndex) => <img key={`${src}-${imageIndex}`} src={src} alt={`Schéma ${imageIndex + 1}`} />) : <div className="placeholder">SCHÉMA NON DISPONIBLE</div>}</div><div className="copyGrid"><div><h4>DÉROULEMENT</h4><p>{cleanPracticeText(exercise.explanation) || "—"}</p></div><div className="goldCopy"><h4>CONSIGNES / VARIANTES</h4><p>{cleanPracticeText(exercise.instructions) || cleanPracticeText(exercise.variants) || "—"}</p></div></div></article>; })}</section>

    {blocks.length > 0 && <section className="compositions"><div className="sectionTitle"><span>03</span><div><h2>Compositions d’équipes</h2><p>{blocks.length} bloc{blocks.length > 1 ? "s" : ""} choisi{blocks.length > 1 ? "s" : ""}</p></div></div>{blocks.map((block, blockIndex) => <article className={`block tone${blockIndex % 4}`} key={block.id}><div className="blockTitle"><span>BLOC {String(blockIndex + 1).padStart(2, "0")}</span><div><h3>{block.title}</h3><p>{block.playersPerTeam > 0 ? `${block.playersPerTeam} joueurs par équipe` : "Groupes libres"}</p></div></div><div className="teamGrid">{block.teams.map((team, teamIndex) => { const teamPlayers = team.playerIds.map((playerId) => byId.get(playerId)).filter((player): player is Player => Boolean(player)); return <div className={`teamCard teamTone${teamIndex % 5}`} key={team.id}><div className="teamHeader"><span>{teamIndex + 1}</span><h4>{team.name}</h4></div><div className="teamPlayers">{teamPlayers.length ? teamPlayers.map((player) => <div className="teamPlayer" key={player.id}>• {name(player)}</div>) : <div className="teamPlayer empty">—</div>}</div></div>; })}</div></article>)}</section>}

    <style jsx>{`
      .page{max-width:1400px;margin:auto;padding:28px 22px 70px;background:#f3f1ec;color:#111}.loading{text-align:center;min-height:60vh;padding-top:100px}.actions{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:18px}.actions>div{display:flex;gap:8px;flex-wrap:wrap}.actions button{border:0;border-radius:10px;padding:10px 14px;font-weight:900;cursor:pointer}.danger{background:#8b1028;color:#fff}.hero{display:grid;grid-template-columns:130px 1fr 130px;align-items:center;background:#111;color:white;border-radius:24px;padding:24px;margin-bottom:18px}.logo{height:95px;background:#fff;border-radius:17px;display:grid;place-items:center;color:#111}.logo img{max-width:90px;max-height:78px;object-fit:contain}.heroText{text-align:center}.heroText span{color:#d4a24c;font-size:11px;font-weight:900;letter-spacing:2px}.heroText h1{font-size:38px;margin:8px 0}.heroText p{margin:4px;color:#ccc}.present,.playbook,.compositions{background:#fff;border-radius:22px;padding:24px;margin-top:18px}.sectionTitle{display:flex;align-items:center;gap:12px;margin-bottom:20px}.sectionTitle>span{width:43px;height:43px;border-radius:14px;background:#111;color:#d4a24c;display:grid;place-items:center;font-weight:900}.sectionTitle h2{margin:0;font-size:25px}.sectionTitle p{margin:2px 0;color:#777}.positionGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.positionGrid>div{border:1px solid #e5e1d9;border-radius:15px;overflow:hidden}.positionGrid h3{margin:0;background:#111;color:#d4a24c;padding:11px;font-size:12px;letter-spacing:1px}.presentPlayer{padding:10px 12px;border-top:1px solid #eee;font-weight:800}.presentPlayer span{color:#b58636;margin-right:8px}.empty{padding:10px}.exerciseCard{border:1px solid #e2ddd4;border-radius:19px;padding:18px;margin-top:15px;box-shadow:0 12px 30px #00000008}.exerciseHeader{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.exerciseHeader small{font-weight:900;color:#a4772a;letter-spacing:1.5px}.exerciseHeader h3{font-size:27px;margin:4px 0 14px}.badges{display:flex;gap:7px}.badges span,.badges b{border-radius:999px;padding:8px 11px;font-size:11px}.badges span{background:#111;color:white}.badges b{background:#d4a24c}.schemas{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;background:#f7f7f7;border-radius:15px;padding:10px}.schemas.single{grid-template-columns:1fr}.schemas img{width:100%;height:340px;object-fit:contain;background:#fff;border-radius:10px}.schemas.single img{height:500px}.placeholder{height:300px;display:grid;place-items:center;border:1px dashed #bbb;color:#888}.copyGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.copyGrid>div{background:#f1f1f1;border-radius:14px;padding:16px}.copyGrid .goldCopy{background:#f5eddf}.copyGrid h4{font-size:11px;letter-spacing:1px;color:#8c6523;margin:0 0 8px}.copyGrid p{line-height:1.55;margin:0;white-space:pre-wrap}.block{border:1px solid #e3ded5;border-top:4px solid #d4a24c;border-radius:18px;padding:17px;margin-top:15px}.tone1{border-top-color:#426b88}.tone2{border-top-color:#83566d}.tone3{border-top-color:#52764c}.blockTitle{display:flex;align-items:center;gap:10px;margin-bottom:13px}.blockTitle>span{background:#111;color:#d4a24c;border-radius:9px;padding:7px 9px;font-size:10px;font-weight:900}.blockTitle h3,.blockTitle p{margin:0}.blockTitle p{color:#777;font-size:12px;margin-top:2px}.teamGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.teamCard{border:1px solid #ddd;border-radius:15px;overflow:hidden}.teamHeader{display:flex;align-items:center;gap:9px;background:#171719;color:white;padding:10px}.teamHeader>span{width:27px;height:27px;border-radius:9px;background:#d4a24c;color:#111;display:grid;place-items:center;font-weight:900}.teamHeader h4{margin:0}.teamTone1 .teamHeader{background:#294d68}.teamTone2 .teamHeader{background:#67384d}.teamTone3 .teamHeader{background:#46613f}.teamTone4 .teamHeader{background:#5f4b31}.teamPlayers{padding:10px 12px}.teamPlayer{padding:7px 0;border-top:1px solid #eee;font-weight:800}.teamPlayer:first-child{border-top:0}@media(max-width:900px){.hero{grid-template-columns:90px 1fr 90px}.heroText h1{font-size:28px}.positionGrid,.teamGrid{grid-template-columns:1fr 1fr}.schemas img,.schemas.single img{height:280px}}@media(max-width:620px){.page{padding:16px 10px 50px}.hero{grid-template-columns:1fr}.logo{display:none}.positionGrid,.teamGrid,.copyGrid,.schemas{grid-template-columns:1fr}.exerciseHeader{flex-direction:column}.schemas img,.schemas.single img{height:240px}}
    `}</style>
  </main>;
}
