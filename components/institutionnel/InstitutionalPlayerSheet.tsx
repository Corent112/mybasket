"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  "Aperçu",
  "Informations",
  "Profil joueur",
  "Tests",
  "Grilles de tir",
  "Médical",
  "Bilans",
  "Bilan sportif",
  "Suivi Pôle",
  "Documents",
] as const;

type Tab = (typeof TABS)[number];

type Props = {
  structureId: string;
  player: any;
  referral: any | null;
  busy: string;
  onClose: () => void;
  onSave: (data: any) => Promise<void> | void;
  onArchive: () => Promise<void> | void;
  onRestore: () => Promise<void> | void;
  onDelete: () => Promise<void> | void;
};

type Measurement = {
  id: string;
  season_id: string | null;
  measured_at: string;
  height_cm: number | null;
  weight_kg: number | null;
  wingspan_cm: number | null;
  shoe_size: number | null;
};

type Season = { id: string; season_label: string };
type AttendanceSession = { id:string; session_date:string; title:string; location:string|null; session_type?:string|null };
type AttendanceRecord = { id:string; session_id:string; player_id:string; status:"present"|"absent"|"excused" };

const today = () => new Date().toISOString().slice(0, 10);
const clean = (v: unknown) => String(v ?? "").trim();
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const fmtDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("fr-FR") : "—");

function ageFromBirthdate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function Info({ label, value }: { label: string; value: unknown }) {
  return <div className="info"><span>{label}</span><b>{clean(value) || "—"}</b></div>;
}

function SectionTitle({ eyebrow, title, help, right }: { eyebrow: string; title: string; help?: string; right?: React.ReactNode }) {
  return <div className="sectionTitle"><div><p>{eyebrow}</p><h3>{title}</h3>{help && <span>{help}</span>}</div>{right}</div>;
}

