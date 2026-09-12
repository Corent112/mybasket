"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import InstitutionalResources from "@/components/institutionnel/InstitutionalResources";

type WorkflowStatus = "reviewing" | "validated" | "archived";
type Tab = "base" | "referrals" | "detections" | "transfers";

type Player = {
  id: string;
  structure_id: string;
  first_name: string;
  last_name: string;
  birthdate: string | null;
  club_name: string | null;
  category: string | null;
  photo_url: string | null;
  email: string | null;
  phone: string | null;
  sex: string | null;
  height_cm: number | null;
  status: string | null;
  archived: boolean;
  profile_data: any;
  workflow_status: WorkflowStatus;
};

type Referral = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  birthdate: string | null;
  club_name: string | null;
  category: string | null;
  reporter_role: string | null;
  reporter_name: string | null;
  reporter_email: string;
  reporter_phone?: string | null;
  venue: string | null;
  home_team: string | null;
  away_team: string | null;
  jersey_color: string | null;
  jersey_number: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  converted_player_id?: string | null;
};

type Event = {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
  start_time: string | null;
  location: string | null;
};

type Participant = { id: string; event_id: string; player_id: string; status: string };
type Transfer = { id: string; target_email: string; target_label: string | null; access_level: string; status: string; created_at: string };
type Season = { id: string; season_label: string };
type Share = { id: string; player_id: string; source_structure_id: string; access_level: string; institutional_players?: Player | null };

const EVENT_LABELS: Record<string, string> = {
  detection: "Détection",
  camp: "Stage",
  selection: "Sélection",
  tournament: "Tournoi intercomités",
  pole_test: "Tests Pôle",
  other: "Autre",
};

const STATUS_LABELS: Record<string, string> = {
  invited: "Invité",
  confirmed: "Confirmé",
  present: "Présent",
  absent: "Absent",
  preselected: "Présélectionné",
  selected: "Sélectionné",
  waiting: "Liste d'attente",
  not_selected: "Non retenu",
};

const fmtDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("fr-FR") : "—";

const safeProfile = (player?: Player | null) => player?.profile_data || {};

