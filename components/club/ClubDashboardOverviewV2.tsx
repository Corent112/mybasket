"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getClubStats } from "@/lib/club-dashboard";

type TabKey =
  | "equipes" | "coachs" | "planning" | "calendrier" | "convocations"
  | "drive" | "communication" | "mailing" | "cotisations" | "relances"
  | "finance" | "performance" | "audit" | "parametres";

type Props = {
  clubId: string;
  clubName: string;
  logoUrl?: string | null;
  onNavigate: (tab: TabKey) => void;
};

type EventRow = {
  id: string;
  title: string;
  event_date: string;
  start_min?: number | null;
  event_type?: string | null;
  team_id?: string | null;
  location?: string | null;
};

function timeFromMin(value?: number | null) {
  if (value == null) return "";
  const h = Math.floor(value / 60);
  const m = value % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function pct(ok: number, total: number) {
  return total ? Math.round((ok / total) * 100) : 0;
}

export default function ClubDashboardOverviewV2({ clubId, clubName, logoUrl, onNavigate }: Props) {
  const [stats, setStats] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const today = new Date().toISOString().slice(0, 10);
      try {
        const [statsData, teamRes, playerRes, coachRes, eventRes] = await Promise.all([
          getClubStats(clubId),
          supabase.from("club_teams").select("*").eq("club_id", clubId).eq("status", "active").order("category"),
          supabase.from("club_players").select("*").eq("club_id", clubId).eq("status", "active").order("last_name"),
          supabase.from("club_coaches").select("*").eq("club_id", clubId).order("name"),
          supabase.from("club_events").select("id,title,event_date,start_min,event_type,team_id,location").eq("club_id", clubId).gte("event_date", today).order("event_date").order("start_min").limit(5),
        ]);
        if (cancelled) return;
        setStats(statsData);
        setTeams(teamRes.data || []);
        setPlayers(playerRes.data || []);
        setCoaches(coachRes.data || []);
        setEvents((eventRes.data || []) as EventRow[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [clubId]);

  const alerts = useMemo(() => {
    const licences = players.filter((p) => !["valid", "ok"].includes(String(p.license_status || "pending"))).length;
    const payments = players.filter((p) => !["paid", "ok"].includes(String(p.payment_status || "pending"))).length;
    const medical = players.filter((p) => ["missing", "pending"].includes(String(p.medical_status || ""))).length;
    return [
      { label: `${licences} licence${licences > 1 ? "s" : ""} à finaliser`, value: licences, tab: "communication" as const },
      { label: `${payments} cotisation${payments > 1 ? "s" : ""} en attente`, value: payments, tab: "relances" as const },
      { label: `${medical} dossier${medical > 1 ? "s" : ""} médical${medical > 1 ? "ux" : ""}`, value: medical, tab: "communication" as const },
    ].filter((x) => x.value > 0);
  }, [players]);

  const teamCards = useMemo(() => teams.slice(0, 5).map((team) => {
    const tp = players.filter((p) => p.team_id === team.id);
    const valid = tp.filter((p) => ["valid", "ok"].includes(String(p.license_status || ""))).length;
    const coach = coaches.find((c) => c.user_id === team.coach_id || c.id === team.coach_id);
    return { ...team, count: tp.length, completion: pct(valid, tp.length), coachName: coach?.name || "Non affecté" };
  }), [teams, players, coaches]);

  if (loading && !stats) return <div className="loading">Chargement du dashboard…</div>;

  return (
    <div className="dash">
      <section className="welcome">
        <div><p>DASHBOARD CLUB</p><h1>Bonjour 👋</h1><span>Voici la situation de {clubName} aujourd’hui.</span></div>
        {logoUrl && <img src={logoUrl} alt="" />}
      </section>

      <section className="kpis">
        <button onClick={() => onNavigate("equipes")}><i>👥</i><b>{stats?.playersCount ?? players.length}</b><small>Joueurs</small><em>Voir tous les joueurs →</em></button>
        <button onClick={() => onNavigate("equipes")}><i>🏀</i><b>{stats?.teamsCount ?? teams.length}</b><small>Équipes</small><em>Voir toutes les équipes →</em></button>
        <button onClick={() => onNavigate("coachs")}><i>🧑‍🏫</i><b>{stats?.coachesCount ?? coaches.length}</b><small>Coachs</small><em>Gérer les coachs →</em></button>
        <button onClick={() => onNavigate("relances")}><i>⚠</i><b>{alerts.length}</b><small>Alertes</small><em>Traiter les alertes →</em></button>
      </section>

      <section className="two">
        <article className="card">
          <header><h2>À traiter</h2><button onClick={() => onNavigate("relances")}>Tout traiter →</button></header>
          <div className="rows">
            {alerts.length ? alerts.map((a, i) => <button className={`alert a${i}`} key={a.label} onClick={() => onNavigate(a.tab)}><span>{i === 0 ? "🔴" : i === 1 ? "🟠" : "🟡"} {a.label}</span><b>Voir →</b></button>) : <div className="empty">✓ Rien d’urgent.</div>}
          </div>
        </article>

        <article className="card">
          <header><h2>Prochains événements</h2><button onClick={() => onNavigate("calendrier")}>Voir calendrier →</button></header>
          <div className="events">
            {events.length ? events.map((e) => {
              const d = new Date(`${e.event_date}T12:00:00`);
              const team = teams.find((t) => t.id === e.team_id);
              return <button className="event" key={e.id} onClick={() => onNavigate("calendrier")}><div className="date"><small>{d.toLocaleDateString("fr-FR", { weekday:"short" }).replace(".","").toUpperCase()}</small><b>{d.getDate()}</b><small>{d.toLocaleDateString("fr-FR", { month:"short" }).replace(".","").toUpperCase()}</small></div><div className="info"><strong>{team?.name ? `${team.name} · ` : ""}{e.title}</strong><span>{timeFromMin(e.start_min)} {e.location ? `· ${e.location}` : ""}</span></div><em>{e.event_type || "Événement"}</em></button>;
            }) : <div className="empty">Aucun événement à venir.</div>}
          </div>
        </article>
      </section>

      <section className="card">
        <header><h2>Mes équipes</h2><button onClick={() => onNavigate("equipes")}>Voir toutes les équipes →</button></header>
        <div className="teamGrid">
          {teamCards.map((t) => <button className="team" key={t.id} onClick={() => onNavigate("equipes")}><div className="teamTop"><span>{t.category || "TEAM"}</span><div><strong>{t.name}</strong><small>{t.count} joueurs</small></div></div><p>Coach principal <b>{t.coachName}</b></p><div className="pl"><span>Dossiers licences</span><b>{t.completion}%</b></div><div className="bar"><i style={{width:`${t.completion}%`}} /></div><em>Ouvrir l’équipe →</em></button>)}
          <button className="team add" onClick={() => onNavigate("equipes")}><b>＋</b><span>Nouvelle équipe</span></button>
        </div>
      </section>

      <section className="bottom">
        <article className="card"><header><h2>Cotisations</h2></header><div className="money"><div className="ring"><strong>{players.length}</strong><span>dossiers</span></div><div><b>{players.filter((p) => ["paid","ok"].includes(String(p.payment_status||""))).length}</b><span> à jour</span><br/><b>{players.filter((p) => !["paid","ok"].includes(String(p.payment_status||""))).length}</b><span> à relancer</span></div></div><button className="link" onClick={() => onNavigate("cotisations")}>Voir le détail →</button></article>
        <article className="card"><header><h2>Accès rapides</h2></header><div className="quick"><button onClick={() => onNavigate("calendrier")}>📅<span>Nouvel événement</span></button><button onClick={() => onNavigate("communication")}>✉️<span>Envoyer un email</span></button><button onClick={() => onNavigate("relances")}>€<span>Relancer cotisations</span></button><button onClick={() => onNavigate("equipes")}>👤＋<span>Ajouter un joueur</span></button></div></article>
      </section>

      <style jsx>{`
        .dash{display:grid;gap:18px;min-width:0}.loading,.empty{padding:28px;text-align:center;color:#777;font-weight:800}.welcome{display:flex;justify-content:space-between;align-items:center;gap:16px}.welcome p{margin:0;color:var(--club-secondary);font-size:.72rem;letter-spacing:.14em;font-weight:1000}.welcome h1{margin:5px 0 3px;font-size:2rem}.welcome span{color:#6b7280;font-weight:700}.welcome img{width:64px;height:64px;object-fit:contain}
        .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.kpis button{min-width:0;border:1px solid #e8e1db;background:#fff;border-radius:18px;padding:18px;display:grid;grid-template-columns:auto 1fr;column-gap:14px;text-align:left;cursor:pointer}.kpis i{grid-row:1/4;width:52px;height:52px;border-radius:50%;background:color-mix(in srgb,var(--club-secondary) 15%,white);display:grid;place-items:center;font-style:normal}.kpis b{font-size:2rem;line-height:1}.kpis small{text-transform:uppercase;font-weight:900}.kpis em{font-style:normal;color:var(--club-secondary);font-weight:900;font-size:.76rem;margin-top:9px}
        .two,.bottom{display:grid;grid-template-columns:1fr 1.1fr;gap:18px;min-width:0}.card{min-width:0;border:1px solid #e8e1db;background:#fff;border-radius:18px;padding:17px}.card>header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.card h2{margin:0;font-size:1rem;text-transform:uppercase}.card header button,.link{border:0;background:transparent;color:var(--club-secondary);font-weight:900;cursor:pointer}.rows,.events{display:grid;gap:8px}.alert{width:100%;border:1px solid #eee3dc;border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;gap:10px;text-align:left;background:#fff7f4}.alert span{min-width:0;overflow-wrap:anywhere}.a1{background:#fff9ef}.a2{background:#fffbed}
        .event{width:100%;min-width:0;border:0;border-top:1px solid #eee;background:#fff;display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 0;text-align:left;cursor:pointer}.event:first-child{border-top:0}.date{text-align:center;border-right:1px solid #eee}.date b{display:block;font-size:1.35rem}.date small{font-size:.61rem}.info{min-width:0}.info strong,.info span{display:block;overflow-wrap:anywhere}.info span{color:#777;font-size:.77rem;margin-top:4px}.event>em{font-style:normal;background:#fff7e8;color:#9a6800;padding:6px 8px;border-radius:8px;font-size:.66rem;white-space:nowrap}
        .teamGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.team{min-width:0;border:1px solid #e8e1db;border-radius:15px;background:#fff;padding:14px;text-align:left;cursor:pointer}.teamTop{display:flex;gap:10px;align-items:center}.teamTop>span{width:42px;height:42px;border-radius:10px;background:var(--club-primary);color:var(--club-secondary);display:grid;place-items:center;font-size:.69rem;font-weight:1000;flex:0 0 auto}.teamTop div{min-width:0}.teamTop strong,.teamTop small{display:block;overflow-wrap:anywhere}.teamTop small{color:#777}.team p{font-size:.74rem;color:#777}.team p b{display:block;color:#222}.pl{display:flex;justify-content:space-between;gap:8px;font-size:.7rem}.bar{height:6px;border-radius:999px;background:#eee;overflow:hidden;margin:6px 0 12px}.bar i{display:block;height:100%;background:#35a268}.team>em{display:block;border:1px solid var(--club-secondary);border-radius:8px;padding:8px;text-align:center;color:var(--club-secondary);font-style:normal;font-size:.7rem;font-weight:900}.add{display:grid;place-items:center;text-align:center;border-style:dashed;min-height:165px}.add b{font-size:2rem}
        .money{display:flex;gap:22px;align-items:center}.ring{width:115px;height:115px;border-radius:50%;background:conic-gradient(var(--club-secondary) 0 72%,#f1e9df 72%);display:grid;place-items:center;align-content:center;border:14px solid #fff;outline:1px solid #eee}.ring strong{font-size:1.5rem}.ring span{font-size:.68rem}.money>div:last-child b{font-size:1.25rem;color:var(--club-secondary)}.money>div:last-child span{color:#777}.link{width:100%;text-align:right;padding-top:12px}.quick{display:grid;grid-template-columns:1fr 1fr;gap:10px}.quick button{border:1px solid #e8e1db;border-radius:12px;background:#fff;padding:15px;display:grid;gap:7px;place-items:center;cursor:pointer}.quick span{font-size:.73rem;font-weight:800}
        @media(max-width:1150px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.teamGrid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:800px){.two,.bottom{grid-template-columns:1fr}.teamGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:540px){.kpis,.teamGrid{grid-template-columns:1fr}.event{grid-template-columns:48px minmax(0,1fr)}.event>em{display:none}}
      `}</style>
    </div>
  );
}
