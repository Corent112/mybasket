"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import InstitutionalResources from "@/components/institutionnel/InstitutionalResources";
import InstitutionalPlayerPerformance from "@/components/institutionnel/InstitutionalPlayerPerformance";
import InstitutionalPlayerSheet from "@/components/institutionnel/InstitutionalPlayerSheet";

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
  weight_kg?: number | null;
  wingspan_cm?: number | null;
  father_height_cm?: number | null;
  mother_height_cm?: number | null;
  school?: string | null;
  class_name?: string | null;
  position_primary?: string | null;
  position_secondary?: string | null;
  dominant_hand?: string | null;
  license_number?: string | null;
  tutor1_phone?: string | null;
  tutor1_email?: string | null;
  tutor2_phone?: string | null;
  tutor2_email?: string | null;
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
  const [referralView, setReferralView] = useState<"review" | "validated" | "rejected">("review");
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

  async function setReferralStatus(referralId: string, status: "reviewing" | "rejected") {
    const action = status === "reviewing" ? "mark_referral_reviewing" : "reject_referral";
    if (status === "rejected" && !confirm("Rejeter ce signalement ? Aucune fiche joueur ne sera créée.")) return;
    const j = await playerAction(action, { referralId });
    if (j) await loadPlayersAndReferrals();
  }

  async function validateReferral(referralId: string) {
    if (!confirm("Valider ce signalement et créer la fiche joueur dans la Base joueurs ?")) return;
    const j = await playerAction("validate_referral", { referralId });
    if (!j?.player?.id) return;
    await loadPlayersAndReferrals(String(j.player.id));
    setReferralView("validated");
    setTab("base");
  }

  async function restoreReferral(referralId: string) {
    const j = await playerAction("restore_referral", { referralId });
    if (!j) return;
    await loadPlayersAndReferrals();
    setReferralView("review");
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

  const validatedPlayers = players.filter((p) => p.workflow_status === "validated" && !p.archived);
  const archivedPlayers = players.filter((p) => p.workflow_status === "archived" || p.archived);
  const pendingReferrals = referrals.filter((r) => r.status === "new" || r.status === "reviewing");
  const validatedReferrals = referrals.filter((r) => r.status === "validated" || r.status === "converted");
  const rejectedReferrals = referrals.filter((r) => r.status === "rejected" || r.status === "dismissed");
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
          <b>{pendingReferrals.length}<small>À vérifier</small></b>
        </div>
      </div>

      <nav className="tabs">
        <button className={tab === "base" ? "on" : ""} onClick={() => setTab("base")}>Base joueurs <em>{validatedPlayers.length}</em></button>
        <button className={tab === "referrals" ? "on" : ""} onClick={() => setTab("referrals")}>Signalements <em>{pendingReferrals.length}</em></button>
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
            <div className="sectionHead"><div><p>SIGNALEMENTS</p><h3>Examiner avant de créer une fiche joueur</h3></div><span>{pendingReferrals.length} à vérifier</span></div>
            <p className="hint">Un signalement n'est pas encore une fiche joueur. Tu le consultes, puis tu choisis : Validé, À vérifier ou Rejeté. La fiche joueur n'est créée que lorsque tu valides.</p>
            <div className="referralLink"><code>{referralUrl || "Création du lien…"}</code><button className="ghost" disabled={!referralToken} onClick={copyReferralLink}>Copier</button>{referralUrl && <button className="ghost" onClick={() => window.open(referralUrl, "_blank", "noopener,noreferrer")}>Ouvrir</button>}</div>
          </section>

          <nav className="refStatusTabs">
            <button className={referralView === "review" ? "on review" : ""} onClick={() => setReferralView("review")}>À vérifier <span>{pendingReferrals.length}</span></button>
            <button className={referralView === "validated" ? "on validated" : ""} onClick={() => setReferralView("validated")}>Validés <span>{validatedReferrals.length}</span></button>
            <button className={referralView === "rejected" ? "on rejected" : ""} onClick={() => setReferralView("rejected")}>Rejetés <span>{rejectedReferrals.length}</span></button>
          </nav>

          <section className="card">
            <div className="sectionHead"><div><p>{referralView === "review" ? "À VÉRIFIER" : referralView === "validated" ? "VALIDÉS" : "REJETÉS"}</p><h3>{referralView === "review" ? "Signalements en attente de décision" : referralView === "validated" ? "Signalements ayant créé une fiche joueur" : "Signalements refusés — aucune fiche créée"}</h3></div></div>
            <div className="refList">{(referralView === "review" ? pendingReferrals : referralView === "validated" ? validatedReferrals : rejectedReferrals).map((r) => {
              const open = openedReferral === r.id;
              const linkedPlayer = r.converted_player_id ? players.find((p) => p.id === r.converted_player_id) : null;
              return <article key={r.id} className={open ? "open" : ""}>
                <div className="refTop" onClick={() => setOpenedReferral(open ? null : r.id)}>
                  <div className={`refIcon ${referralView}`}>{referralView === "validated" ? "✓" : referralView === "rejected" ? "×" : "?"}</div>
                  <div><b>{[r.first_name, r.last_name].filter(Boolean).join(" ") || `Joueur #${r.jersey_number || "?"}`}</b><span>{r.club_name || [r.home_team, r.away_team].filter(Boolean).join(" / ") || "Club non identifié"} · {r.category || "Catégorie —"}</span><small>📍 {r.venue || "Lieu —"} · 👕 {r.jersey_color || "couleur —"} · #{r.jersey_number || "—"} · {fmtDate(r.created_at)}</small></div>
                  <button className="ghost">{open ? "Réduire" : "Consulter"}</button>
                </div>
                {open && <div className="refDetail">
                  <div className="decisionBanner"><b>{referralView === "review" ? "Décision à prendre" : referralView === "validated" ? "Signalement validé" : "Signalement rejeté"}</b><span>{referralView === "review" ? "Vérifie les informations reçues. Aucune fiche joueur n'existe encore." : referralView === "validated" ? "La fiche joueur a été créée avec ces informations préremplies." : "Ce signalement est conservé dans l'historique, sans fiche joueur."}</span></div>
                  <div className="infoGrid"><Info label="Prénom" value={r.first_name} /><Info label="Nom" value={r.last_name} /><Info label="Naissance" value={fmtDate(r.birthdate)} /><Info label="Club" value={r.club_name} /><Info label="Catégorie" value={r.category} /><Info label="Maillot" value={[r.jersey_color, r.jersey_number ? `#${r.jersey_number}` : ""].filter(Boolean).join(" ")} /><Info label="Match / équipes" value={[r.home_team, r.away_team].filter(Boolean).join(" — ")} /><Info label="Lieu" value={r.venue} /><Info label="Auteur" value={r.reporter_name || r.reporter_email} /><Info label="Fonction" value={r.reporter_role} /><Info label="Email" value={r.reporter_email} /><Info label="Téléphone" value={r.reporter_phone} /></div>
                  {r.reason && <div className="observation"><b>Observation reçue</b><p>{r.reason}</p></div>}
                  {referralView === "review" && <div className="refActions three"><button className="ghost" onClick={() => setReferralStatus(r.id, "reviewing")}>À vérifier</button><button className="dangerGhost" onClick={() => setReferralStatus(r.id, "rejected")}>Rejeter</button><button className="validateBtn" disabled={busy === "validate_referral"} onClick={() => validateReferral(r.id)}>✓ Valider et créer la fiche joueur</button></div>}
                  {referralView === "validated" && linkedPlayer && <div className="refActions"><button onClick={() => setOpenedPlayerId(linkedPlayer.id)}>Ouvrir la fiche joueur →</button></div>}
                  {referralView === "rejected" && <div className="refActions"><button className="ghost" onClick={() => restoreReferral(r.id)}>Remettre à vérifier</button></div>}
                </div>}
              </article>;
            })}{!(referralView === "review" ? pendingReferrals : referralView === "validated" ? validatedReferrals : rejectedReferrals).length && <div className="empty">Aucun signalement dans cet onglet.</div>}</div>
          </section>
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

      {openedPlayer && <InstitutionalPlayerSheet structureId={structureId} player={openedPlayer} referral={referrals.find((r) => r.id === safeProfile(openedPlayer).sourceReferralId) || null} busy={busy} onClose={() => setOpenedPlayerId(null)} onSave={(data) => savePlayer(data as PlayerEditData, false)} onArchive={archivePlayer} onRestore={() => restorePlayer(openedPlayer.id)} onDelete={deletePlayer} />}

      <style jsx>{css}</style>
    </div>
  );
}