export default function InstitutionalPlayerWorkflow({ structureId }: { structureId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("base");
  const [players, setPlayers] = useState<Player[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [parts, setParts] = useState<Participant[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [referralToken, setReferralToken] = useState("");
  const [referralUrl, setReferralUrl] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [activeEvent, setActiveEvent] = useState("");
  const [busy, setBusy] = useState("");
  const [showDocs, setShowDocs] = useState(false);
  const [openedReferral, setOpenedReferral] = useState<string | null>(null);
  const [openedPlayerId, setOpenedPlayerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [clubFilter, setClubFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [seasonLabel, setSeasonLabel] = useState(`${new Date().getFullYear()}-${new Date().getFullYear() + 1}`);
  const [eform, setEform] = useState({
    title: "Journée de détection",
    event_type: "detection",
    event_date: new Date().toISOString().slice(0, 10),
    start_time: "09:00",
    location: "",
  });
  const [tform, setTform] = useState({ target_email: "", target_label: "", access_level: "editor", message: "" });

  const openedPlayer = players.find((p) => p.id === openedPlayerId) || null;

  async function loadPlayersAndReferrals(preferPlayer?: string) {
    const r = await fetch(`/api/institutionnel/players?structureId=${encodeURIComponent(structureId)}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return alert(j.error || "Lecture des joueurs impossible");
    setPlayers((j.players || []) as Player[]);
    setReferrals((j.referrals || []) as Referral[]);
    if (preferPlayer) setOpenedPlayerId(preferPlayer);
  }

  async function loadSupportingData() {
    const [e, pa, t, sh, st, ss] = await Promise.all([
      sb.from("institutional_detection_events").select("*").eq("structure_id", structureId).eq("archived", false).order("event_date", { ascending: false }),
      sb.from("institutional_detection_participants").select("*"),
      sb.from("institutional_player_transfers").select("id,target_email,target_label,access_level,status,created_at").eq("source_structure_id", structureId).order("created_at", { ascending: false }),
      sb.from("institutional_player_shares").select("id,player_id,source_structure_id,access_level,institutional_players(id,structure_id,first_name,last_name,birthdate,club_name,category,photo_url,email,phone,sex,height_cm,status,archived,profile_data)").eq("target_structure_id", structureId).is("revoked_at", null).order("granted_at", { ascending: false }),
      sb.from("institutional_structures").select("player_referral_token").eq("id", structureId).maybeSingle(),
      sb.from("institutional_player_tracking_seasons").select("id,season_label").eq("structure_id", structureId).eq("archived", false).order("season_label", { ascending: false }),
    ]);
    setEvents((e.data || []) as Event[]);
    const eventIds = new Set((e.data || []).map((x: any) => x.id));
    setParts(((pa.data || []) as Participant[]).filter((x) => eventIds.has(x.event_id)));
    setTransfers((t.data || []) as Transfer[]);
    setShares(((sh.data || []) as unknown) as Share[]);
    setReferralToken(String(st.data?.player_referral_token || ""));
    setSeasons((ss.data || []) as Season[]);
    if (!activeEvent && e.data?.[0]?.id) setActiveEvent(e.data[0].id);
  }

  async function ensureReferralLink() {
    const r = await fetch("/api/institutionnel/referral-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structureId }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      setReferralToken(String(j.token || ""));
      setReferralUrl(String(j.url || ""));
    }
  }

  async function load() {
    await Promise.all([loadPlayersAndReferrals(), loadSupportingData(), ensureReferralLink()]);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureId]);

  async function playerAction(action: string, payload: Record<string, unknown> = {}) {
    setBusy(action);
    const r = await fetch("/api/institutionnel/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structureId, action, ...payload }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) {
      alert(j.error || "Action impossible");
      return null;
    }
    return j;
  }

  async function convertReferral(referralId: string) {
    const j = await playerAction("convert_referral", { referralId });
    if (!j?.player?.id) return;
    await loadPlayersAndReferrals(String(j.player.id));
    setTab("referrals");
  }

  async function dismissReferral(referralId: string) {
    if (!confirm("Ignorer ce signalement ? Il restera dans l'historique mais ne sera plus à traiter.")) return;
    const j = await playerAction("dismiss_referral", { referralId });
    if (j) await loadPlayersAndReferrals();
  }

  async function savePlayer(data: PlayerEditData, validate = false) {
    if (!openedPlayer) return;
    const action = validate ? "validate_player" : "save_player";
    const j = await playerAction(action, { playerId: openedPlayer.id, player: data });
    if (!j) return;
    await loadPlayersAndReferrals(openedPlayer.id);
    if (validate) setTab("base");
  }

  async function archivePlayer() {
    if (!openedPlayer) return;
    if (!confirm(`Archiver ${openedPlayer.first_name} ${openedPlayer.last_name} ?`)) return;
    const j = await playerAction("archive_player", { playerId: openedPlayer.id });
    if (!j) return;
    setOpenedPlayerId(null);
    await loadPlayersAndReferrals();
  }

  async function restorePlayer(playerId: string) {
    const j = await playerAction("restore_player", { playerId });
    if (j) await loadPlayersAndReferrals(playerId);
  }

  async function deletePlayer() {
    if (!openedPlayer) return;
    if (!confirm("Supprimer définitivement cette fiche joueur ?\n\nCette action est réservée aux erreurs, doublons ou fiches sans intérêt.")) return;
    const j = await playerAction("delete_player", { playerId: openedPlayer.id });
    if (!j) return;
    setOpenedPlayerId(null);
    setSelected((v) => v.filter((id) => id !== openedPlayer.id));
    await loadPlayersAndReferrals();
  }

  const toggle = (id: string) => setSelected((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  async function createEvent() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user || !eform.title.trim()) return;
    const q = await sb.from("institutional_detection_events").insert({ structure_id: structureId, ...eform, location: eform.location || null, created_by: user.id }).select("id").single();
    if (q.error) return alert(q.error.message);
    setActiveEvent(q.data.id);
    await loadSupportingData();
  }

  async function addToEvent() {
    if (!activeEvent || !selected.length) return alert("Sélectionne une journée et au moins un joueur validé.");
    const rows = selected.map((player_id) => ({ event_id: activeEvent, player_id, status: "invited" }));
    const q = await sb.from("institutional_detection_participants").upsert(rows, { onConflict: "event_id,player_id" });
    if (q.error) return alert(q.error.message);
    await loadSupportingData();
  }

  async function patchStatus(id: string, status: string) {
    const { data: { user } } = await sb.auth.getUser();
    const q = await sb.from("institutional_detection_participants").update({ status, updated_by: user?.id || null, updated_at: new Date().toISOString() }).eq("id", id);
    if (q.error) return alert(q.error.message);
    setParts((v) => v.map((x) => (x.id === id ? { ...x, status } : x)));
  }

  async function sendTransfer() {
    if (!selected.length) return alert("Sélectionne au moins un joueur dans Base joueurs.");
    if (!tform.target_email.trim()) return alert("Renseigne l'email de la structure destinataire.");
    setBusy("transfer");
    const r = await fetch("/api/institutionnel/player-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ structureId, playerIds: selected, ...tform }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return alert(j.error || "Envoi impossible");
    setTform({ target_email: "", target_label: "", access_level: "editor", message: "" });
    await loadSupportingData();
    alert("Invitation envoyée.");
  }

  async function createSeason() {
    const label = seasonLabel.trim();
    if (!label) return alert("Renseigne le nom de la saison.");
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    if (seasons.some((x) => x.season_label.toLowerCase() === label.toLowerCase())) return alert("Cette saison existe déjà.");
    const q = await sb.from("institutional_player_tracking_seasons").insert({ structure_id: structureId, season_label: label, created_by: user.id }).select("id").single();
    if (q.error) return alert(q.error.message);
    await loadSupportingData();
  }

  function copyReferralLink() {
    const url = referralUrl || `${window.location.origin}/signalement-joueur/${referralToken}`;
    navigator.clipboard?.writeText(url).then(() => alert("Lien copié")).catch(() => prompt("Copiez ce lien", url));
  }

  const reviewingPlayers = players.filter((p) => p.workflow_status === "reviewing");
  const validatedPlayers = players.filter((p) => p.workflow_status === "validated" && !p.archived);
  const archivedPlayers = players.filter((p) => p.workflow_status === "archived" || (p.archived && p.workflow_status !== "reviewing"));
  const pendingReferrals = referrals.filter((r) => r.status === "new" || r.status === "reviewing");
  const handledReferrals = referrals.filter((r) => !pendingReferrals.includes(r));
  const clubs = [...new Set(validatedPlayers.map((p) => p.club_name).filter(Boolean) as string[])].sort();
  const categories = [...new Set(validatedPlayers.map((p) => p.category).filter(Boolean) as string[])].sort();
  const basePool = showArchived ? [...validatedPlayers, ...archivedPlayers] : validatedPlayers;
  const filteredPlayers = basePool.filter((p) => {
    const haystack = `${p.first_name} ${p.last_name} ${p.club_name || ""} ${p.category || ""}`.toLowerCase();
    return (!search.trim() || haystack.includes(search.trim().toLowerCase())) && (!clubFilter || p.club_name === clubFilter) && (!categoryFilter || p.category === categoryFilter);
  });
  const currentParts = parts.filter((x) => x.event_id === activeEvent);
  const pMap = new Map<string, Player>(validatedPlayers.map((p) => [p.id, p]));

  return (
    <div className="wf">
      <div className="hero">
        <div>
          <p>INSTITUTION · JOUEURS</p>
          <h2>Du signalement à la fiche joueur, sans doublon</h2>
          <span>Un signalement crée une seule vraie fiche. Elle reste à étudier jusqu'à validation, puis rejoint la Base joueurs.</span>
        </div>
        <div className="heroStats">
          <b>{validatedPlayers.length}<small>Base joueurs</small></b>
          <b>{pendingReferrals.length + reviewingPlayers.length}<small>À traiter</small></b>
        </div>
      </div>

      <nav className="tabs">
        <button className={tab === "base" ? "on" : ""} onClick={() => setTab("base")}>Base joueurs <em>{validatedPlayers.length}</em></button>
        <button className={tab === "referrals" ? "on" : ""} onClick={() => setTab("referrals")}>Signalements <em>{pendingReferrals.length + reviewingPlayers.length}</em></button>
        <button className={tab === "detections" ? "on" : ""} onClick={() => setTab("detections")}>Détections & sélections</button>
        <button className={tab === "transfers" ? "on" : ""} onClick={() => setTab("transfers")}>Passations</button>
      </nav>

      {tab === "base" && (
        <>
          <section className="toolbar card">
            <div className="searchBox">⌕<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un joueur, un club…" /></div>
            <select value={clubFilter} onChange={(e) => setClubFilter(e.target.value)}><option value="">Tous les clubs</option>{clubs.map((x) => <option key={x}>{x}</option>)}</select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">Toutes les catégories</option>{categories.map((x) => <option key={x}>{x}</option>)}</select>
            <label className="archiveToggle"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Afficher les archivés</label>
          </section>

          <section className="card">
            <div className="sectionHead">
              <div><p>BASE JOUEURS</p><h3>{filteredPlayers.length} fiche(s)</h3></div>
              {selected.length > 0 && <span className="selectionCount">{selected.length} sélectionné(s)</span>}
            </div>
            <div className="playerGrid">
              {filteredPlayers.map((p) => {
                const archived = p.workflow_status === "archived" || p.archived;
                const profile = safeProfile(p);
                return <article className={`playerCard ${archived ? "archived" : ""}`} key={p.id} onClick={() => setOpenedPlayerId(p.id)}>
                  <label className="selectPlayer" onClick={(e) => e.stopPropagation()}><input type="checkbox" disabled={archived} checked={selected.includes(p.id)} onChange={() => toggle(p.id)} /><span /></label>
                  <div className="avatar">{p.photo_url ? <img src={p.photo_url} alt="" /> : `${p.first_name?.[0] || "?"}${p.last_name?.[0] || ""}`}</div>
                  <div className="playerMain">
                    <div className="nameLine"><b>{p.first_name} {p.last_name}</b><span className={`badge ${archived ? "gray" : "green"}`}>{archived ? "Archivé" : "Validé"}</span></div>
                    <span>{p.club_name || "Club non renseigné"}</span>
                    <small>{p.category || "Catégorie —"} · {p.birthdate ? `né(e) en ${p.birthdate.slice(0, 4)}` : "naissance —"}{profile.position ? ` · ${profile.position}` : ""}</small>
                  </div>
                  <button className="openBtn" onClick={(e) => { e.stopPropagation(); setOpenedPlayerId(p.id); }}>Ouvrir →</button>
                </article>;
              })}
              {!filteredPlayers.length && <div className="empty">Aucune fiche ne correspond aux filtres.</div>}
            </div>
          </section>

          {selected.length > 0 && <section className="bulk card"><div><b>{selected.length} joueur(s) sélectionné(s)</b><span>Utilise cette sélection dans Détections & sélections ou Passations.</span></div><div><button onClick={() => setTab("detections")}>Ajouter à une détection</button><button className="ghost" onClick={() => setTab("transfers")}>Passer les fiches</button><button className="ghost" onClick={() => setShowDocs((v) => !v)}>Documents</button></div></section>}

          {shares.length > 0 && <section className="card"><div className="sectionHead"><div><p>FICHES REÇUES</p><h3>Partagées par d'autres structures</h3></div></div><div className="sharedGrid">{shares.map((sh) => { const p: any = sh.institutional_players; return p ? <article key={sh.id}><div className="avatar small">{p.photo_url ? <img src={p.photo_url} alt="" /> : p.first_name?.[0] || "?"}</div><div><b>{p.first_name} {p.last_name}</b><span>{p.club_name || "Club —"} · droit {sh.access_level}</span></div></article> : null; })}</div></section>}
        </>
      )}

      {tab === "referrals" && (
        <>
          <section className="card referralAccess">
            <div className="sectionHead"><div><p>SIGNALEMENTS</p><h3>Lien permanent de signalement</h3></div><span>{pendingReferrals.length} nouveau(x)</span></div>
            <p className="hint">Les clubs peuvent transmettre un joueur même sans connaître son identité. Toutes les informations reçues sont conservées dans la fiche créée.</p>
            <div className="referralLink"><code>{referralUrl || "Création du lien…"}</code><button className="ghost" disabled={!referralToken} onClick={copyReferralLink}>Copier</button>{referralUrl && <button className="ghost" onClick={() => window.open(referralUrl, "_blank", "noopener,noreferrer")}>Ouvrir</button>}</div>
          </section>

          {reviewingPlayers.length > 0 && <section className="card reviewSection"><div className="sectionHead"><div><p>FICHES À ÉTUDIER</p><h3>Travail en cours</h3></div><span>{reviewingPlayers.length}</span></div><div className="reviewGrid">{reviewingPlayers.map((p) => <article key={p.id} onClick={() => setOpenedPlayerId(p.id)}><div className="avatar">{p.photo_url ? <img src={p.photo_url} alt="" /> : p.first_name?.[0] || "?"}</div><div><b>{p.first_name} {p.last_name}</b><span>{p.club_name || "Club à confirmer"} · {p.category || "Catégorie —"}</span><small>À étudier / En observation</small></div><button>Continuer la fiche →</button></article>)}</div></section>}

          <section className="card">
            <div className="sectionHead"><div><p>À TRAITER</p><h3>Signalements reçus</h3></div><span>{pendingReferrals.length}</span></div>
            <div className="refList">{pendingReferrals.map((r) => {
              const open = openedReferral === r.id;
              return <article key={r.id} className={open ? "open" : ""}>
                <div className="refTop" onClick={() => setOpenedReferral(open ? null : r.id)}>
                  <div className="refIcon">!</div>
                  <div><b>{[r.first_name, r.last_name].filter(Boolean).join(" ") || `Joueur #${r.jersey_number || "?"}`}</b><span>{r.club_name || [r.home_team, r.away_team].filter(Boolean).join(" / ") || "Club non identifié"} · {r.category || "Catégorie —"}</span><small>📍 {r.venue || "Lieu —"} · 👕 {r.jersey_color || "couleur —"} · #{r.jersey_number || "—"} · {fmtDate(r.created_at)}</small></div>
                  <button className="ghost">{open ? "Réduire" : "Consulter"}</button>
                </div>
                {open && <div className="refDetail">
                  <div className="infoGrid"><Info label="Prénom" value={r.first_name} /><Info label="Nom" value={r.last_name} /><Info label="Naissance" value={fmtDate(r.birthdate)} /><Info label="Club" value={r.club_name} /><Info label="Catégorie" value={r.category} /><Info label="Maillot" value={[r.jersey_color, r.jersey_number ? `#${r.jersey_number}` : ""].filter(Boolean).join(" ")} /><Info label="Match / équipes" value={[r.home_team, r.away_team].filter(Boolean).join(" — ")} /><Info label="Lieu" value={r.venue} /><Info label="Auteur" value={r.reporter_name || r.reporter_email} /><Info label="Fonction" value={r.reporter_role} /><Info label="Email" value={r.reporter_email} /><Info label="Téléphone" value={r.reporter_phone} /></div>
                  {r.reason && <div className="observation"><b>Observation reçue</b><p>{r.reason}</p></div>}
                  <div className="refActions"><button disabled={busy === "convert_referral"} onClick={() => convertReferral(r.id)}>Créer la fiche joueur</button><button className="dangerGhost" onClick={() => dismissReferral(r.id)}>Ignorer</button></div>
                </div>}
              </article>;
            })}{!pendingReferrals.length && <div className="empty">Tous les signalements ont été traités.</div>}</div>
          </section>

          {handledReferrals.length > 0 && <details className="card historyRefs"><summary>Historique des signalements traités ({handledReferrals.length})</summary><div>{handledReferrals.slice(0, 50).map((r) => <span key={r.id}>{fmtDate(r.created_at)} · {[r.first_name, r.last_name].filter(Boolean).join(" ") || `#${r.jersey_number || "?"}`} · {r.status}</span>)}</div></details>}
        </>
      )}

      {tab === "detections" && (
        <>
          <section className="card"><div className="sectionHead"><div><p>SAISONS</p><h3>Suivi institutionnel</h3></div><span>{seasons.length} saison(s)</span></div><div className="line"><input value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} placeholder="2026-2027" /><button onClick={createSeason}>+ Créer la saison</button></div></section>
          <section className="card"><div className="sectionHead"><div><p>DÉTECTIONS & SÉLECTIONS</p><h3>Créer une journée puis constituer le groupe</h3></div><span>{selected.length} joueur(s) sélectionné(s) depuis la base</span></div><div className="grid"><input value={eform.title} onChange={(e) => setEform({ ...eform, title: e.target.value })} /><select value={eform.event_type} onChange={(e) => setEform({ ...eform, event_type: e.target.value })}>{Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><input type="date" value={eform.event_date} onChange={(e) => setEform({ ...eform, event_date: e.target.value })} /><input type="time" value={eform.start_time} onChange={(e) => setEform({ ...eform, start_time: e.target.value })} /><input placeholder="Lieu" value={eform.location} onChange={(e) => setEform({ ...eform, location: e.target.value })} /><button onClick={createEvent}>+ Créer</button></div><div className="line"><select value={activeEvent} onChange={(e) => setActiveEvent(e.target.value)}><option value="">Choisir une journée</option>{events.map((e) => <option key={e.id} value={e.id}>{e.event_date} · {e.title}</option>)}</select><button onClick={addToEvent}>Ajouter les joueurs sélectionnés</button><button className="ghost" onClick={() => setTab("base")}>Choisir dans Base joueurs</button></div>{activeEvent && <div className="partList">{currentParts.map((x) => { const p = pMap.get(x.player_id); return p ? <div className="part" key={x.id}><b>{p.first_name} {p.last_name}</b><select value={x.status} onChange={(e) => patchStatus(x.id, e.target.value)}>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div> : null; })}</div>}</section>
        </>
      )}

      {tab === "transfers" && (
        <>
          <section className="card"><div className="sectionHead"><div><p>PASSATIONS</p><h3>Partager les mêmes fiches, sans les dupliquer</h3></div><span>{selected.length} sélectionné(s)</span></div><p className="hint">Sélectionne les joueurs dans Base joueurs. La fiche d'origine reste intacte et l'historique de transmission reste traçable.</p><div className="grid"><input type="email" placeholder="Email institution / club / fédé" value={tform.target_email} onChange={(e) => setTform({ ...tform, target_email: e.target.value })} /><input placeholder="Nom de la structure (facultatif)" value={tform.target_label} onChange={(e) => setTform({ ...tform, target_label: e.target.value })} /><select value={tform.access_level} onChange={(e) => setTform({ ...tform, access_level: e.target.value })}><option value="viewer">Lecture + PDF</option><option value="editor">Enrichir le suivi</option><option value="manager">Contrôle + retransmission</option></select><textarea placeholder="Message" value={tform.message} onChange={(e) => setTform({ ...tform, message: e.target.value })} /><button disabled={busy === "transfer"} onClick={sendTransfer}>{busy === "transfer" ? "Envoi…" : `Partager ${selected.length || ""} fiche(s)`}</button></div><div className="line"><button className="ghost" onClick={() => setTab("base")}>Choisir les joueurs dans la base</button><button className="ghost" onClick={() => setShowDocs((v) => !v)}>Préparer les documents</button></div><div className="history">{transfers.slice(0, 15).map((t) => <div key={t.id}><b>{t.target_label || t.target_email}</b><span>{t.status} · {t.access_level} · {fmtDate(t.created_at)}</span></div>)}</div></section>
          {showDocs && <section className="card"><div className="sectionHead"><div><p>DOCUMENTS</p><h3>Convocations, autorisations et modèles</h3></div><button className="ghost" onClick={() => setShowDocs(false)}>Fermer</button></div><InstitutionalResources structureId={structureId} compact categories={["Sélection / Stage", "Joueurs", "Administration", "Communication"]} /></section>}
        </>
      )}

      {openedPlayer && <PlayerDrawer player={openedPlayer} referral={referrals.find((r) => r.id === safeProfile(openedPlayer).sourceReferralId) || null} busy={busy} onClose={() => setOpenedPlayerId(null)} onSave={(data) => savePlayer(data, false)} onValidate={(data) => savePlayer(data, true)} onArchive={archivePlayer} onRestore={() => restorePlayer(openedPlayer.id)} onDelete={deletePlayer} />}

      <style jsx>{css}</style>
    </div>
  );
}

type PlayerEditData = {
  first_name: string; last_name: string; birthdate: string; club_name: string; category: string; email: string; phone: string; sex: string; photo_url: string; height_cm: string; position: string; jersey_number: string; jersey_color: string; observations: string; provenance: string;
};

function PlayerDrawer({ player, referral, busy, onClose, onSave, onValidate, onArchive, onRestore, onDelete }: { player: Player; referral: Referral | null; busy: string; onClose: () => void; onSave: (data: PlayerEditData) => void; onValidate: (data: PlayerEditData) => void; onArchive: () => void; onRestore: () => void; onDelete: () => void }) {
  const profile = safeProfile(player);
  const [form, setForm] = useState<PlayerEditData>({
    first_name: player.first_name || "",
    last_name: player.last_name || "",
    birthdate: player.birthdate || "",
    club_name: player.club_name || "",
    category: player.category || "",
    email: player.email || "",
    phone: player.phone || "",
    sex: player.sex || "",
    photo_url: player.photo_url || "",
    height_cm: player.height_cm ? String(player.height_cm) : "",
    position: profile.position || "",
    jersey_number: profile.jerseyNumber || "",
    jersey_color: profile.jerseyColor || "",
    observations: profile.observations || "",
    provenance: profile.provenance || (referral ? `Signalement du ${fmtDate(referral.created_at)} · ${referral.venue || "lieu non renseigné"}` : ""),
  });

  useEffect(() => {
    setForm({ first_name: player.first_name || "", last_name: player.last_name || "", birthdate: player.birthdate || "", club_name: player.club_name || "", category: player.category || "", email: player.email || "", phone: player.phone || "", sex: player.sex || "", photo_url: player.photo_url || "", height_cm: player.height_cm ? String(player.height_cm) : "", position: profile.position || "", jersey_number: profile.jerseyNumber || "", jersey_color: profile.jerseyColor || "", observations: profile.observations || "", provenance: profile.provenance || (referral ? `Signalement du ${fmtDate(referral.created_at)} · ${referral.venue || "lieu non renseigné"}` : "") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id]);

  const review = player.workflow_status === "reviewing";
  const archived = player.workflow_status === "archived" || (player.archived && !review);
  const patch = (key: keyof PlayerEditData, value: string) => setForm((v) => ({ ...v, [key]: value }));

  return <div className="drawerBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="drawer">
      <header className="drawerHead"><div><span className={`status ${review ? "amber" : archived ? "gray" : "green"}`}>{review ? "À étudier / En observation" : archived ? "Archivé" : "Base joueurs · Validé"}</span><h2>{form.first_name || "Joueur"} {form.last_name}</h2><small>{review ? "Complète la fiche à ton rythme puis valide-la quand elle est prête." : "Cette fiche reste modifiable à tout moment."}</small></div><button className="close" onClick={onClose} aria-label="Fermer">×</button></header>

      <div className="drawerScroll">
        <section className="identity">
          <div className="bigAvatar">{form.photo_url ? <img src={form.photo_url} alt="" /> : `${form.first_name?.[0] || "?"}${form.last_name?.[0] || ""}`}</div>
          <div className="formGrid">
            <label>Prénom<input value={form.first_name} onChange={(e) => patch("first_name", e.target.value)} /></label>
            <label>Nom<input value={form.last_name} onChange={(e) => patch("last_name", e.target.value)} /></label>
            <label>Date de naissance<input type="date" value={form.birthdate} onChange={(e) => patch("birthdate", e.target.value)} /></label>
            <label>Sexe<select value={form.sex} onChange={(e) => patch("sex", e.target.value)}><option value="">—</option><option value="female">Féminin</option><option value="male">Masculin</option><option value="other">Autre / non renseigné</option></select></label>
            <label>Club<input value={form.club_name} onChange={(e) => patch("club_name", e.target.value)} /></label>
            <label>Catégorie<input value={form.category} onChange={(e) => patch("category", e.target.value)} /></label>
            <label>Poste<input value={form.position} onChange={(e) => patch("position", e.target.value)} placeholder="Meneur, ailier…" /></label>
            <label>Taille (cm)<input inputMode="decimal" value={form.height_cm} onChange={(e) => patch("height_cm", e.target.value)} /></label>
            <label>N° maillot<input value={form.jersey_number} onChange={(e) => patch("jersey_number", e.target.value)} /></label>
            <label>Couleur maillot<input value={form.jersey_color} onChange={(e) => patch("jersey_color", e.target.value)} /></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => patch("email", e.target.value)} /></label>
            <label>Téléphone<input value={form.phone} onChange={(e) => patch("phone", e.target.value)} /></label>
            <label className="wide">Photo / avatar (URL)<input value={form.photo_url} onChange={(e) => patch("photo_url", e.target.value)} placeholder="https://…" /></label>
            <label className="wide">Observations<textarea value={form.observations} onChange={(e) => patch("observations", e.target.value)} placeholder="Observations, éléments à vérifier, points d'intérêt…" /></label>
            <label className="wide">Provenance<input value={form.provenance} onChange={(e) => patch("provenance", e.target.value)} /></label>
          </div>
        </section>

        {referral && <section className="sourceBox"><div><b>Signalement d'origine</b><span>Conservé comme provenance de cette fiche</span></div><div className="sourceGrid"><Info label="Date" value={fmtDate(referral.created_at)} /><Info label="Auteur" value={referral.reporter_name || referral.reporter_email} /><Info label="Rôle" value={referral.reporter_role} /><Info label="Lieu" value={referral.venue} /><Info label="Équipes" value={[referral.home_team, referral.away_team].filter(Boolean).join(" — ")} /><Info label="Maillot observé" value={[referral.jersey_color, referral.jersey_number ? `#${referral.jersey_number}` : ""].filter(Boolean).join(" ")} /></div>{referral.reason && <p>{referral.reason}</p>}</section>}

        {profile.referralSnapshot && !referral && <section className="sourceBox"><div><b>Provenance conservée</b><span>Le signalement source est enregistré dans l'historique de la fiche.</span></div></section>}
      </div>

      <footer className="drawerActions">
        <div className="dangerZone">{!review && !archived && <button className="archive" disabled={!!busy} onClick={onArchive}>Archiver</button>}{archived && <button className="ghost" disabled={!!busy} onClick={onRestore}>Restaurer dans la base</button>}<button className="delete" disabled={!!busy} onClick={onDelete}>Supprimer la fiche</button></div>
        <div className="mainActions"><button className="ghost" onClick={onClose}>Fermer</button><button disabled={!!busy} onClick={() => onSave(form)}>{busy === "save_player" ? "Enregistrement…" : "Enregistrer"}</button>{review && <button className="gold" disabled={!!busy} onClick={() => onValidate(form)}>{busy === "validate_player" ? "Validation…" : "Valider et ajouter à la Base joueurs"}</button>}</div>
      </footer>
      <style jsx>{drawerCss}</style>
    </aside>
  </div>;
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div className="info"><small>{label}</small><b>{value || "—"}</b><style jsx>{`.info{display:grid;gap:2px;min-width:0}.info small{font-size:.67rem;color:#8d7f78;text-transform:uppercase;letter-spacing:.06em}.info b{font-size:.8rem;color:#392d30;overflow-wrap:anywhere}`}</style></div>;
}

const css = `
.wf{display:grid;gap:13px}.hero{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;background:linear-gradient(135deg,#5c1324,#7d2439);color:#fff;padding:19px 21px;border-radius:18px;box-shadow:0 12px 30px rgba(70,18,31,.13)}.hero p,.sectionHead p{margin:0;color:#d4a24c;font-size:.67rem;font-weight:1000;letter-spacing:.13em}.hero h2{margin:4px 0 5px;font-size:1.35rem}.hero>div>span{font-size:.8rem;color:#f1dde2}.heroStats{display:flex;gap:9px}.heroStats b{min-width:94px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:13px;padding:10px 12px;font-size:1.2rem}.heroStats small{display:block;font-size:.64rem;color:#f0dfe3;margin-top:2px}.tabs{display:flex;gap:7px;border-bottom:1px solid #e9ddd7;padding:2px 0 10px;overflow:auto}.tabs button{border:0;background:#f7f3f1;color:#6b1a2c;border-radius:999px;padding:9px 13px;font-weight:950;white-space:nowrap;cursor:pointer}.tabs button.on{background:#6b1a2c;color:#fff}.tabs em{font-style:normal;margin-left:5px;background:rgba(255,255,255,.18);border-radius:99px;padding:2px 6px;font-size:.68rem}.card{background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:14px;box-shadow:0 4px 16px rgba(58,35,40,.025)}.sectionHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.sectionHead h3{margin:4px 0 0;color:#4d1420}.sectionHead>span,.hint{color:#81736d;font-size:.77rem}.toolbar{display:grid;grid-template-columns:minmax(240px,1fr) 180px 180px auto;gap:8px;align-items:center}.searchBox{display:flex;align-items:center;gap:7px;border:1px solid #ded1ca;border-radius:11px;padding:0 10px;background:#fbf9f8}.searchBox input{border:0!important;background:transparent!important;outline:0;width:100%}.toolbar select,.line input,.line select,.grid input,.grid select,.grid textarea{border:1px solid #ddd1ca;border-radius:9px;padding:9px;font:inherit;background:#fff;min-width:0}.archiveToggle{display:flex;gap:7px;align-items:center;font-size:.75rem;font-weight:850;color:#5b4d50;white-space:nowrap}.playerGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.playerCard{position:relative;display:grid;grid-template-columns:48px 1fr auto;gap:10px;align-items:center;border:1px solid #e8ddd7;border-radius:14px;padding:11px 11px 11px 13px;cursor:pointer;transition:.15s;background:#fff}.playerCard:hover{border-color:#cfaeb7;box-shadow:0 7px 20px rgba(75,25,38,.08);transform:translateY(-1px)}.playerCard.archived{opacity:.68;background:#f8f6f5}.selectPlayer{position:absolute;left:7px;top:7px;z-index:2}.selectPlayer input{display:none}.selectPlayer span{display:block;width:16px;height:16px;border:1.5px solid #c8b7b0;border-radius:5px;background:#fff}.selectPlayer input:checked+span{background:#6b1a2c;border-color:#6b1a2c;box-shadow:inset 0 0 0 3px #fff}.avatar{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#f1e7e3,#fbf8f6);display:grid;place-items:center;color:#6b1a2c;font-weight:1000;overflow:hidden}.avatar.small{width:36px;height:36px}.avatar img{width:100%;height:100%;object-fit:cover}.playerMain{display:grid;gap:3px;min-width:0}.nameLine{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.playerMain>span,.playerMain small,.sharedGrid span,.reviewGrid span,.reviewGrid small{color:#7f7169;font-size:.73rem}.badge{border-radius:999px;padding:3px 6px;font-size:.61rem;font-weight:950}.badge.green{background:#eaf6ed;color:#2d7440}.badge.gray{background:#eeeae8;color:#756965}.openBtn{background:transparent!important;color:#6b1a2c!important;padding:6px!important}.selectionCount{background:#fff4dc;color:#79520d!important;border-radius:999px;padding:6px 9px}.bulk{display:flex;justify-content:space-between;gap:12px;align-items:center;background:#fff8ea;border-color:#efd7a2}.bulk>div:first-child{display:grid;gap:2px}.bulk span{color:#806f65;font-size:.75rem}.bulk>div:last-child{display:flex;gap:6px;flex-wrap:wrap}.sharedGrid,.reviewGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sharedGrid article,.reviewGrid article{display:flex;gap:9px;align-items:center;border:1px solid #eee4df;border-radius:12px;padding:9px}.sharedGrid article>div:last-child,.reviewGrid article>div:nth-child(2){display:grid;gap:2px;flex:1}.reviewGrid article{cursor:pointer;background:#fffbf0;border-color:#efdbac}.reviewGrid article button{white-space:nowrap}.referralLink{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:7px}.referralLink code{background:#f7f3f1;border:1px solid #e6d9d3;border-radius:10px;padding:10px;overflow:auto;color:#5a2732}.refList{display:grid;gap:8px}.refList>article{border:1px solid #e8ddd7;border-radius:13px;overflow:hidden}.refList>article.open{border-color:#d1aebb;box-shadow:0 6px 20px rgba(74,21,35,.055)}.refTop{display:grid;grid-template-columns:36px 1fr auto;gap:9px;align-items:center;padding:10px;cursor:pointer}.refIcon{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#fff0d2;color:#9a680c;font-weight:1000}.refTop>div:nth-child(2){display:grid;gap:2px}.refTop span,.refTop small{font-size:.73rem;color:#7e716a}.refDetail{border-top:1px solid #eee4df;padding:12px;background:#fcfaf9}.infoGrid,.sourceGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.observation{margin-top:12px;background:#fff7e7;border-left:4px solid #d4a24c;padding:10px;border-radius:8px}.observation p{margin:4px 0 0;font-size:.8rem;white-space:pre-wrap}.refActions{display:flex;justify-content:flex-end;gap:7px;margin-top:12px}.historyRefs summary{cursor:pointer;font-weight:900;color:#6b1a2c}.historyRefs>div{display:grid;gap:4px;margin-top:8px}.historyRefs span{font-size:.72rem;color:#7d7069}.line{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.line select{flex:1}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.grid textarea{grid-column:1/-1;min-height:72px}.partList,.history{display:grid;gap:6px;margin-top:10px}.part,.history>div{display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #eee;padding-top:7px}.history span{color:#7f7169;font-size:.75rem}.empty{grid-column:1/-1;text-align:center;border:1.5px dashed #ddcec7;border-radius:12px;padding:28px;color:#8e8079;background:#fcfaf9}.wf button{border:0;border-radius:9px;padding:9px 11px;background:#6b1a2c;color:#fff;font-weight:900;cursor:pointer}.wf button:disabled{opacity:.5;cursor:not-allowed}.wf .ghost{background:#fff!important;color:#6b1a2c!important;border:1px solid #d8c8c1!important}.dangerGhost{background:#fff!important;color:#aa2929!important;border:1px solid #edcaca!important}@media(max-width:1000px){.toolbar{grid-template-columns:1fr 1fr}.archiveToggle{grid-column:1/-1}.infoGrid{grid-template-columns:1fr 1fr}}@media(max-width:760px){.hero{align-items:flex-start;flex-direction:column}.playerGrid,.sharedGrid,.reviewGrid{grid-template-columns:1fr}.toolbar,.grid{grid-template-columns:1fr}.grid textarea{grid-column:auto}.referralLink{grid-template-columns:1fr}.refTop{grid-template-columns:32px 1fr}.refTop>button{grid-column:2}.bulk{align-items:flex-start;flex-direction:column}.infoGrid{grid-template-columns:1fr 1fr}}
`;

const drawerCss = `
.drawerBack{position:fixed;inset:0;background:rgba(28,17,20,.5);z-index:160;display:flex;justify-content:flex-end}.drawer{height:100%;width:min(760px,96vw);background:#fff;display:grid;grid-template-rows:auto 1fr auto;box-shadow:-20px 0 60px rgba(0,0,0,.18)}.drawerHead{display:flex;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #eadfd8;background:#fff}.drawerHead h2{margin:6px 0 3px;color:#4d1420}.drawerHead small{color:#80716b}.status{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:.66rem;font-weight:1000}.status.amber{background:#fff1cc;color:#8a5c05}.status.green{background:#e9f6ec;color:#28713a}.status.gray{background:#eeeae8;color:#6d625d}.close{width:38px;height:38px;border:1px solid #dfd0ca!important;background:#fff!important;color:#6b1a2c!important;font-size:1.45rem;padding:0!important;border-radius:50%!important}.drawerScroll{overflow:auto;padding:18px 20px;display:grid;gap:15px}.identity{display:grid;grid-template-columns:100px 1fr;gap:15px;align-items:start}.bigAvatar{width:96px;height:116px;border-radius:16px;background:linear-gradient(135deg,#f0e4e1,#fbf8f6);display:grid;place-items:center;font-size:1.5rem;font-weight:1000;color:#6b1a2c;overflow:hidden}.bigAvatar img{width:100%;height:100%;object-fit:cover}.formGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.formGrid label{display:grid;gap:4px;color:#5a2732;font-size:.7rem;font-weight:900}.formGrid input,.formGrid select,.formGrid textarea{border:1px solid #ddd1ca;border-radius:9px;padding:9px;font:inherit;min-width:0;background:#fff}.formGrid textarea{min-height:100px}.formGrid .wide{grid-column:1/-1}.sourceBox{border:1px solid #ead8ac;background:#fffaf0;border-radius:14px;padding:12px;display:grid;gap:10px}.sourceBox>div:first-child{display:grid;gap:2px}.sourceBox>div:first-child b{color:#6b1a2c}.sourceBox>div:first-child span{font-size:.72rem;color:#81736d}.sourceBox p{margin:0;white-space:pre-wrap;font-size:.78rem;color:#4e4142}.sourceGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.drawerActions{display:flex;justify-content:space-between;gap:12px;padding:13px 20px;border-top:1px solid #eadfd8;background:#fbf9f8}.dangerZone,.mainActions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.drawer button{border:0;border-radius:9px;padding:9px 11px;background:#6b1a2c;color:#fff;font-weight:900;cursor:pointer}.drawer button:disabled{opacity:.5}.drawer .ghost{background:#fff!important;color:#6b1a2c!important;border:1px solid #d8c8c1!important}.drawer .gold{background:#d4a24c!important;color:#24170c!important}.archive{background:#fff4dd!important;color:#7a5208!important;border:1px solid #e6c574!important}.delete{background:#fff!important;color:#a92323!important;border:1px solid #e9bebe!important}.delete:hover{background:#a92323!important;color:#fff!important}@media(max-width:700px){.identity{grid-template-columns:1fr}.bigAvatar{width:76px;height:90px}.formGrid{grid-template-columns:1fr}.formGrid .wide{grid-column:auto}.sourceGrid{grid-template-columns:1fr 1fr}.drawerActions{align-items:flex-start;flex-direction:column}.mainActions{width:100%;justify-content:flex-end}}
`;
