"use client";

import { useEffect, useMemo, useState } from "react";
import { createTeamNote, getTeamWorkspace, uploadTeamDocument, type ClubNote } from "@/lib/club-detail";
import type { ClubDocument, ClubPlayer, ClubTeam } from "@/lib/club-core";

const TABS = ["Dashboard", "Effectif", "Stats", "Documents", "Notes"] as const;
type Tab = (typeof TABS)[number];

export default function ClubTeamWorkspace({ clubId, teamId, onBack }: { clubId: string; teamId: string; onBack?: () => void }) {
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [team, setTeam] = useState<ClubTeam | null>(null);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [documents, setDocuments] = useState<ClubDocument[]>([]);
  const [performance, setPerformance] = useState<any[]>([]);
  const [notes, setNotes] = useState<ClubNote[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await getTeamWorkspace(clubId, teamId);
      setTeam(data.team); setPlayers(data.players); setDocuments(data.documents); setPerformance(data.performance); setNotes(data.notes);
    } catch (e: any) { setError(e?.message || "Équipe impossible à charger."); }
  }

  useEffect(() => { load(); }, [clubId, teamId]);

  const totals = useMemo(() => performance.reduce((a, r) => ({ points:a.points+Number(r.points||0), rebounds:a.rebounds+Number(r.rebounds||0), assists:a.assists+Number(r.assists||0) }), { points:0, rebounds:0, assists:0 }), [performance]);

  async function addNote() {
    const title = prompt("Titre de la note ?") || "";
    const body = prompt("Note ?") || "";
    if (!title && !body) return;
    const note = await createTeamNote({ clubId, teamId, title, body });
    setNotes((p) => [note, ...p]);
  }

  async function upload(file: File) {
    const doc = await uploadTeamDocument({ clubId, teamId, file });
    setDocuments((p) => [doc, ...p]);
  }

  return (
    <section className="box">
      <header><button className="back" onClick={onBack}>← Retour</button><div><p>FICHE ÉQUIPE</p><h2>{team?.name || "Équipe"}</h2><span>{team?.category} · {team?.gender} · {team?.season}</span></div></header>
      {error && <div className="alert">{error}</div>}
      <nav>{TABS.map((x) => <button key={x} className={tab === x ? "active" : ""} onClick={() => setTab(x)}>{x}</button>)}</nav>
      {tab === "Dashboard" && <div><div className="kpis"><b>{players.length}<small>joueurs</small></b><b>{totals.points}<small>points</small></b><b>{totals.rebounds}<small>rebonds</small></b><b>{totals.assists}<small>passes</small></b></div></div>}
      {tab === "Effectif" && <div className="table"><div className="row head"><span>Joueur</span><span>Licence</span><span>Paiement</span><span>Médical</span></div>{players.map((p) => <div className="row" key={p.id}><span>{p.lastName} {p.firstName}</span><span>{p.licenseStatus}</span><span>{p.paymentStatus}</span><span>{p.medicalStatus || "—"}</span></div>)}</div>}
      {tab === "Stats" && <div className="table"><div className="row head"><span>Joueur</span><span>PTS</span><span>REB</span><span>AST</span></div>{performance.map((r) => <div className="row" key={r.player_id}><span>{r.last_name} {r.first_name}</span><span>{r.points}</span><span>{r.rebounds}</span><span>{r.assists}</span></div>)}</div>}
      {tab === "Documents" && <div className="panel"><label className="upload">+ Document équipe<input hidden type="file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label><div className="cards">{documents.map((d) => <a key={d.id} href={d.fileUrl || "#"} target="_blank" className="card"><strong>{d.title}</strong><span>{d.category}</span></a>)}</div></div>}
      {tab === "Notes" && <div className="panel"><button onClick={addNote}>+ Note équipe</button>{notes.map((n) => <article className="card" key={n.id}><strong>{n.title || "Note"}</strong><p>{n.body}</p></article>)}</div>}

      <style jsx>{`
        .box{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        header{display:flex;gap:16px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.back{background:#fffaf2;color:#6b1a2c}
        header p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}header span{color:#6b7280;font-weight:800}
        button,.upload{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer;text-decoration:none;display:inline-block}
        nav{display:flex;gap:8px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid #eef2f7}nav button{background:#fffaf2;color:#6b1a2c}nav button.active{background:#6b1a2c;color:#fff}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;background:#fff0f0;color:#b91c1c;font-weight:900}
        .panel,.table{margin:18px;border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px}.kpis b{border:1px solid #eadfd5;background:#fff8ee;border-radius:20px;padding:18px;text-align:center;color:#6b1a2c;font-size:1.5rem}.kpis small{display:block;color:#6b7280;font-size:.72rem}
        .row{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;border-bottom:1px solid #eef2f7}.row span{padding:12px;font-weight:800}.row.head{background:#f8fafc;color:#6b7280}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:14px}.card{border:1px solid #eadfd5;border-radius:18px;padding:14px;text-decoration:none;color:#111827}.card strong,.card span{display:block}
        @media(max-width:760px){.kpis,.row{grid-template-columns:1fr}.row.head{display:none}}
      `}</style>

    </section>
  );
}