type PlayerEditData = {
  first_name: string; last_name: string; birthdate: string; club_name: string; category: string; email: string; phone: string; sex: string; photo_url: string;
  height_cm: string; position: string; secondary_position: string; jersey_number: string; jersey_color: string; license_number: string; nationality: string;
  school: string; class_name: string; weight: string; dominant_hand: string; guardian1_phone: string; guardian1_email: string; guardian2_phone: string; guardian2_email: string;
  observations: string; provenance: string;
  weight_kg?: string; wingspan_cm?: string; father_height_cm?: string; mother_height_cm?: string; tutor1_phone?: string; tutor1_email?: string; tutor2_phone?: string; tutor2_email?: string; bone_age?: string; sitting_height_cm?: string; profile_extra?: Record<string, unknown>;
};

function PlayerDrawer({ structureId, player, referral, busy, onClose, onSave, onArchive, onRestore, onDelete }: { structureId: string; player: Player; referral: Referral | null; busy: string; onClose: () => void; onSave: (data: PlayerEditData) => void; onArchive: () => void; onRestore: () => void; onDelete: () => void }) {
  const profile = safeProfile(player);
  const [tab, setTab] = useState<"overview" | "performance" | "development" | "attendance" | "media">("overview");
  const [editing, setEditing] = useState(false);
  const mkForm = (): PlayerEditData => ({
    first_name: player.first_name || "", last_name: player.last_name || "", birthdate: player.birthdate || "", club_name: player.club_name || "", category: player.category || "",
    email: player.email || "", phone: player.phone || "", sex: player.sex || "", photo_url: player.photo_url || "", height_cm: player.height_cm ? String(player.height_cm) : "",
    position: profile.position || "", secondary_position: profile.secondaryPosition || "", jersey_number: profile.jerseyNumber || "", jersey_color: profile.jerseyColor || "",
    license_number: profile.licenseNumber || "", nationality: profile.nationality || "", school: profile.school || "", class_name: profile.className || "", weight: profile.weight || "",
    dominant_hand: profile.dominantHand || "", guardian1_phone: profile.guardian1Phone || "", guardian1_email: profile.guardian1Email || "", guardian2_phone: profile.guardian2Phone || "", guardian2_email: profile.guardian2Email || "",
    observations: profile.observations || "", provenance: profile.provenance || (referral ? `Signalement du ${fmtDate(referral.created_at)} · ${referral.venue || "lieu non renseigné"}` : ""),
  });
  const [form, setForm] = useState<PlayerEditData>(mkForm);
  useEffect(() => { setForm(mkForm()); setTab("overview"); setEditing(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [player.id]);
  const archived = player.workflow_status === "archived" || player.archived;
  const patch = (key: keyof PlayerEditData, value: string) => setForm((v) => ({ ...v, [key]: value }));
  const initials = `${form.first_name?.[0] || "?"}${form.last_name?.[0] || ""}`.toUpperCase();
  const age = form.birthdate ? Math.max(0, Math.floor((Date.now() - new Date(form.birthdate).getTime()) / 31557600000)) : null;
  const save = () => { onSave(form); setEditing(false); };

  return <div className="drawerBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label="Fiche joueur institutionnelle">
      <header className="profileHero">
        <div className="heroIdentity"><div className="heroAvatar">{form.photo_url ? <img src={form.photo_url} alt="" /> : initials}</div><div className="heroText"><div className="heroTopLine"><span className={`status ${archived ? "gray" : "green"}`}>{archived ? "Archivé" : "Base joueurs · Validé"}</span><span className="sheetLabel">FICHE JOUEUR</span></div><h2>{form.first_name || "Joueur"} {form.last_name}</h2><p>{[form.club_name || "Club non renseigné", form.category || "Catégorie —", form.position || "Poste —"].join(" · ")}</p><div className="quickFacts"><span><b>{form.jersey_number ? `#${form.jersey_number}` : "—"}</b><small>Maillot</small></span><span><b>{form.height_cm ? `${form.height_cm} cm` : "—"}</b><small>Taille</small></span><span><b>{age !== null ? `${age} ans` : "—"}</b><small>Âge</small></span></div></div></div>
        <button className="close" onClick={onClose} aria-label="Fermer la fiche">×</button>
      </header>

      <nav className="profileTabs" aria-label="Navigation fiche joueur">
        <button className={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}>Aperçu</button>
        <button className={tab === "performance" ? "on" : ""} onClick={() => setTab("performance")}>Performance</button>
        <button className={tab === "development" ? "on" : ""} onClick={() => setTab("development")}>Développement</button>
        <button className={tab === "attendance" ? "on" : ""} onClick={() => setTab("attendance")}>Présences</button>
        <button className={tab === "media" ? "on" : ""} onClick={() => setTab("media")}>Médias</button>
      </nav>

      <div className="drawerScroll">
        {tab === "overview" && <div className="overviewLayout">
          <section className="profileCard identityCard"><div className="cardTitle"><div><p>IDENTITÉ</p><h3>Fiche joueur</h3><span>Même socle d'informations que lors de la création d'un joueur dans Mes équipes.</span></div><button className="softBtn" onClick={() => setEditing((v) => !v)}>{editing ? "Annuler" : "Modifier"}</button></div>
            {!editing ? <div className="identityGrid"><Info label="Nom complet" value={`${form.first_name} ${form.last_name}`.trim()} /><Info label="Date de naissance" value={fmtDate(form.birthdate)} /><Info label="Club" value={form.club_name} /><Info label="Catégorie" value={form.category} /><Info label="Poste principal" value={form.position} /><Info label="Poste secondaire" value={form.secondary_position} /><Info label="Taille" value={form.height_cm ? `${form.height_cm} cm` : null} /><Info label="Poids" value={form.weight} /><Info label="Main dominante" value={form.dominant_hand} /><Info label="N° maillot" value={form.jersey_number} /><Info label="N° licence" value={form.license_number} /><Info label="Nationalité" value={form.nationality} /></div> :
            <div className="teamPlayerForm"><div className="editLayout"><div className="photoColumn"><div className="editAvatar">{form.photo_url ? <img src={form.photo_url} alt="" /> : initials}</div><label>Photo / avatar<input value={form.photo_url} onChange={(e) => patch("photo_url", e.target.value)} placeholder="URL de la photo" /></label></div><div className="formGrid spacious">
              <label>Prénom *<input value={form.first_name} onChange={(e) => patch("first_name", e.target.value)} /></label><label>Nom<input value={form.last_name} onChange={(e) => patch("last_name", e.target.value)} /></label>
              <label>Numéro de maillot<input value={form.jersey_number} onChange={(e) => patch("jersey_number", e.target.value)} /></label><label>Numéro de licence<input value={form.license_number} onChange={(e) => patch("license_number", e.target.value)} /></label>
              <label>Date de naissance<input type="date" value={form.birthdate} onChange={(e) => patch("birthdate", e.target.value)} /></label><label>Catégorie<input value={form.category} onChange={(e) => patch("category", e.target.value)} /></label>
              <label>Nationalité<input value={form.nationality} onChange={(e) => patch("nationality", e.target.value)} /></label><label>Établissement<input value={form.school} onChange={(e) => patch("school", e.target.value)} /></label><label>Classe<input value={form.class_name} onChange={(e) => patch("class_name", e.target.value)} /></label><label>Club<input value={form.club_name} onChange={(e) => patch("club_name", e.target.value)} /></label>
              <label>Poste principal<select value={form.position} onChange={(e) => patch("position", e.target.value)}><option value="">—</option>{["Meneur","Arrière","Ailier","Ailier-fort","Pivot"].map(x=><option key={x}>{x}</option>)}</select></label><label>Poste secondaire<select value={form.secondary_position} onChange={(e) => patch("secondary_position", e.target.value)}><option value="">—</option>{["Meneur","Arrière","Ailier","Ailier-fort","Pivot"].map(x=><option key={x}>{x}</option>)}</select></label>
              <label>Taille (cm)<input value={form.height_cm} onChange={(e) => patch("height_cm", e.target.value)} /></label><label>Poids<input value={form.weight} onChange={(e) => patch("weight", e.target.value)} placeholder="72 kg" /></label><label>Main dominante<select value={form.dominant_hand} onChange={(e) => patch("dominant_hand", e.target.value)}><option value="">—</option><option>Droite</option><option>Gauche</option><option>Ambidextre</option></select></label><label>Couleur maillot<input value={form.jersey_color} onChange={(e) => patch("jersey_color", e.target.value)} /></label>
              <label>Email<input type="email" value={form.email} onChange={(e) => patch("email", e.target.value)} /></label><label>Téléphone<input value={form.phone} onChange={(e) => patch("phone", e.target.value)} /></label><label>Téléphone tuteur 1<input value={form.guardian1_phone} onChange={(e) => patch("guardian1_phone", e.target.value)} /></label><label>Email tuteur 1<input value={form.guardian1_email} onChange={(e) => patch("guardian1_email", e.target.value)} /></label><label>Téléphone tuteur 2<input value={form.guardian2_phone} onChange={(e) => patch("guardian2_phone", e.target.value)} /></label><label>Email tuteur 2<input value={form.guardian2_email} onChange={(e) => patch("guardian2_email", e.target.value)} /></label>
            </div></div><label className="bigField">Observations<textarea value={form.observations} onChange={(e) => patch("observations", e.target.value)} /></label><div className="inlineActions"><button onClick={save} disabled={!!busy}>{busy === "save_player" ? "Enregistrement…" : "Enregistrer les modifications"}</button></div></div>}
          </section>
          {referral && <section className="profileCard sourcePreview"><div className="cardTitle"><div><p>PROVENANCE</p><h3>Signalement validé</h3></div></div><div className="sourceSummary"><span className="sourceIcon">✓</span><div><b>{referral.reporter_name || referral.reporter_email}</b><span>{fmtDate(referral.created_at)} · {referral.venue || "Lieu non renseigné"}</span></div></div></section>}
        </div>}

        {tab === "performance" && <InstitutionalPlayerPerformance structureId={structureId} player={{ id: player.id, first_name: player.first_name, last_name: player.last_name, photo_url: player.photo_url }} />}
        {tab === "development" && <section className="profileCard tabPanel"><div className="cardTitle"><div><p>DÉVELOPPEMENT</p><h3>Profil & progression</h3></div></div><p className="observationText">{form.observations || "Aucune observation de développement pour le moment."}</p><div className="identityGrid"><Info label="Poste principal" value={form.position} /><Info label="Poste secondaire" value={form.secondary_position} /><Info label="Taille" value={form.height_cm ? `${form.height_cm} cm` : null} /><Info label="Poids" value={form.weight} /><Info label="Main dominante" value={form.dominant_hand} /><Info label="Établissement" value={form.school} /></div></section>}
        {tab === "attendance" && <section className="profileCard tabPanel"><div className="emptyState"><b>Présences</b><span>Les présences apparaîtront ici lorsqu'elles seront reliées aux séances et sélections de ce joueur.</span></div></section>}
        {tab === "media" && <div className="overviewLayout"><section className="profileCard"><div className="cardTitle"><div><p>MÉDIAS</p><h3>Photo & médias joueur</h3></div></div><div className="mediaAvatar">{form.photo_url ? <img src={form.photo_url} alt="" /> : initials}</div></section>{referral && <section className="profileCard"><div className="cardTitle"><div><p>SIGNALEMENT D'ORIGINE</p><h3>Historique conservé</h3></div></div><div className="sourceGridLarge"><Info label="Auteur" value={referral.reporter_name || referral.reporter_email} /><Info label="Rôle" value={referral.reporter_role} /><Info label="Lieu" value={referral.venue} /><Info label="Équipes" value={[referral.home_team, referral.away_team].filter(Boolean).join(" — ")} /><Info label="Maillot" value={[referral.jersey_color, referral.jersey_number].filter(Boolean).join(" #")} /><Info label="Observation" value={referral.reason} /></div></section>}</div>}
      </div>

      <footer className="drawerActions"><div className="dangerZone">{!archived && <button className="archive" disabled={!!busy} onClick={onArchive}>Archiver</button>}{archived && <button className="ghost" disabled={!!busy} onClick={onRestore}>Restaurer dans la base</button>}<button className="delete" disabled={!!busy} onClick={onDelete}>Supprimer la fiche</button></div><div className="mainActions"><button className="ghost" onClick={onClose}>Fermer</button>{editing && <button disabled={!!busy} onClick={save}>Enregistrer</button>}</div></footer>
      <style jsx>{drawerCss}</style>
    </aside>
  </div>;
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div className="info"><small>{label}</small><b>{value || "—"}</b><style jsx>{`.info{display:grid;gap:2px;min-width:0}.info small{font-size:.67rem;color:#8d7f78;text-transform:uppercase;letter-spacing:.06em}.info b{font-size:.8rem;color:#392d30;overflow-wrap:anywhere}`}</style></div>;
}

const css = `
.wf{display:grid;gap:22px}.hero{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;background:linear-gradient(135deg,#5c1324,#7d2439);color:#fff;padding:28px 30px;border-radius:24px;box-shadow:0 12px 30px rgba(70,18,31,.13)}.hero p,.sectionHead p{margin:0;color:#d4a24c;font-size:.67rem;font-weight:1000;letter-spacing:.13em}.hero h2{margin:4px 0 5px;font-size:1.35rem}.hero>div>span{font-size:.8rem;color:#f1dde2}.heroStats{display:flex;gap:9px}.heroStats b{min-width:94px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:13px;padding:10px 12px;font-size:1.2rem}.heroStats small{display:block;font-size:.64rem;color:#f0dfe3;margin-top:2px}.tabs{display:flex;gap:7px;border-bottom:1px solid #e9ddd7;padding:2px 0 10px;overflow:auto}.tabs button{border:0;background:#f7f3f1;color:#6b1a2c;border-radius:999px;padding:9px 13px;font-weight:950;white-space:nowrap;cursor:pointer}.tabs button.on{background:#6b1a2c;color:#fff}.tabs em{font-style:normal;margin-left:5px;background:rgba(255,255,255,.18);border-radius:99px;padding:2px 6px;font-size:.68rem}.card{background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:22px;box-shadow:0 8px 26px rgba(58,35,40,.025)}.sectionHead{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px}.sectionHead h3{margin:4px 0 0;color:#4d1420}.sectionHead>span,.hint{color:#81736d;font-size:.77rem}.toolbar{display:grid;grid-template-columns:minmax(280px,1fr) 190px 190px auto;gap:12px;align-items:center;margin-bottom:4px}.searchBox{display:flex;align-items:center;gap:7px;border:1px solid #ded1ca;border-radius:11px;padding:0 10px;background:#fbf9f8}.searchBox input{border:0!important;background:transparent!important;outline:0;width:100%}.toolbar select,.line input,.line select,.grid input,.grid select,.grid textarea{border:1px solid #ddd1ca;border-radius:9px;padding:9px;font:inherit;background:#fff;min-width:0}.archiveToggle{display:flex;gap:7px;align-items:center;font-size:.75rem;font-weight:850;color:#5b4d50;white-space:nowrap}.playerGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.playerCard{position:relative;display:grid;grid-template-columns:48px 1fr auto;gap:10px;align-items:center;border:1px solid #e8ddd7;border-radius:18px;padding:16px 16px 16px 18px;cursor:pointer;transition:.15s;background:#fff}.playerCard:hover{border-color:#cfaeb7;box-shadow:0 7px 20px rgba(75,25,38,.08);transform:translateY(-1px)}.playerCard.archived{opacity:.68;background:#f8f6f5}.selectPlayer{position:absolute;left:7px;top:7px;z-index:2}.selectPlayer input{display:none}.selectPlayer span{display:block;width:16px;height:16px;border:1.5px solid #c8b7b0;border-radius:5px;background:#fff}.selectPlayer input:checked+span{background:#6b1a2c;border-color:#6b1a2c;box-shadow:inset 0 0 0 3px #fff}.avatar{width:58px;height:58px;border-radius:18px;background:linear-gradient(135deg,#f1e7e3,#fbf8f6);display:grid;place-items:center;color:#6b1a2c;font-weight:1000;overflow:hidden}.avatar.small{width:36px;height:36px}.avatar img{width:100%;height:100%;object-fit:cover}.playerMain{display:grid;gap:3px;min-width:0}.nameLine{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.playerMain>span,.playerMain small,.sharedGrid span,.reviewGrid span,.reviewGrid small{color:#7f7169;font-size:.73rem}.badge{border-radius:999px;padding:3px 6px;font-size:.61rem;font-weight:950}.badge.green{background:#eaf6ed;color:#2d7440}.badge.gray{background:#eeeae8;color:#756965}.openBtn{background:transparent!important;color:#6b1a2c!important;padding:6px!important}.selectionCount{background:#fff4dc;color:#79520d!important;border-radius:999px;padding:6px 9px}.bulk{display:flex;justify-content:space-between;gap:12px;align-items:center;background:#fff8ea;border-color:#efd7a2}.bulk>div:first-child{display:grid;gap:2px}.bulk span{color:#806f65;font-size:.75rem}.bulk>div:last-child{display:flex;gap:6px;flex-wrap:wrap}.sharedGrid,.reviewGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sharedGrid article,.reviewGrid article{display:flex;gap:9px;align-items:center;border:1px solid #eee4df;border-radius:12px;padding:9px}.sharedGrid article>div:last-child,.reviewGrid article>div:nth-child(2){display:grid;gap:2px;flex:1}.reviewGrid article{cursor:pointer;background:#fffbf0;border-color:#efdbac}.reviewGrid article button{white-space:nowrap}.refStatusTabs{display:flex;gap:10px;flex-wrap:wrap}.refStatusTabs button{background:#f6f1ef!important;color:#6b1a2c!important;border:1px solid #e4d7d1!important;padding:10px 14px}.refStatusTabs button span{margin-left:6px;background:#fff;border-radius:99px;padding:2px 7px}.refStatusTabs button.on.review{background:#fff7e8!important;border-color:#e5bf68!important}.refStatusTabs button.on.validated{background:#eaf6ed!important;color:#236638!important;border-color:#b9ddc3!important}.refStatusTabs button.on.rejected{background:#fff0f0!important;color:#9d2929!important;border-color:#edc4c4!important}.decisionBanner{display:grid;gap:3px;padding:12px 14px;margin-bottom:14px;border-radius:12px;background:#f8f4f2}.decisionBanner span{font-size:.75rem;color:#756965}.refActions.three{align-items:center}.validateBtn{background:#2f7a43!important}.refIcon.validated{background:#eaf6ed;color:#2c7540}.refIcon.rejected{background:#fff0f0;color:#a02d2d}.referralLink{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:7px}.referralLink code{background:#f7f3f1;border:1px solid #e6d9d3;border-radius:10px;padding:10px;overflow:auto;color:#5a2732}.refList{display:grid;gap:8px}.refList>article{border:1px solid #e8ddd7;border-radius:13px;overflow:hidden}.refList>article.open{border-color:#d1aebb;box-shadow:0 6px 20px rgba(74,21,35,.055)}.refTop{display:grid;grid-template-columns:36px 1fr auto;gap:9px;align-items:center;padding:10px;cursor:pointer}.refIcon{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#fff0d2;color:#9a680c;font-weight:1000}.refTop>div:nth-child(2){display:grid;gap:2px}.refTop span,.refTop small{font-size:.73rem;color:#7e716a}.refDetail{border-top:1px solid #eee4df;padding:12px;background:#fcfaf9}.infoGrid,.sourceGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.observation{margin-top:12px;background:#fff7e7;border-left:4px solid #d4a24c;padding:10px;border-radius:8px}.observation p{margin:4px 0 0;font-size:.8rem;white-space:pre-wrap}.refActions{display:flex;justify-content:flex-end;gap:7px;margin-top:12px}.historyRefs summary{cursor:pointer;font-weight:900;color:#6b1a2c}.historyRefs>div{display:grid;gap:4px;margin-top:8px}.historyRefs span{font-size:.72rem;color:#7d7069}.line{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.line select{flex:1}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.grid textarea{grid-column:1/-1;min-height:72px}.partList,.history{display:grid;gap:6px;margin-top:10px}.part,.history>div{display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #eee;padding-top:7px}.history span{color:#7f7169;font-size:.75rem}.empty{grid-column:1/-1;text-align:center;border:1.5px dashed #ddcec7;border-radius:12px;padding:28px;color:#8e8079;background:#fcfaf9}.wf button{border:0;border-radius:9px;padding:9px 11px;background:#6b1a2c;color:#fff;font-weight:900;cursor:pointer}.wf button:disabled{opacity:.5;cursor:not-allowed}.wf .ghost{background:#fff!important;color:#6b1a2c!important;border:1px solid #d8c8c1!important}.dangerGhost{background:#fff!important;color:#aa2929!important;border:1px solid #edcaca!important}@media(max-width:1000px){.toolbar{grid-template-columns:1fr 1fr}.archiveToggle{grid-column:1/-1}.infoGrid{grid-template-columns:1fr 1fr}}@media(max-width:760px){.hero{align-items:flex-start;flex-direction:column}.playerGrid,.sharedGrid,.reviewGrid{grid-template-columns:1fr}.toolbar,.grid{grid-template-columns:1fr}.grid textarea{grid-column:auto}.referralLink{grid-template-columns:1fr}.refTop{grid-template-columns:32px 1fr}.refTop>button{grid-column:2}.bulk{align-items:flex-start;flex-direction:column}.infoGrid{grid-template-columns:1fr 1fr}}
`;

const drawerCss = `
.drawerBack{position:fixed;inset:0;background:rgba(25,12,17,.62);backdrop-filter:blur(5px);z-index:160;display:grid;place-items:center;padding:26px}.drawer{width:min(1180px,96vw);height:min(900px,94vh);background:#f8f6f4;border:1px solid rgba(255,255,255,.55);border-radius:26px;overflow:hidden;display:grid;grid-template-rows:auto auto 1fr auto;box-shadow:0 35px 110px rgba(29,9,16,.3)}
.profileHero{position:relative;display:flex;justify-content:space-between;gap:22px;padding:26px 30px;background:linear-gradient(135deg,#4b0f1e 0%,#6b1a2c 52%,#822c40 100%);color:#fff}.heroIdentity{display:flex;gap:20px;align-items:center;min-width:0}.heroAvatar{width:104px;height:124px;border-radius:22px;background:linear-gradient(145deg,#f4e7df,#fff);border:3px solid rgba(255,255,255,.35);display:grid;place-items:center;color:#6b1a2c;font-size:1.8rem;font-weight:1000;overflow:hidden;box-shadow:0 15px 35px rgba(0,0,0,.18);flex:0 0 auto}.heroAvatar img,.editAvatar img{width:100%;height:100%;object-fit:cover}.heroText{min-width:0}.heroTopLine{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.sheetLabel{font-size:.66rem;letter-spacing:.14em;font-weight:1000;color:#e9c46e}.profileHero h2{margin:9px 0 3px;font-size:2rem;line-height:1.05}.profileHero p{margin:0;color:#f2dfe4;font-weight:750}.status{display:inline-flex;border-radius:999px;padding:6px 9px;font-size:.66rem;font-weight:1000}.status.amber{background:#ffe5a3;color:#6b4700}.status.green{background:#dff3e5;color:#1f6633}.status.gray{background:#e9e4e1;color:#5e5350}.quickFacts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.quickFacts span{min-width:82px;padding:8px 11px;border-radius:12px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14)}.quickFacts b,.quickFacts small{display:block}.quickFacts b{font-size:.92rem}.quickFacts small{font-size:.62rem;color:#ead7dc;margin-top:2px}.close{width:44px;height:44px;flex:0 0 auto;border:1px solid rgba(255,255,255,.25)!important;background:rgba(255,255,255,.1)!important;color:#fff!important;font-size:1.55rem;padding:0!important;border-radius:50%!important;cursor:pointer}.close:hover{background:#fff!important;color:#6b1a2c!important}
.profileTabs{display:flex;gap:8px;padding:12px 24px;border-bottom:1px solid #e6dad4;background:#fff;overflow:auto}.profileTabs button{border:0;border-radius:999px;padding:10px 15px;background:#f6f1ef;color:#6b1a2c;font-weight:950;white-space:nowrap;cursor:pointer}.profileTabs button.on{background:#6b1a2c;color:#fff;box-shadow:0 6px 16px rgba(107,26,44,.18)}
.drawerScroll{overflow:auto;padding:24px 28px 32px}.overviewLayout{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}.profileCard{background:#fff;border:1px solid #e7dad4;border-radius:22px;padding:20px;box-shadow:0 9px 28px rgba(55,25,33,.035)}.identityCard{grid-row:span 2}.cardTitle{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:18px}.cardTitle p{margin:0;color:#d4a24c;font-size:.67rem;font-weight:1000;letter-spacing:.13em}.cardTitle h3{margin:5px 0 0;color:#4c1420;font-size:1.03rem}.cardTitle span{display:block;margin-top:4px;color:#85756f;font-size:.75rem}.softBtn{background:#fff8ed!important;color:#6b1a2c!important;border:1px solid #ecd9b4!important;border-radius:999px!important;padding:8px 11px!important;font-weight:900!important}.identityGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 22px}.observationText{margin:0;white-space:pre-wrap;line-height:1.6;color:#44373a}.emptyState{display:grid;place-items:start;gap:5px;padding:28px;border:1.5px dashed #decfc8;border-radius:16px;background:#fcfaf9;color:#756661}.emptyState b{color:#4e3038}.sourceSummary{display:flex;gap:12px;align-items:center;padding:13px;border-radius:15px;background:#fff9ef;border:1px solid #efdcb3}.sourceIcon{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#6b1a2c;color:#fff;font-weight:1000}.sourceSummary div{display:grid;gap:2px}.sourceSummary span{color:#86736c;font-size:.75rem}.journey{display:grid;gap:10px}.journey>div{display:flex;gap:10px;align-items:center;position:relative}.journey i{width:29px;height:29px;border-radius:50%;display:grid;place-items:center;background:#f0e7e4;color:#6b1a2c;font-style:normal;font-weight:1000;flex:0 0 auto}.journey .done i{background:#e4f2e7;color:#2f7242}.journey .current i{background:#6b1a2c;color:#fff;box-shadow:0 0 0 5px #f6e9ed}.journey .muted{opacity:.48}.journey span{display:grid}.journey small{color:#8a7a74;margin-top:1px}
.editCard,.followupCard,.sourceBoxLarge{max-width:1060px;margin:0 auto}.editLayout{display:grid;grid-template-columns:190px 1fr;gap:24px;align-items:start}.photoColumn{display:grid;gap:12px}.editAvatar{width:170px;height:205px;border-radius:20px;background:linear-gradient(145deg,#efe4e1,#faf7f5);display:grid;place-items:center;color:#6b1a2c;font-size:2rem;font-weight:1000;overflow:hidden}.photoColumn label,.formGrid label,.bigField{display:grid;gap:6px;color:#5b2935;font-size:.72rem;font-weight:900}.formGrid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.formGrid.spacious{gap:16px 18px}.photoColumn input,.formGrid input,.formGrid select,.bigField input,.bigField textarea{border:1px solid #d9cbc5;border-radius:12px;padding:11px 12px;font:inherit;background:#fff;min-width:0;outline:none}.photoColumn input:focus,.formGrid input:focus,.formGrid select:focus,.bigField input:focus,.bigField textarea:focus{border-color:#b77987;box-shadow:0 0 0 3px rgba(107,26,44,.08)}.followupCard{display:grid;gap:18px}.bigField textarea{min-height:240px;resize:vertical;line-height:1.55}.sourceTab{max-width:1060px;margin:0 auto}.inlineActions{display:flex;justify-content:flex-end;margin-top:14px}.tabPanel{max-width:1060px;margin:0 auto}.mediaAvatar{width:180px;height:220px;border-radius:20px;background:#f2e9e6;display:grid;place-items:center;overflow:hidden;font-size:2rem;font-weight:1000;color:#6b1a2c}.mediaAvatar img{width:100%;height:100%;object-fit:cover}.sourceGridLarge{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 22px}.referralNote{margin-top:22px;padding:16px 18px;border-radius:16px;background:#fff8e9;border-left:4px solid #d4a24c}.referralNote small{color:#9d6c14;font-weight:1000;letter-spacing:.08em}.referralNote p{margin:6px 0 0;white-space:pre-wrap;line-height:1.55;color:#493c3c}
.drawerActions{display:flex;justify-content:space-between;gap:14px;padding:15px 24px;border-top:1px solid #e4d8d2;background:#fff}.dangerZone,.mainActions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.drawer button{border:0;border-radius:11px;padding:10px 14px;background:#6b1a2c;color:#fff;font-weight:950;cursor:pointer}.drawer button:disabled{opacity:.5;cursor:not-allowed}.drawer .ghost{background:#fff!important;color:#6b1a2c!important;border:1px solid #d8c8c1!important}.drawer .gold{background:#d4a24c!important;color:#27170b!important}.archive{background:#fff4dd!important;color:#7a5208!important;border:1px solid #e6c574!important}.delete{background:#fff!important;color:#a92323!important;border:1px solid #e9bebe!important}.delete:hover{background:#a92323!important;color:#fff!important}
@media(max-width:900px){.drawerBack{padding:8px}.drawer{width:100%;height:98vh;border-radius:18px}.overviewLayout{grid-template-columns:1fr}.identityCard{grid-row:auto}.editLayout{grid-template-columns:1fr}.photoColumn{grid-template-columns:100px 1fr;align-items:center}.editAvatar{width:100px;height:120px}.sourceGridLarge{grid-template-columns:1fr 1fr}.drawerActions{align-items:flex-start;flex-direction:column}.mainActions{width:100%;justify-content:flex-end}}@media(max-width:620px){.profileHero{padding:18px}.heroAvatar{width:76px;height:92px;border-radius:16px}.profileHero h2{font-size:1.45rem}.quickFacts{display:none}.drawerScroll{padding:16px}.identityGrid,.formGrid,.sourceGridLarge{grid-template-columns:1fr}.photoColumn{grid-template-columns:1fr}.profileTabs{padding:10px 14px}.drawerActions{padding:12px}.dangerZone,.mainActions{width:100%}.mainActions button{flex:1}.delete{margin-right:auto}}
`;