export default function InstitutionalPlayerSheet({ structureId, player, referral, busy, onClose, onSave, onArchive, onRestore, onDelete }: Props) {
  const sb = useMemo(() => createClient(), []);
  const profile = player?.profile_data || {};
  const [tab, setTab] = useState<Tab>("Aperçu");
  const [saving, setSaving] = useState("");
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSession[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [measure, setMeasure] = useState({ season_id: "", measured_at: today(), height_cm: "", weight_kg: "", wingspan_cm: "", shoe_size: "" });
  const [form, setForm] = useState<any>({});

  const buildForm = () => ({
    first_name: player.first_name || "",
    last_name: player.last_name || "",
    birthdate: player.birthdate || "",
    sex: player.sex || "",
    email: player.email || "",
    phone: player.phone || "",
    photo_url: player.photo_url || "",
    club_name: player.club_name || "",
    category: player.category || "",
    height_cm: player.height_cm ?? "",
    weight_kg: player.weight_kg ?? "",
    wingspan_cm: player.wingspan_cm ?? "",
    father_height_cm: player.father_height_cm ?? "",
    mother_height_cm: player.mother_height_cm ?? "",
    school: player.school || profile.school || "",
    class_name: player.class_name || profile.className || "",
    position: player.position_primary || profile.position || "",
    secondary_position: player.position_secondary || profile.secondaryPosition || "",
    dominant_hand: player.dominant_hand || profile.dominantHand || "",
    license_number: player.license_number || profile.licenseNumber || "",
    jersey_number: profile.jerseyNumber || "",
    jersey_color: profile.jerseyColor || "",
    nationality: profile.nationality || "",
    tutor1_phone: player.tutor1_phone || profile.guardian1Phone || "",
    tutor1_email: player.tutor1_email || profile.guardian1Email || "",
    tutor2_phone: player.tutor2_phone || profile.guardian2Phone || "",
    tutor2_email: player.tutor2_email || profile.guardian2Email || "",
    observations: profile.observations || "",
    provenance: profile.provenance || "",
    bone_age: profile.growth?.boneAge ?? "",
    sitting_height_cm: profile.growth?.sittingHeightCm ?? "",
  });

  useEffect(() => {
    setTab("Aperçu");
    setForm(buildForm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, player.updated_at]);

  useEffect(() => {
    void loadMeasurements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, structureId]);

  async function loadMeasurements() {
    const [s, m, ar] = await Promise.all([
      sb.from("institutional_player_tracking_seasons").select("id,season_label").eq("structure_id", structureId).eq("archived", false).order("season_label", { ascending: false }),
      sb.from("institutional_player_measurements").select("id,season_id,measured_at,height_cm,weight_kg,wingspan_cm,shoe_size").eq("structure_id", structureId).eq("player_id", player.id).order("measured_at", { ascending: false }),
      sb.from("institutional_player_attendance_records").select("id,session_id,player_id,status").eq("structure_id",structureId).eq("player_id",player.id),
    ]);
    if (!s.error) {
      const rows = (s.data || []) as Season[];
      setSeasons(rows);
      setMeasure((v) => ({ ...v, season_id: v.season_id || rows[0]?.id || "" }));
    }
    if (!m.error) setMeasurements((m.data || []) as Measurement[]);
    if (!ar.error) {
      const rows=(ar.data||[]) as AttendanceRecord[];setAttendanceRecords(rows);
      const ids=[...new Set(rows.map(x=>x.session_id))];
      if(ids.length){const q=await sb.from("institutional_player_attendance_sessions").select("id,session_date,title,location,session_type").in("id",ids).order("session_date",{ascending:false});if(!q.error)setAttendanceSessions((q.data||[]) as AttendanceSession[])} else setAttendanceSessions([]);
    }
  }

  const patch = (key: string, value: any) => setForm((v: any) => ({ ...v, [key]: value }));

  async function saveBase(extraProfile: Record<string, any> = {}) {
    setSaving("save");
    await onSave({
      ...form,
      profile_extra: extraProfile,
    });
    setSaving("");
  }

  async function uploadPhoto(file?: File) {
    if (!file) return;
    setSaving("photo");
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setSaving(""); return; }
    const path = `${structureId}/player/${player.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const up = await sb.storage.from("institutional-assets").upload(path, file, { upsert: false });
    if (up.error) { setSaving(""); alert(up.error.message); return; }
    const { data } = sb.storage.from("institutional-assets").getPublicUrl(path);
    patch("photo_url", data.publicUrl);
    await onSave({ ...form, photo_url: data.publicUrl, profile_extra: {} });
    setSaving("");
  }

  async function addMeasurement() {
    if (!measure.season_id) return alert("Crée ou sélectionne une saison avant d'ajouter une mesure.");
    const values = {
      height_cm: num(measure.height_cm),
      weight_kg: num(measure.weight_kg),
      wingspan_cm: num(measure.wingspan_cm),
      shoe_size: num(measure.shoe_size),
    };
    if (Object.values(values).every((x) => x == null)) return alert("Renseigne au moins une mesure.");
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    setSaving("measure");
    const q = await sb.from("institutional_player_measurements").insert({
      structure_id: structureId,
      player_id: player.id,
      season_id: measure.season_id,
      measured_at: measure.measured_at,
      ...values,
      created_by: user.id,
    });
    if (q.error) { setSaving(""); return alert(q.error.message); }
    const direct: any = {};
    if (values.height_cm != null) direct.height_cm = String(values.height_cm);
    if (values.weight_kg != null) direct.weight_kg = String(values.weight_kg);
    if (values.wingspan_cm != null) direct.wingspan_cm = String(values.wingspan_cm);
    setForm((v: any) => ({ ...v, ...direct }));
    await onSave({ ...form, ...direct, profile_extra: {} });
    setMeasure((v) => ({ ...v, measured_at: today(), height_cm: "", weight_kg: "", wingspan_cm: "", shoe_size: "" }));
    await loadMeasurements();
    setSaving("");
  }

  async function deleteMeasurement(id: string) {
    if (!confirm("Supprimer cette mesure ?")) return;
    const q = await sb.from("institutional_player_measurements").delete().eq("id", id).eq("player_id", player.id);
    if (q.error) return alert(q.error.message);
    await loadMeasurements();
  }

  async function saveProfileSection(key: string, value: any) {
    setSaving(key);
    await saveBase({ [key]: value });
    setSaving("");
  }

  const archived = Boolean(player.archived) || String(profile?.lifecycle?.workflowStatus) === "archived";
  const age = ageFromBirthdate(form.birthdate);
  const initials = `${form.first_name?.[0] || "?"}${form.last_name?.[0] || ""}`.toUpperCase();
  const latestMeasure = measurements[0] || null;
  const medicalEntries = Array.isArray(profile.medicalEntries) ? profile.medicalEntries : [];
  const bilans = Array.isArray(profile.bilans) ? profile.bilans : [];
  const documents = Array.isArray(profile.documents) ? profile.documents : [];
  const profiling = profile.profiling || {};
  const sportsReport = profile.sportsReport || {};
  const poleFollowup = profile.poleFollowup || {};
  const attendancePastIds=new Set(attendanceSessions.filter((x)=>x.session_date<=today()).map((x)=>x.id));
  const countedAttendance=attendanceRecords.filter((x)=>attendancePastIds.has(x.session_id));
  const attendanceTotal=countedAttendance.length;
  const attendancePresent=countedAttendance.filter((x)=>x.status==="present").length;
  const attendanceExcused=countedAttendance.filter((x)=>x.status==="excused").length;
  const attendanceAbsent=countedAttendance.filter((x)=>x.status==="absent").length;
  const attendanceRate=attendanceTotal?Math.round(attendancePresent/attendanceTotal*100):0;

  const selectionItems = Array.isArray(profile.selections) ? profile.selections : [];
  const strengths = clean(profiling.strengths).split(/[\n,;•]+/).map((x:string)=>x.trim()).filter(Boolean).slice(0,6);
  const workAxes = clean(profiling.workAxes).split(/[\n,;•]+/).map((x:string)=>x.trim()).filter(Boolean).slice(0,6);
  const objectives = clean(profiling.projection || poleFollowup.title).split(/[\n,;•]+/).map((x:string)=>x.trim()).filter(Boolean).slice(0,6);
  const recentNotes = [
    form.observations && { text: form.observations, meta: "Observation joueur" },
    profiling.notes && { text: profiling.notes, meta: "Note profil joueur" },
    referral?.reason && { text: referral.reason, meta: "Signalement d'origine" },
  ].filter(Boolean).slice(0,3) as {text:string;meta:string}[];

  return <div className="sheetBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="sheet" role="dialog" aria-modal="true" aria-label="Fiche joueur MyBasket">
      <div className="topBar">
        <button className="backLink" onClick={onClose}>← <span>Retour à la liste des joueurs</span></button>
        <div className="topActions">
          <button className="actionBtn" onClick={() => setTab("Informations")}>✎ <span>Modifier</span></button>
          {archived ? <button className="actionBtn success" onClick={onRestore}>↺ <span>Restaurer</span></button> : <button className="actionBtn" onClick={onArchive}>▣ <span>Archiver</span></button>}
          <button className="actionBtn danger" onClick={onDelete}>⌫ <span>Supprimer</span></button>
          <button className="close" onClick={onClose} aria-label="Fermer">×</button>
        </div>
      </div>

      <header className="playerHeader">
        <div className="playerIdentity">
          <div className="avatar">{form.photo_url ? <img src={form.photo_url} alt="" /> : initials}</div>
          <div className="playerTitle">
            <div className="nameRow"><h2>{form.first_name || "Joueur"} {form.last_name}</h2>{!archived && <span className="verified">✓</span>}</div>
            <p>Né le {fmtDate(form.birthdate)}{age != null ? ` (${age} ans)` : ""} <i>•</i> {form.sex === "F" ? "Féminin" : form.sex === "M" ? "Masculin" : "Sexe —"} <i>•</i> {form.nationality || "Nationalité —"}</p>
            <div className="headerFacts">
              <HeaderFact label="Club actuel" value={form.club_name || "—"} />
              <HeaderFact label="Catégorie" value={form.category || "—"} />
              <HeaderFact label="Poste principal" value={form.position || "—"} />
              <HeaderFact label="Poste secondaire" value={form.secondary_position || "—"} />
            </div>
          </div>
        </div>
        <div className="jerseyNumber">{form.jersey_number ? <><span>#</span>{form.jersey_number}</> : ""}</div>
      </header>

      <nav className="tabs">{TABS.map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</nav>

      <main className="content">
        {tab === "Aperçu" && <div className="dashboardGrid">
          <DashboardCard title="Profil rapide" className="profileQuick">
            <div className="quickGrid">
              <QuickFact icon="↕" label="Taille" value={form.height_cm ? `${form.height_cm} cm` : "—"} />
              <QuickFact icon="▤" label="Licence" value={form.license_number || "—"} />
              <QuickFact icon="◒" label="Poids" value={form.weight_kg ? `${form.weight_kg} kg` : "—"} />
              <QuickFact icon="⌂" label="Établissement" value={form.school || "—"} />
              <QuickFact icon="↔" label="Envergure" value={form.wingspan_cm ? `${form.wingspan_cm} cm` : "—"} />
              <QuickFact icon="◇" label="Classe" value={form.class_name || "—"} />
              <QuickFact icon="✋" label="Main dominante" value={form.dominant_hand || "—"} />
              <QuickFact icon="◉" label="Nationalité" value={form.nationality || "—"} />
            </div>
            <button className="textLink" onClick={() => setTab("Informations")}>Voir toutes les informations →</button>
          </DashboardCard>

          <DashboardCard title={seasons[0]?.season_label ? `Saison ${seasons[0].season_label}` : "Présences"} right={<button className="textLink" onClick={() => setTab("Informations")}>Voir le détail →</button>}>
            <div className="attendanceTop">
              <div><span>Présences</span><strong>{attendancePresent} / {attendanceTotal}</strong></div>
              <div className="rateRing" style={{"--rate": `${attendanceRate * 3.6}deg`} as React.CSSProperties}><b>{attendanceRate}%</b></div>
            </div>
            <div className="attendanceStats"><div><b>{attendanceAbsent}</b><span>Absences</span></div><div><b>{attendanceExcused}</b><span>Abs. excusées</span></div><div><b>{Math.max(0, attendanceTotal-attendancePresent-attendanceAbsent-attendanceExcused)}</b><span>En attente</span></div></div>
          </DashboardCard>

          <DashboardCard title="Sélections" right={<span className="mutedSmall">Historique</span>}>
            <div className="selectionList">{selectionItems.length ? selectionItems.slice(0,4).map((x:any, i:number)=><div className="selectionRow" key={x.id || i}><span className={`selectionDot dot${i%4}`} /><div><b>{x.name || x.title || "Sélection"}</b><span>{x.season || x.season_label || ""}</span></div><em>{x.status || "Sélectionné"}</em></div>) : <div className="emptyCompact">Aucune sélection rattachée.</div>}</div>
          </DashboardCard>

          <DashboardCard title="Derniers événements" right={<span className="mutedSmall">Convocations</span>}>
            <div className="eventList">{attendanceSessions.slice(0,5).map((session)=>{const row=attendanceRecords.find((r)=>r.session_id===session.id);return <div className="eventRow" key={session.id}><span>{fmtDate(session.session_date)}</span><b>{session.title}</b><StatusPill status={row?.status || "absent"} /></div>})}{!attendanceSessions.length&&<div className="emptyCompact">Aucun événement enregistré.</div>}</div>
          </DashboardCard>

          <DashboardCard title="Progression anthropométrique" right={<button className="textLink" onClick={() => setTab("Tests")}>Voir tous les tests →</button>}>
            <MiniChart measurements={measurements} />
          </DashboardCard>

          <DashboardCard title="Notes récentes" right={<button className="textLink" onClick={() => setTab("Profil joueur")}>Voir le profil →</button>}>
            <div className="notesList">{recentNotes.length ? recentNotes.map((n,i)=><div key={i}><b>{n.text.length > 82 ? `${n.text.slice(0,82)}…` : n.text}</b><span>{n.meta}</span></div>) : <div className="emptyCompact">Aucune note récente.</div>}</div>
          </DashboardCard>

          <DashboardCard title="Points forts" className="compactCard"><ChipList items={strengths} empty="Aucun point fort renseigné" /></DashboardCard>
          <DashboardCard title="Axes d’amélioration" className="compactCard"><ChipList items={workAxes} empty="Aucun axe renseigné" /></DashboardCard>
          <DashboardCard title="Objectifs" className="compactCard"><ChipList items={objectives} empty="Aucun objectif renseigné" /></DashboardCard>
        </div>}

        {tab === "Informations" && <section className="panel formPanel">
          <SectionTitle eyebrow="INFORMATIONS" title="Fiche joueur complète" help="Toutes les informations d'identité, sportives, scolaires et anthropométriques du joueur." />
          <div className="editLayout">
            <div className="photoCol"><div className="photoLarge">{form.photo_url ? <img src={form.photo_url} alt="" /> : initials}</div><label className="uploadBtn">Changer la photo<input type="file" accept="image/*" onChange={(e) => uploadPhoto(e.target.files?.[0])} /></label>{saving === "photo" && <small>Envoi de la photo…</small>}</div>
            <div className="fields">
              <Field label="Prénom" value={form.first_name} onChange={(v) => patch("first_name", v)} />
              <Field label="Nom" value={form.last_name} onChange={(v) => patch("last_name", v)} />
              <Field label="Date de naissance" type="date" value={form.birthdate} onChange={(v) => patch("birthdate", v)} />
              <Select label="Sexe" value={form.sex} onChange={(v) => patch("sex", v)} options={["M", "F"]} />
              <Field label="Club actuel" value={form.club_name} onChange={(v) => patch("club_name", v)} />
              <Field label="Catégorie" value={form.category} onChange={(v) => patch("category", v)} />
              <Select label="Poste principal" value={form.position} onChange={(v) => patch("position", v)} options={["Meneur", "Arrière", "Ailier", "Ailier-fort", "Pivot"]} />
              <Select label="Poste secondaire" value={form.secondary_position} onChange={(v) => patch("secondary_position", v)} options={["Meneur", "Arrière", "Ailier", "Ailier-fort", "Pivot"]} />
              <Field label="N° maillot" value={form.jersey_number} onChange={(v) => patch("jersey_number", v)} />
              <Field label="Couleur maillot" value={form.jersey_color} onChange={(v) => patch("jersey_color", v)} />
              <Field label="N° licence" value={form.license_number} onChange={(v) => patch("license_number", v)} />
              <Select label="Main dominante" value={form.dominant_hand} onChange={(v) => patch("dominant_hand", v)} options={["Droite", "Gauche", "Ambidextre"]} />
              <Field label="Nationalité" value={form.nationality} onChange={(v) => patch("nationality", v)} />
              <Field label="Établissement scolaire" value={form.school} onChange={(v) => patch("school", v)} />
              <Field label="Classe" value={form.class_name} onChange={(v) => patch("class_name", v)} />
              <Field label="Email" type="email" value={form.email} onChange={(v) => patch("email", v)} />
              <Field label="Téléphone" value={form.phone} onChange={(v) => patch("phone", v)} />
            </div>
          </div>
          <div className="subTitle">Anthropométrie & croissance</div>
          <div className="fields four">
            <Field label="Taille (cm)" type="number" value={form.height_cm} onChange={(v) => patch("height_cm", v)} />
            <Field label="Poids (kg)" type="number" value={form.weight_kg} onChange={(v) => patch("weight_kg", v)} />
            <Field label="Envergure (cm)" type="number" value={form.wingspan_cm} onChange={(v) => patch("wingspan_cm", v)} />
            <Field label="Taille assise (cm)" type="number" value={form.sitting_height_cm} onChange={(v) => patch("sitting_height_cm", v)} />
            <Field label="Taille père (cm)" type="number" value={form.father_height_cm} onChange={(v) => patch("father_height_cm", v)} />
            <Field label="Taille mère (cm)" type="number" value={form.mother_height_cm} onChange={(v) => patch("mother_height_cm", v)} />
            <Field label="Âge osseux" type="number" value={form.bone_age} onChange={(v) => patch("bone_age", v)} />
          </div>
          <div className="subTitle">Responsables / tuteurs</div>
          <div className="fields">
            <Field label="Téléphone tuteur 1" value={form.tutor1_phone} onChange={(v) => patch("tutor1_phone", v)} />
            <Field label="Email tuteur 1" type="email" value={form.tutor1_email} onChange={(v) => patch("tutor1_email", v)} />
            <Field label="Téléphone tuteur 2" value={form.tutor2_phone} onChange={(v) => patch("tutor2_phone", v)} />
            <Field label="Email tuteur 2" type="email" value={form.tutor2_email} onChange={(v) => patch("tutor2_email", v)} />
          </div>
          <label className="textArea">Observations<textarea value={form.observations} onChange={(e) => patch("observations", e.target.value)} /></label>
          <label className="textArea">Provenance<input value={form.provenance} onChange={(e) => patch("provenance", e.target.value)} /></label>
          <div className="saveLine"><button className="primary" disabled={saving === "save" || busy === "save_player"} onClick={() => saveBase({ growth: { ...(profile.growth || {}), boneAge: num(String(form.bone_age)), sittingHeightCm: num(String(form.sitting_height_cm)) } })}>{saving === "save" ? "Enregistrement…" : "Enregistrer la fiche"}</button></div>
        </section>}

        {tab === "Profil joueur" && <ProfileEditor value={profiling} saving={saving === "profiling"} onSave={(value) => saveProfileSection("profiling", value)} />}

        {tab === "Tests" && <section className="panel"><SectionTitle eyebrow="TESTS" title="Anthropométrie & mesures" help="Historique longitudinal : taille, poids, envergure et pointure." />
          <div className="measureCurrent"><Metric label="Taille actuelle" value={form.height_cm ? `${form.height_cm} cm` : "—"} /><Metric label="Poids actuel" value={form.weight_kg ? `${form.weight_kg} kg` : "—"} /><Metric label="Envergure actuelle" value={form.wingspan_cm ? `${form.wingspan_cm} cm` : "—"} /><Metric label="Dernière mesure" value={latestMeasure ? fmtDate(latestMeasure.measured_at) : "—"} /></div>
          <div className="measureForm"><select value={measure.season_id} onChange={(e) => setMeasure((v) => ({ ...v, season_id: e.target.value }))}><option value="">Saison</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.season_label}</option>)}</select><input type="date" value={measure.measured_at} onChange={(e) => setMeasure((v) => ({ ...v, measured_at: e.target.value }))} /><input placeholder="Taille cm" value={measure.height_cm} onChange={(e) => setMeasure((v) => ({ ...v, height_cm: e.target.value }))} /><input placeholder="Poids kg" value={measure.weight_kg} onChange={(e) => setMeasure((v) => ({ ...v, weight_kg: e.target.value }))} /><input placeholder="Envergure cm" value={measure.wingspan_cm} onChange={(e) => setMeasure((v) => ({ ...v, wingspan_cm: e.target.value }))} /><input placeholder="Pointure" value={measure.shoe_size} onChange={(e) => setMeasure((v) => ({ ...v, shoe_size: e.target.value }))} /><button className="primary" onClick={addMeasurement} disabled={saving === "measure"}>{saving === "measure" ? "Ajout…" : "+ Ajouter la mesure"}</button></div>
          <div className="measureTable"><div className="tr head"><span>Date</span><span>Taille</span><span>Poids</span><span>Envergure</span><span>Pointure</span><span /></div>{measurements.map((m) => <div className="tr" key={m.id}><span>{fmtDate(m.measured_at)}</span><b>{m.height_cm ? `${m.height_cm} cm` : "—"}</b><b>{m.weight_kg ? `${m.weight_kg} kg` : "—"}</b><b>{m.wingspan_cm ? `${m.wingspan_cm} cm` : "—"}</b><b>{m.shoe_size || "—"}</b><button className="iconDanger" onClick={() => deleteMeasurement(m.id)}>×</button></div>)}{!measurements.length && <div className="empty">Aucune mesure enregistrée.</div>}</div>
        </section>}

        {tab === "Grilles de tir" && <section className="panel"><SectionTitle eyebrow="GRILLES DE TIR" title="Suivi tir du joueur" help="Conserve ici les objectifs, grilles et remarques de travail liées au tir." /><SimpleNotes value={profile.shooting || {}} labels={{ title: "Objectif / grille en cours", notes: "Notes de tir" }} saving={saving === "shooting"} onSave={(v) => saveProfileSection("shooting", v)} /></section>}
        {tab === "Médical" && <ListEditor kind="medical" title="Suivi médical" eyebrow="MÉDICAL" items={medicalEntries} saving={saving === "medicalEntries"} onSave={(items) => saveProfileSection("medicalEntries", items)} />}
        {tab === "Bilans" && <ListEditor kind="bilan" title="Bilans joueur" eyebrow="BILANS" items={bilans} saving={saving === "bilans"} onSave={(items) => saveProfileSection("bilans", items)} />}
        {tab === "Bilan sportif" && <section className="panel"><SectionTitle eyebrow="BILAN SPORTIF" title="Bilan sportif partagé" help="Synthèse utilisable dans les transmissions et le suivi longitudinal." /><SimpleNotes value={sportsReport} labels={{ title: "Conclusion sportive", notes: "Forces, axes de progression, projection et recommandations" }} saving={saving === "sportsReport"} onSave={(v) => saveProfileSection("sportsReport", v)} /></section>}
        {tab === "Suivi Pôle" && <section className="panel"><SectionTitle eyebrow="SUIVI PÔLE" title="Suivi longitudinal" help="Les mesures, performances et observations restent rattachées à cette même fiche joueur au fil des saisons." /><div className="poleGrid"><div><b>{measurements.length}</b><span>mesures enregistrées</span></div><div><b>{form.father_height_cm || "—"}</b><span>taille père (cm)</span></div><div><b>{form.mother_height_cm || "—"}</b><span>taille mère (cm)</span></div><div><b>{form.wingspan_cm || "—"}</b><span>envergure (cm)</span></div></div><SimpleNotes value={poleFollowup} labels={{ title: "Objectif de suivi", notes: "Commentaires Pôle / projection / informations longitudinales" }} saving={saving === "poleFollowup"} onSave={(v) => saveProfileSection("poleFollowup", v)} /></section>}
        {tab === "Documents" && <DocumentsEditor structureId={structureId} playerId={player.id} items={documents} saving={saving === "documents"} onSave={(items) => saveProfileSection("documents", items)} />}
      </main>
      <style jsx>{css}</style>
    </aside>
  </div>;
}
function HeaderFact({ label, value }: { label: string; value: string }) { return <div className="headerFact"><span>{label}</span><b>{value}</b></div>; }

function DashboardCard({ title, right, className = "", children }: { title: string; right?: React.ReactNode; className?: string; children: React.ReactNode }) { return <section className={`dashCard ${className}`}><div className="dashCardHead"><h3>{title}</h3>{right}</div>{children}</section>; }

function QuickFact({ icon, label, value }: { icon: string; label: string; value: string }) { return <div className="quickFact"><span className="quickIcon">{icon}</span><div><span>{label}</span><b>{value}</b></div></div>; }

function StatusPill({ status }: { status: "present" | "absent" | "excused" }) { const text = status === "present" ? "Présent" : status === "excused" ? "Absent excusé" : "Absent"; return <strong className={`statusPill ${status}`}>{text}</strong>; }

function ChipList({ items, empty }: { items: string[]; empty: string }) { return <div className="chipList">{items.length ? items.map((x,i)=><span key={`${x}-${i}`}>{x}</span>) : <em>{empty}</em>}</div>; }

function MiniChart({ measurements }: { measurements: Measurement[] }) {
  const rows = [...measurements].reverse().slice(-6);
  if (!rows.length) return <div className="chartEmpty"><span>Aucune mesure historique</span><small>Ajoute des mesures dans l'onglet Tests.</small></div>;
  const w = 420, h = 150, pad = 18;
  const heights = rows.map(x => x.height_cm).filter((x): x is number => typeof x === "number");
  const weights = rows.map(x => x.weight_kg).filter((x): x is number => typeof x === "number");
  const norm = (value:number, all:number[]) => { const min=Math.min(...all), max=Math.max(...all); if(max===min) return h/2; return h-pad-((value-min)/(max-min))*(h-pad*2); };
  const hx = rows.map((r,i)=>r.height_cm==null?null:`${pad + i*((w-pad*2)/Math.max(1,rows.length-1))},${norm(r.height_cm,heights)}`).filter(Boolean).join(" ");
  const wx = rows.map((r,i)=>r.weight_kg==null?null:`${pad + i*((w-pad*2)/Math.max(1,rows.length-1))},${norm(r.weight_kg,weights)}`).filter(Boolean).join(" ");
  return <div className="chartWrap"><div className="chartLegend"><span><i className="blueDot"/>Taille (cm)</span><span><i className="greenDot"/>Poids (kg)</span></div><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Progression anthropométrique"><line x1={pad} y1={h-pad} x2={w-pad} y2={h-pad} className="gridLine"/><line x1={pad} y1={pad} x2={pad} y2={h-pad} className="gridLine"/>{hx && <polyline points={hx} className="heightLine"/>}{wx && <polyline points={wx} className="weightLine"/>}</svg><div className="chartDates">{rows.map((r)=><span key={r.id}>{new Date(r.measured_at).getFullYear()}</span>)}</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><b>{value}</b><span>{label}</span></div>; }
function Field({ label, value, onChange, type = "text" }: { label: string; value: any; onChange: (v: string) => void; type?: string }) { return <label>{label}<input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: any; onChange: (v: string) => void; options: string[] }) { return <label>{label}<select value={value ?? ""} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>; }

function ProfileEditor({ value, onSave, saving }: { value: any; onSave: (v: any) => void; saving: boolean }) {
  const [v, setV] = useState<any>({ profile: value.profile || "", strengths: value.strengths || "", workAxes: value.workAxes || "", projection: value.projection || "", notes: value.notes || "", ratings: { physique: 0, technique: 0, tactique: 0, mental: 0, relationnel: 0, ...(value.ratings || {}) } });
  useEffect(() => setV({ profile: value.profile || "", strengths: value.strengths || "", workAxes: value.workAxes || "", projection: value.projection || "", notes: value.notes || "", ratings: { physique: 0, technique: 0, tactique: 0, mental: 0, relationnel: 0, ...(value.ratings || {}) } }), [value]);
  return <section className="panel"><SectionTitle eyebrow="PROFIL JOUEUR" title="Profil joueur" help="Évaluation structurée, cohérente avec la fiche joueur Mes équipes." /><div className="ratings">{Object.entries(v.ratings).map(([k, x]) => <label key={k}>{k}<input type="range" min="0" max="10" step="1" value={Number(x)} onChange={(e) => setV((p: any) => ({ ...p, ratings: { ...p.ratings, [k]: Number(e.target.value) } }))} /><b>{String(x)}/10</b></label>)}</div><div className="twoText"><label>Profil<textarea value={v.profile} onChange={(e) => setV((p: any) => ({ ...p, profile: e.target.value }))} /></label><label>Points forts<textarea value={v.strengths} onChange={(e) => setV((p: any) => ({ ...p, strengths: e.target.value }))} /></label><label>Axes de travail<textarea value={v.workAxes} onChange={(e) => setV((p: any) => ({ ...p, workAxes: e.target.value }))} /></label><label>Projection<textarea value={v.projection} onChange={(e) => setV((p: any) => ({ ...p, projection: e.target.value }))} /></label></div><label className="textArea">Notes coach<textarea value={v.notes} onChange={(e) => setV((p: any) => ({ ...p, notes: e.target.value }))} /></label><div className="saveLine"><button className="primary" disabled={saving} onClick={() => onSave(v)}>{saving ? "Enregistrement…" : "Enregistrer le profil joueur"}</button></div></section>;
}

function SimpleNotes({ value, labels, saving, onSave }: { value: any; labels: { title: string; notes: string }; saving: boolean; onSave: (v: any) => void }) {
  const [v, setV] = useState({ title: value.title || "", notes: value.notes || "" });
  useEffect(() => setV({ title: value.title || "", notes: value.notes || "" }), [value]);
  return <div className="simpleNotes"><label>{labels.title}<input value={v.title} onChange={(e) => setV((p) => ({ ...p, title: e.target.value }))} /></label><label>{labels.notes}<textarea value={v.notes} onChange={(e) => setV((p) => ({ ...p, notes: e.target.value }))} /></label><div className="saveLine"><button className="primary" disabled={saving} onClick={() => onSave({ ...v, updatedAt: new Date().toISOString() })}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div></div>;
}

function ListEditor({ kind, title, eyebrow, items, saving, onSave }: { kind: "medical" | "bilan"; title: string; eyebrow: string; items: any[]; saving: boolean; onSave: (items: any[]) => void }) {
  const [draft, setDraft] = useState({ date: today(), title: "", status: kind === "medical" ? "Disponible" : "", notes: "" });
  const add = () => { if (!draft.title.trim() && !draft.notes.trim()) return; const next = [{ id: crypto.randomUUID(), ...draft, createdAt: new Date().toISOString() }, ...items]; onSave(next); setDraft({ date: today(), title: "", status: kind === "medical" ? "Disponible" : "", notes: "" }); };
  return <section className="panel"><SectionTitle eyebrow={eyebrow} title={title} help="Les entrées restent rattachées à la même fiche joueur." /><div className="listForm"><input type="date" value={draft.date} onChange={(e) => setDraft((v) => ({ ...v, date: e.target.value }))} /><input placeholder={kind === "medical" ? "Zone / blessure / objet" : "Type / titre du bilan"} value={draft.title} onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))} />{kind === "medical" && <select value={draft.status} onChange={(e) => setDraft((v) => ({ ...v, status: e.target.value }))}><option>Disponible</option><option>Blessé</option><option>Reprise</option><option>Aménagé</option><option>Absent</option></select>}<textarea placeholder="Notes" value={draft.notes} onChange={(e) => setDraft((v) => ({ ...v, notes: e.target.value }))} /><button className="primary" disabled={saving} onClick={add}>+ Ajouter</button></div><div className="entries">{items.map((x) => <article key={x.id}><div><b>{x.title || title}</b><span>{fmtDate(x.date)}{x.status ? ` · ${x.status}` : ""}</span><p>{x.notes}</p></div><button className="iconDanger" onClick={() => onSave(items.filter((i) => i.id !== x.id))}>×</button></article>)}{!items.length && <div className="empty">Aucune entrée.</div>}</div></section>;
}

function DocumentsEditor({ structureId, playerId, items, saving, onSave }: { structureId: string; playerId: string; items: any[]; saving: boolean; onSave: (items: any[]) => void }) {
  const sb = useMemo(() => createClient(), []);
  const [uploading, setUploading] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    const path = `${structureId}/player-documents/${playerId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const up = await sb.storage.from("institutional-assets").upload(path, file, { upsert: false });
    if (up.error) { setUploading(false); return alert(up.error.message); }
    const { data } = sb.storage.from("institutional-assets").getPublicUrl(path);
    onSave([{ id: crypto.randomUUID(), title: file.name, url: data.publicUrl, date: today(), size: file.size, type: file.type }, ...items]);
    setUploading(false);
  }
  return <section className="panel"><SectionTitle eyebrow="DOCUMENTS" title="Documents joueur" help="Documents rattachés à cette fiche joueur." right={<label className="uploadBtn">{uploading ? "Envoi…" : "+ Ajouter un document"}<input type="file" onChange={(e) => upload(e.target.files?.[0])} /></label>} /><div className="docs">{items.map((d) => <article key={d.id}><div><b>{d.title}</b><span>{fmtDate(d.date)}</span></div><div><a href={d.url} target="_blank" rel="noreferrer">Ouvrir</a><button className="iconDanger" disabled={saving} onClick={() => onSave(items.filter((x) => x.id !== d.id))}>×</button></div></article>)}{!items.length && <div className="empty">Aucun document.</div>}</div></section>;
}

const css = `
.sheetBack{position:fixed;inset:0;z-index:200;background:rgba(15,23,42,.45);backdrop-filter:blur(5px);display:grid;place-items:center;padding:14px}.sheet{width:min(1480px,99vw);height:min(960px,98vh);background:#f6f8fb;border-radius:18px;overflow:hidden;box-shadow:0 26px 90px rgba(15,23,42,.25);display:grid;grid-template-rows:auto auto auto 1fr;color:#16213d;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.topBar{height:58px;padding:0 22px;display:flex;align-items:center;justify-content:space-between;background:#f9fbfd;border-bottom:1px solid #e8edf4}.backLink{border:0;background:transparent;color:#173a7a;font-size:.78rem;font-weight:700;display:flex;gap:8px;align-items:center;cursor:pointer}.topActions{display:flex;gap:10px;align-items:center}.actionBtn,.close{height:38px;border-radius:9px;border:1px solid #dfe6ef;background:#fff;color:#2f466c;box-shadow:0 2px 7px rgba(30,64,175,.05);font-size:.73rem;font-weight:750;padding:0 13px;cursor:pointer}.actionBtn.danger{color:#e23b3b;border-color:#fecaca;background:#fff}.actionBtn.success{color:#178344;border-color:#bbf7d0}.close{width:38px;padding:0;font-size:1.22rem}.playerHeader{margin:16px 20px 0;background:#fff;border:1px solid #e3e9f1;border-radius:14px;padding:16px 18px;display:flex;align-items:flex-start;justify-content:space-between;box-shadow:0 2px 10px rgba(30,64,175,.045);min-height:146px}.playerIdentity{display:flex;gap:18px;align-items:flex-start;min-width:0}.avatar,.photoLarge{overflow:hidden;background:linear-gradient(145deg,#edf1f6,#dbe3ee);display:grid;place-items:center;color:#35517f;font-weight:900}.avatar{width:112px;height:128px;border-radius:11px;flex:0 0 auto;font-size:1.7rem}.avatar img,.photoLarge img{width:100%;height:100%;object-fit:cover}.playerTitle{padding-top:2px}.nameRow{display:flex;gap:8px;align-items:center}.nameRow h2{margin:0;font-size:1.55rem;letter-spacing:-.025em;color:#172341}.verified{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#17b26a;color:#fff;font-size:.68rem;font-weight:900}.playerTitle>p{margin:7px 0 18px;color:#60708d;font-size:.78rem;font-weight:550}.playerTitle>p i{font-style:normal;padding:0 7px;color:#c1cad8}.headerFacts{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:0}.headerFact{padding:0 24px;border-left:1px solid #e7ecf3}.headerFact:first-child{padding-left:0;border-left:0}.headerFact span,.headerFact b{display:block}.headerFact span{font-size:.67rem;color:#7888a2;margin-bottom:6px}.headerFact b{font-size:.82rem;color:#223e70}.jerseyNumber{font-size:3.1rem;font-weight:900;color:#18326c;line-height:1;padding:8px 10px}.jerseyNumber span{font-size:1.5rem;vertical-align:top;margin-right:5px;color:#5e7197}.tabs{display:flex;align-items:center;gap:2px;margin:14px 20px 0;background:#fff;border:1px solid #e3e9f1;border-radius:11px;overflow:auto;padding:0 8px;min-height:50px;box-shadow:0 2px 10px rgba(30,64,175,.035)}.tabs button{position:relative;border:0;background:transparent;color:#536684;padding:16px 11px 14px;font-size:.72rem;font-weight:720;white-space:nowrap;cursor:pointer}.tabs button.on{color:#1765e5}.tabs button.on:after{content:"";position:absolute;left:8px;right:8px;bottom:0;height:3px;border-radius:4px;background:#1d6ff2}.content{overflow:auto;padding:16px 20px 26px}.dashboardGrid{display:grid;grid-template-columns:1.08fr .92fr .9fr;gap:14px;max-width:1420px;margin:0 auto}.dashCard{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;min-height:220px;box-shadow:0 2px 10px rgba(30,64,175,.035)}.dashCard.compactCard{min-height:142px}.dashCardHead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px}.dashCardHead h3{font-size:.87rem;margin:0;color:#1d2c49}.textLink{border:0;background:transparent;color:#1765e5;font-size:.67rem;font-weight:700;cursor:pointer;padding:0}.mutedSmall{font-size:.64rem;color:#91a0b7}.quickGrid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}.quickFact{display:flex;align-items:center;gap:10px;padding:7px 0;min-width:0}.quickIcon{width:32px;height:32px;border-radius:8px;background:#f3f6fb;display:grid;place-items:center;color:#526a93;font-weight:900;flex:0 0 auto}.quickFact>div{min-width:0}.quickFact span:not(.quickIcon),.quickFact b{display:block}.quickFact>div>span{font-size:.65rem;color:#8290a8}.quickFact b{font-size:.77rem;color:#21365f;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.profileQuick .textLink{margin-top:10px}.attendanceTop{display:flex;justify-content:space-between;align-items:center;padding:8px 8px 14px}.attendanceTop>div:first-child span,.attendanceTop>div:first-child strong{display:block}.attendanceTop>div:first-child span{font-size:.69rem;color:#7e8ca4}.attendanceTop>div:first-child strong{font-size:1.85rem;color:#17326c;margin-top:4px}.rateRing{--rate:0deg;width:78px;height:78px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#18ad68 var(--rate),#e8edf4 0);position:relative}.rateRing:after{content:"";position:absolute;inset:8px;background:#fff;border-radius:50%}.rateRing b{position:relative;z-index:1;color:#203b70;font-size:1rem}.attendanceStats{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #edf1f5;padding-top:14px}.attendanceStats div{text-align:center;border-left:1px solid #edf1f5}.attendanceStats div:first-child{border-left:0}.attendanceStats b,.attendanceStats span{display:block}.attendanceStats b{font-size:1rem;color:#e54848}.attendanceStats div:nth-child(2) b{color:#1d8f57}.attendanceStats div:nth-child(3) b{color:#243c6e}.attendanceStats span{font-size:.62rem;color:#8190a8;margin-top:4px}.selectionList,.eventList,.notesList{display:grid;gap:0}.selectionRow{display:grid;grid-template-columns:12px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid #eef2f6}.selectionRow:first-child{border-top:0}.selectionDot{width:8px;height:8px;border-radius:50%}.dot0{background:#fb4c4c}.dot1{background:#f59e0b}.dot2{background:#8b5cf6}.dot3{background:#10b981}.selectionRow b,.selectionRow span{display:block}.selectionRow b{font-size:.73rem;color:#20365e}.selectionRow div span{font-size:.62rem;color:#8b98ad;margin-top:4px}.selectionRow em{font-style:normal;font-size:.6rem;background:#eaf7ee;color:#159256;padding:4px 7px;border-radius:7px}.eventRow{display:grid;grid-template-columns:78px 1fr auto;gap:8px;align-items:center;padding:10px 0;border-top:1px solid #eef2f6}.eventRow:first-child{border-top:0}.eventRow>span{font-size:.62rem;color:#7887a0}.eventRow>b{font-size:.71rem;color:#20375f}.statusPill{font-size:.58rem;padding:5px 7px;border-radius:7px}.statusPill.present{background:#e8f7ed;color:#179452}.statusPill.excused{background:#fff3da;color:#bd6c00}.statusPill.absent{background:#fee9ea;color:#d43f47}.chartWrap{padding-top:4px}.chartLegend{display:flex;gap:18px;font-size:.62rem;color:#74839b;margin-bottom:5px}.chartLegend span{display:flex;align-items:center;gap:5px}.chartLegend i{width:7px;height:7px;border-radius:50%}.blueDot{background:#2475f3}.greenDot{background:#17a868}.chartWrap svg{width:100%;height:132px;overflow:visible}.gridLine{stroke:#edf1f5;stroke-width:1}.heightLine,.weightLine{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.heightLine{stroke:#2475f3}.weightLine{stroke:#17a868}.chartDates{display:flex;justify-content:space-between;font-size:.58rem;color:#8794aa}.chartEmpty,.emptyCompact{display:grid;place-items:center;text-align:center;color:#8794aa;min-height:130px;font-size:.7rem}.chartEmpty small{margin-top:6px;color:#a1adbe}.notesList>div{padding:10px 0;border-top:1px solid #eef2f6}.notesList>div:first-child{border-top:0}.notesList b,.notesList span{display:block}.notesList b{font-size:.7rem;color:#263b62;line-height:1.35}.notesList span{font-size:.6rem;color:#8b98ad;margin-top:5px}.chipList{display:flex;flex-wrap:wrap;gap:8px}.chipList span{padding:7px 10px;border-radius:999px;background:#f0f3f7;color:#435675;font-size:.66rem}.chipList em{font-style:normal;color:#95a2b5;font-size:.68rem}.panel{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;max-width:1200px;margin:0 auto;box-shadow:0 2px 10px rgba(30,64,175,.035)}.sectionTitle{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:18px}.sectionTitle p{margin:0;color:#1765e5;font-size:.58rem;font-weight:850;letter-spacing:.1em}.sectionTitle h3{margin:4px 0 0;color:#1d2c49;font-size:1rem}.sectionTitle span{display:block;margin-top:4px;color:#8492a8;font-size:.69rem;max-width:760px;line-height:1.45}.formPanel{max-width:1260px}.editLayout{display:grid;grid-template-columns:150px 1fr;gap:24px;align-items:start}.photoCol{display:grid;gap:9px}.photoLarge{width:140px;height:164px;border-radius:12px;font-size:1.7rem}.uploadBtn{display:inline-flex;align-items:center;justify-content:center;background:#fff;border:1px solid #dfe6ef;border-radius:8px;padding:8px 10px;cursor:pointer;color:#31517f;font-size:.68rem;font-weight:750}.uploadBtn input{display:none}.fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 14px}.fields.four{grid-template-columns:repeat(4,minmax(0,1fr))}.fields label,.textArea,.simpleNotes label,.twoText label{display:grid;gap:5px;color:#4b5d78;font-size:.66rem;font-weight:750}.fields input,.fields select,.textArea input,.textArea textarea,.simpleNotes input,.simpleNotes textarea,.twoText textarea,.measureForm input,.measureForm select,.listForm input,.listForm select,.listForm textarea{border:1px solid #dfe5ed;border-radius:8px;padding:9px 10px;font:inherit;background:#fff;min-width:0;outline:none;color:#263957}.fields input:focus,.fields select:focus,.textArea input:focus,.textArea textarea:focus,.simpleNotes input:focus,.simpleNotes textarea:focus,.twoText textarea:focus,.measureForm input:focus,.measureForm select:focus,.listForm input:focus,.listForm select:focus,.listForm textarea:focus{border-color:#72a7f6;box-shadow:0 0 0 3px rgba(29,111,242,.09)}.subTitle{margin:20px 0 10px;padding-top:16px;border-top:1px solid #edf1f5;color:#263c65;font-size:.78rem;font-weight:850}.textArea{margin-top:14px}.textArea textarea{min-height:95px;resize:vertical}.saveLine{display:flex;justify-content:flex-end;margin-top:14px}.primary,.soft,.ghost,.archive,.restore,.delete{border-radius:8px;padding:9px 12px;font-weight:750;cursor:pointer;font-size:.72rem}.primary{border:0;background:#1765e5;color:#fff}.metricGrid,.measureCurrent{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.metric{border:1px solid #e5eaf1;background:#fbfcfe;border-radius:9px;padding:11px}.metric b{display:block;color:#23406f;font-size:.95rem}.metric span{display:block;color:#8290a6;font-size:.62rem;margin-top:3px}.ratings{display:grid;grid-template-columns:repeat(5,1fr);gap:9px}.ratings label{display:grid;grid-template-columns:1fr auto;gap:4px;align-items:center;padding:10px;border:1px solid #e5eaf1;border-radius:9px;color:#3c5579;font-size:.66rem;font-weight:750;background:#fbfcfe}.ratings input{grid-column:1/-1}.twoText{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.twoText textarea,.simpleNotes textarea{min-height:105px}.measureForm{display:grid;grid-template-columns:1.15fr 1fr repeat(4,1fr) auto;gap:7px;margin:16px 0}.measureTable{border:1px solid #e3e8ef;border-radius:9px;overflow:hidden;background:#fff}.tr{display:grid;grid-template-columns:1.2fr repeat(4,1fr) 34px;gap:8px;align-items:center;padding:9px 11px;border-top:1px solid #edf1f5;font-size:.72rem}.tr.head{border-top:0;background:#f7f9fc;color:#335076;font-size:.65rem;font-weight:850}.iconDanger{width:28px;height:28px;border:1px solid #fecaca;border-radius:7px;background:#fff;color:#dc3c43;font-weight:900;cursor:pointer}.simpleNotes{display:grid;gap:12px}.listForm{display:grid;grid-template-columns:145px 1fr 170px;gap:8px}.listForm textarea{grid-column:1/-1;min-height:80px}.entries,.docs{display:grid;gap:7px;margin-top:16px}.entries article,.docs article{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid #e5eaf1;border-radius:9px;padding:11px;background:#fbfcfe}.entries b,.entries span,.docs b,.docs span{display:block}.entries span,.docs span{font-size:.66rem;color:#8492a8}.entries p{margin:6px 0 0;white-space:pre-wrap}.poleGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:16px}.poleGrid div{padding:13px;border:1px solid #e5eaf1;border-radius:9px;background:#fbfcfe}.poleGrid b{display:block;font-size:1.05rem;color:#23406f}.poleGrid span{font-size:.62rem;color:#8492a8}.docs article>div:last-child{display:flex;gap:8px;align-items:center}.docs a{color:#1765e5;font-weight:750}.empty{padding:20px;text-align:center;color:#8d9aaf;border:1px dashed #d7dfe9;border-radius:9px;background:#fbfcfe}.soft,.ghost{background:#fff;border:1px solid #dfe6ef;color:#31517f}.archive{background:#fff;border:1px solid #f1ddb3;color:#8b6100}.restore{background:#effaf3;border:1px solid #bce8ca;color:#177a43}.delete{background:#fff;border:1px solid #fecaca;color:#d83d46}
@media(max-width:1100px){.dashboardGrid{grid-template-columns:1fr 1fr}.headerFacts{grid-template-columns:repeat(2,1fr);gap:10px}.headerFact:nth-child(3){padding-left:0;border-left:0}.fields,.fields.four,.ratings,.poleGrid{grid-template-columns:1fr 1fr}.measureForm{grid-template-columns:1fr 1fr}.measureForm button{grid-column:1/-1}}
@media(max-width:760px){.sheetBack{padding:0}.sheet{width:100%;height:100vh;border-radius:0}.topBar{padding:0 12px}.topActions .actionBtn span,.backLink span{display:none}.playerHeader{margin:10px 10px 0;padding:12px;min-height:auto}.playerIdentity{gap:12px}.avatar{width:74px;height:90px}.nameRow h2{font-size:1.15rem}.playerTitle>p{margin:5px 0 10px}.headerFacts{grid-template-columns:1fr 1fr}.headerFact{padding:0 10px}.jerseyNumber{display:none}.tabs{margin:10px 10px 0}.content{padding:10px}.dashboardGrid{grid-template-columns:1fr}.dashCard{min-height:auto}.editLayout{grid-template-columns:1fr}.fields,.fields.four,.ratings,.twoText,.poleGrid,.quickGrid{grid-template-columns:1fr}.photoCol{grid-template-columns:140px 1fr;align-items:start}.measureTable{overflow:auto}.tr{min-width:700px}.listForm{grid-template-columns:1fr}.eventRow{grid-template-columns:72px 1fr auto}}
`;

