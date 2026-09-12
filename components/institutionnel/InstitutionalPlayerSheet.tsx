"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import InstitutionalPlayerPerformance from "@/components/institutionnel/InstitutionalPlayerPerformance";

const TABS = [
  "Aperçu",
  "Informations",
  "Stats & Vidéo",
  "Profilage",
  "Tests",
  "Charge & récup.",
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
  const recovery = profile.recovery || {};
  const sportsReport = profile.sportsReport || {};
  const poleFollowup = profile.poleFollowup || {};
  const attendancePastIds=new Set(attendanceSessions.filter((x)=>x.session_date<=today()).map((x)=>x.id));
  const countedAttendance=attendanceRecords.filter((x)=>attendancePastIds.has(x.session_id));
  const attendanceTotal=countedAttendance.length;
  const attendancePresent=countedAttendance.filter((x)=>x.status==="present").length;
  const attendanceExcused=countedAttendance.filter((x)=>x.status==="excused").length;
  const attendanceAbsent=countedAttendance.filter((x)=>x.status==="absent").length;
  const attendanceRate=attendanceTotal?Math.round(attendancePresent/attendanceTotal*100):0;

  return <div className="sheetBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="sheet" role="dialog" aria-modal="true" aria-label="Fiche joueur MyBasket">
      <header className="hero">
        <div className="identity">
          <div className="avatar">{form.photo_url ? <img src={form.photo_url} alt="" /> : initials}</div>
          <div>
            <div className="badges"><span className={archived ? "badge archived" : "badge validated"}>{archived ? "Archivé" : "Base joueurs · Validé"}</span><span className="source">FICHE JOUEUR MYBASKET</span></div>
            <h2>{form.first_name || "Joueur"} {form.last_name}</h2>
            <p>{[form.club_name || "Club non renseigné", form.category || "Catégorie —", form.position || "Poste —"].join(" · ")}</p>
            <div className="facts"><span><b>{form.jersey_number ? `#${form.jersey_number}` : "—"}</b><small>Maillot</small></span><span><b>{form.height_cm ? `${form.height_cm} cm` : "—"}</b><small>Taille</small></span><span><b>{form.wingspan_cm ? `${form.wingspan_cm} cm` : "—"}</b><small>Envergure</small></span><span><b>{age == null ? "—" : `${age} ans`}</b><small>Âge</small></span></div>
          </div>
        </div>
        <button className="close" onClick={onClose} aria-label="Fermer">×</button>
      </header>

      <nav className="tabs">{TABS.map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</nav>

      <main className="content">
        {tab === "Aperçu" && <div className="overview">
          <section className="panel wide"><SectionTitle eyebrow="APERÇU" title="Identité & situation" help="La même fiche sert pour l'Institution, les détections, les passations et le suivi longitudinal." right={<button className="soft" onClick={() => setTab("Informations")}>Modifier la fiche</button>} />
            <div className="infoGrid"><Info label="Nom complet" value={`${form.first_name} ${form.last_name}`} /><Info label="Date de naissance" value={fmtDate(form.birthdate)} /><Info label="Club" value={form.club_name} /><Info label="Catégorie" value={form.category} /><Info label="Poste principal" value={form.position} /><Info label="Poste secondaire" value={form.secondary_position} /><Info label="Main dominante" value={form.dominant_hand} /><Info label="Nationalité" value={form.nationality} /></div>
          </section>
          <section className="panel"><SectionTitle eyebrow="ANTHROPOMÉTRIE" title="Mesures actuelles" help="Dernières valeurs connues de la fiche joueur." />
            <div className="metricGrid"><Metric label="Taille" value={form.height_cm ? `${form.height_cm} cm` : "—"} /><Metric label="Poids" value={form.weight_kg ? `${form.weight_kg} kg` : "—"} /><Metric label="Envergure" value={form.wingspan_cm ? `${form.wingspan_cm} cm` : "—"} /><Metric label="Taille assise" value={form.sitting_height_cm ? `${form.sitting_height_cm} cm` : "—"} /></div>
            <div className="parents"><Info label="Taille père" value={form.father_height_cm ? `${form.father_height_cm} cm` : "—"} /><Info label="Taille mère" value={form.mother_height_cm ? `${form.mother_height_cm} cm` : "—"} /><Info label="Âge osseux" value={form.bone_age ? `${form.bone_age} ans` : "—"} /></div>
          </section>
          <section className="panel"><SectionTitle eyebrow="ASSIDUITÉ" title="Présences & convocations" help="Calculé uniquement sur les événements où ce joueur était convoqué." />
            <div className="metricGrid"><Metric label="Taux de présence" value={`${attendanceRate}%`} /><Metric label="Présent / convoqué" value={`${attendancePresent}/${attendanceTotal}`} /><Metric label="Excusé" value={String(attendanceExcused)} /><Metric label="Absent" value={String(attendanceAbsent)} /></div>
            <div className="attendanceMini">{attendanceSessions.slice(0,5).map((session)=>{const row=attendanceRecords.find((r)=>r.session_id===session.id);return <div key={session.id}><div><b>{session.title}</b><span>{fmtDate(session.session_date)} · {session.location||"Lieu non renseigné"}</span></div><strong className={row?.status||"absent"}>{row?.status==="present"?"Présent":row?.status==="excused"?"Excusé":"Absent"}</strong></div>})}{!attendanceSessions.length&&<div className="empty">Aucune convocation enregistrée.</div>}</div>
          </section>
          <section className="panel"><SectionTitle eyebrow="OBSERVATIONS" title="Notes joueur" /><p className="notes">{form.observations || "Aucune observation renseignée."}</p></section>
          <section className="panel"><SectionTitle eyebrow="ORIGINE" title="Provenance de la fiche" /><div className="origin"><b>{profile.origin === "referral" ? "Signalement validé" : "Création institutionnelle"}</b><span>{form.provenance || "Provenance non renseignée"}</span>{referral && <small>Signalé par {referral.reporter_name || referral.reporter_email} · {fmtDate(referral.created_at)}</small>}</div></section>
        </div>}

        {tab === "Informations" && <section className="panel formPanel">
          <SectionTitle eyebrow="INFORMATIONS" title="Fiche joueur complète" help="Les champs correspondent au socle utilisé dans Mes équipes. Les informations connues sont préremplies depuis le signalement." />
          <div className="editLayout">
            <div className="photoCol"><div className="photoLarge">{form.photo_url ? <img src={form.photo_url} alt="" /> : initials}</div><label className="upload">Photo du joueur<input type="file" accept="image/*" onChange={(e) => uploadPhoto(e.target.files?.[0])} /></label>{saving === "photo" && <small>Envoi de la photo…</small>}</div>
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

        {tab === "Stats & Vidéo" && <section className="panel performance"><SectionTitle eyebrow="STATS & VIDÉO" title="Performance du joueur" help="Données institutionnelles et statistiques disponibles pour ce joueur." /><InstitutionalPlayerPerformance structureId={structureId} player={{ id: player.id, first_name: player.first_name, last_name: player.last_name, photo_url: player.photo_url }} /></section>}

        {tab === "Profilage" && <ProfileEditor value={profiling} saving={saving === "profiling"} onSave={(value) => saveProfileSection("profiling", value)} />}

        {tab === "Tests" && <section className="panel"><SectionTitle eyebrow="TESTS" title="Anthropométrie & mesures" help="Historique longitudinal : taille, poids, envergure et pointure." />
          <div className="measureCurrent"><Metric label="Taille actuelle" value={form.height_cm ? `${form.height_cm} cm` : "—"} /><Metric label="Poids actuel" value={form.weight_kg ? `${form.weight_kg} kg` : "—"} /><Metric label="Envergure actuelle" value={form.wingspan_cm ? `${form.wingspan_cm} cm` : "—"} /><Metric label="Dernière mesure" value={latestMeasure ? fmtDate(latestMeasure.measured_at) : "—"} /></div>
          <div className="measureForm"><select value={measure.season_id} onChange={(e) => setMeasure((v) => ({ ...v, season_id: e.target.value }))}><option value="">Saison</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.season_label}</option>)}</select><input type="date" value={measure.measured_at} onChange={(e) => setMeasure((v) => ({ ...v, measured_at: e.target.value }))} /><input placeholder="Taille cm" value={measure.height_cm} onChange={(e) => setMeasure((v) => ({ ...v, height_cm: e.target.value }))} /><input placeholder="Poids kg" value={measure.weight_kg} onChange={(e) => setMeasure((v) => ({ ...v, weight_kg: e.target.value }))} /><input placeholder="Envergure cm" value={measure.wingspan_cm} onChange={(e) => setMeasure((v) => ({ ...v, wingspan_cm: e.target.value }))} /><input placeholder="Pointure" value={measure.shoe_size} onChange={(e) => setMeasure((v) => ({ ...v, shoe_size: e.target.value }))} /><button onClick={addMeasurement} disabled={saving === "measure"}>{saving === "measure" ? "Ajout…" : "+ Ajouter la mesure"}</button></div>
          <div className="measureTable"><div className="tr head"><span>Date</span><span>Taille</span><span>Poids</span><span>Envergure</span><span>Pointure</span><span /></div>{measurements.map((m) => <div className="tr" key={m.id}><span>{fmtDate(m.measured_at)}</span><b>{m.height_cm ? `${m.height_cm} cm` : "—"}</b><b>{m.weight_kg ? `${m.weight_kg} kg` : "—"}</b><b>{m.wingspan_cm ? `${m.wingspan_cm} cm` : "—"}</b><b>{m.shoe_size || "—"}</b><button className="iconDanger" onClick={() => deleteMeasurement(m.id)}>×</button></div>)}{!measurements.length && <div className="empty">Aucune mesure enregistrée.</div>}</div>
        </section>}

        {tab === "Charge & récup." && <RecoveryEditor value={recovery} saving={saving === "recovery"} onSave={(value) => saveProfileSection("recovery", value)} />}

        {tab === "Grilles de tir" && <section className="panel"><SectionTitle eyebrow="GRILLES DE TIR" title="Suivi tir du joueur" help="La fiche conserve le même onglet que Mes équipes. Les tirs issus du codage apparaissent dans Stats & Vidéo ; tu peux aussi conserver ici les objectifs et remarques de travail." /><SimpleNotes value={profile.shooting || {}} labels={{ title: "Objectif / grille en cours", notes: "Notes de tir" }} saving={saving === "shooting"} onSave={(v) => saveProfileSection("shooting", v)} /></section>}

        {tab === "Médical" && <ListEditor kind="medical" title="Suivi médical" eyebrow="MÉDICAL" items={medicalEntries} saving={saving === "medicalEntries"} onSave={(items) => saveProfileSection("medicalEntries", items)} />}

        {tab === "Bilans" && <ListEditor kind="bilan" title="Bilans joueur" eyebrow="BILANS" items={bilans} saving={saving === "bilans"} onSave={(items) => saveProfileSection("bilans", items)} />}

        {tab === "Bilan sportif" && <section className="panel"><SectionTitle eyebrow="BILAN SPORTIF" title="Bilan sportif partagé" help="Synthèse utilisable dans les transmissions et le suivi longitudinal." /><SimpleNotes value={sportsReport} labels={{ title: "Conclusion sportive", notes: "Forces, axes de progression, projection et recommandations" }} saving={saving === "sportsReport"} onSave={(v) => saveProfileSection("sportsReport", v)} /></section>}

        {tab === "Suivi Pôle" && <section className="panel"><SectionTitle eyebrow="SUIVI PÔLE" title="Suivi longitudinal" help="Les mesures, performances et observations restent rattachées à cette même fiche joueur au fil des saisons." /><div className="poleGrid"><div><b>{measurements.length}</b><span>mesures enregistrées</span></div><div><b>{form.father_height_cm || "—"}</b><span>taille père (cm)</span></div><div><b>{form.mother_height_cm || "—"}</b><span>taille mère (cm)</span></div><div><b>{form.wingspan_cm || "—"}</b><span>envergure (cm)</span></div></div><SimpleNotes value={poleFollowup} labels={{ title: "Objectif de suivi", notes: "Commentaires Pôle / projection / informations longitudinales" }} saving={saving === "poleFollowup"} onSave={(v) => saveProfileSection("poleFollowup", v)} /></section>}

        {tab === "Documents" && <DocumentsEditor structureId={structureId} playerId={player.id} items={documents} saving={saving === "documents"} onSave={(items) => saveProfileSection("documents", items)} />}
      </main>

      <footer className="footer">
        <div>{archived ? <button className="restore" onClick={onRestore}>Restaurer dans la base</button> : <button className="archive" onClick={onArchive}>Archiver</button>}<button className="delete" onClick={onDelete}>Supprimer la fiche</button></div>
        <div><button className="ghost" onClick={onClose}>Fermer</button><button className="primary" disabled={saving === "save" || busy === "save_player"} onClick={() => saveBase({ growth: { ...(profile.growth || {}), boneAge: num(String(form.bone_age)), sittingHeightCm: num(String(form.sitting_height_cm)) } })}>Enregistrer</button></div>
      </footer>
      <style jsx>{css}</style>
    </aside>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><b>{value}</b><span>{label}</span></div>; }
function Field({ label, value, onChange, type = "text" }: { label: string; value: any; onChange: (v: string) => void; type?: string }) { return <label>{label}<input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: any; onChange: (v: string) => void; options: string[] }) { return <label>{label}<select value={value ?? ""} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>; }

function ProfileEditor({ value, onSave, saving }: { value: any; onSave: (v: any) => void; saving: boolean }) {
  const [v, setV] = useState<any>({ profile: value.profile || "", strengths: value.strengths || "", workAxes: value.workAxes || "", projection: value.projection || "", notes: value.notes || "", ratings: { physique: 0, technique: 0, tactique: 0, mental: 0, relationnel: 0, ...(value.ratings || {}) } });
  useEffect(() => setV({ profile: value.profile || "", strengths: value.strengths || "", workAxes: value.workAxes || "", projection: value.projection || "", notes: value.notes || "", ratings: { physique: 0, technique: 0, tactique: 0, mental: 0, relationnel: 0, ...(value.ratings || {}) } }), [value]);
  return <section className="panel"><SectionTitle eyebrow="PROFILAGE" title="Profil joueur" help="Évaluation structurée, cohérente avec la fiche joueur Mes équipes." /><div className="ratings">{Object.entries(v.ratings).map(([k, x]) => <label key={k}>{k}<input type="range" min="0" max="10" step="1" value={Number(x)} onChange={(e) => setV((p: any) => ({ ...p, ratings: { ...p.ratings, [k]: Number(e.target.value) } }))} /><b>{String(x)}/10</b></label>)}</div><div className="twoText"><label>Profil<textarea value={v.profile} onChange={(e) => setV((p: any) => ({ ...p, profile: e.target.value }))} /></label><label>Points forts<textarea value={v.strengths} onChange={(e) => setV((p: any) => ({ ...p, strengths: e.target.value }))} /></label><label>Axes de travail<textarea value={v.workAxes} onChange={(e) => setV((p: any) => ({ ...p, workAxes: e.target.value }))} /></label><label>Projection<textarea value={v.projection} onChange={(e) => setV((p: any) => ({ ...p, projection: e.target.value }))} /></label></div><label className="textArea">Notes coach<textarea value={v.notes} onChange={(e) => setV((p: any) => ({ ...p, notes: e.target.value }))} /></label><div className="saveLine"><button className="primary" disabled={saving} onClick={() => onSave(v)}>{saving ? "Enregistrement…" : "Enregistrer le profilage"}</button></div></section>;
}

function RecoveryEditor({ value, onSave, saving }: { value: any; onSave: (v: any) => void; saving: boolean }) {
  const [v, setV] = useState<any>({ sleep: value.sleep ?? 5, fatigue: value.fatigue ?? 5, soreness: value.soreness ?? 5, stress: value.stress ?? 5, notes: value.notes || "" });
  useEffect(() => setV({ sleep: value.sleep ?? 5, fatigue: value.fatigue ?? 5, soreness: value.soreness ?? 5, stress: value.stress ?? 5, notes: value.notes || "" }), [value]);
  return <section className="panel"><SectionTitle eyebrow="CHARGE & RÉCUP." title="État du joueur" help="Suivi simple stocké dans la fiche institutionnelle." /><div className="recoveryGrid">{[["Sommeil", "sleep"], ["Fatigue", "fatigue"], ["Douleurs", "soreness"], ["Stress", "stress"]].map(([label, key]) => <label key={key}><span>{label}</span><input type="range" min="1" max="10" value={v[key]} onChange={(e) => setV((p: any) => ({ ...p, [key]: Number(e.target.value) }))} /><b>{v[key]}/10</b></label>)}</div><label className="textArea">Commentaire<textarea value={v.notes} onChange={(e) => setV((p: any) => ({ ...p, notes: e.target.value }))} /></label><div className="saveLine"><button className="primary" disabled={saving} onClick={() => onSave({ ...v, updatedAt: new Date().toISOString() })}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div></section>;
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
.sheetBack{position:fixed;inset:0;z-index:200;background:rgba(28,10,17,.64);backdrop-filter:blur(6px);display:grid;place-items:center;padding:22px}.sheet{width:min(1460px,97vw);height:min(960px,95vh);background:#f8f6f4;border-radius:28px;overflow:hidden;box-shadow:0 36px 120px rgba(29,9,16,.36);display:grid;grid-template-rows:auto auto 1fr auto;color:#2b2022}.hero{padding:24px 28px;background:linear-gradient(135deg,#42101b,#6b1a2c 55%,#8b3046);display:flex;justify-content:space-between;gap:24px;color:#fff}.identity{display:flex;gap:20px;align-items:center}.avatar,.photoLarge{overflow:hidden;background:linear-gradient(145deg,#eee0db,#fff);color:#6b1a2c;display:grid;place-items:center;font-weight:1000}.avatar{width:104px;height:126px;border-radius:22px;border:3px solid rgba(255,255,255,.35);font-size:1.8rem}.avatar img,.photoLarge img{width:100%;height:100%;object-fit:cover}.badges{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.badge,.source{font-size:.66rem;font-weight:1000;letter-spacing:.06em}.badge{border-radius:999px;padding:6px 9px}.badge.validated{background:#dff3e5;color:#1f6633}.badge.archived{background:#e9e3e0;color:#665854}.source{color:#efc86e}.hero h2{margin:8px 0 2px;font-size:2rem}.hero p{margin:0;color:#f0dce2;font-weight:750}.facts{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.facts span{min-width:84px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:8px 11px}.facts b,.facts small{display:block}.facts small{font-size:.62rem;color:#ead7dc;margin-top:2px}.close{width:44px;height:44px;border:1px solid rgba(255,255,255,.28);border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font-size:1.5rem;cursor:pointer}.close:hover{background:#fff;color:#6b1a2c}.tabs{display:flex;gap:6px;padding:11px 18px;background:#fff;border-bottom:1px solid #e7dcd6;overflow:auto}.tabs button{border:0;border-radius:999px;background:#f5f0ed;color:#6b1a2c;padding:9px 13px;font-weight:950;white-space:nowrap;cursor:pointer}.tabs button.on{background:#6b1a2c;color:#fff}.content{overflow:auto;padding:24px 28px 34px}.overview{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;max-width:1180px;margin:0 auto}.panel{background:#fff;border:1px solid #e7dad4;border-radius:22px;padding:20px;box-shadow:0 9px 28px rgba(55,25,33,.035);max-width:1180px;margin:0 auto}.overview .panel{margin:0}.overview .wide{grid-row:span 2}.sectionTitle{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.sectionTitle p{margin:0;color:#d4a24c;font-size:.67rem;font-weight:1000;letter-spacing:.13em}.sectionTitle h3{margin:5px 0 0;color:#4c1420;font-size:1.08rem}.sectionTitle span{display:block;margin-top:4px;color:#85756f;font-size:.76rem;max-width:760px}.soft,.ghost,.primary,.archive,.restore,.delete{border-radius:11px;padding:10px 14px;font-weight:950;cursor:pointer}.soft{background:#fff8ed;border:1px solid #ecd9b4;color:#6b1a2c}.infoGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 22px}.info{display:grid;gap:4px}.info span{color:#8b7b75;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;font-weight:850}.info b{color:#32272a;font-size:.94rem}.metricGrid,.measureCurrent{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.metric{border:1px solid #eee3de;background:#fcfaf9;border-radius:14px;padding:13px;text-align:center}.metric b{display:block;color:#6b1a2c;font-size:1.15rem}.metric span{display:block;color:#8b7c76;font-size:.68rem;margin-top:3px}.parents{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid #eee4df}.notes{white-space:pre-wrap;line-height:1.6;color:#44373a}.origin{display:grid;gap:5px;padding:14px;border:1px solid #efdcb3;background:#fff9ef;border-radius:15px}.origin b{color:#6b1a2c}.origin span,.origin small{color:#806f69}.formPanel{max-width:1220px}.editLayout{display:grid;grid-template-columns:190px 1fr;gap:24px;align-items:start}.photoCol{display:grid;gap:10px}.photoLarge{width:180px;height:220px;border-radius:20px;font-size:2rem}.upload,.uploadBtn{display:grid;gap:5px;color:#6b1a2c;font-size:.72rem;font-weight:900}.upload input{font-size:.68rem}.uploadBtn{display:inline-flex;background:#fff8ed;border:1px solid #ecd9b4;border-radius:10px;padding:9px 12px;cursor:pointer}.uploadBtn input{display:none}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px}.fields.four{grid-template-columns:repeat(4,minmax(0,1fr))}.fields label,.textArea,.simpleNotes label,.twoText label{display:grid;gap:6px;color:#5b2935;font-size:.72rem;font-weight:900}.fields input,.fields select,.textArea input,.textArea textarea,.simpleNotes input,.simpleNotes textarea,.twoText textarea,.measureForm input,.measureForm select,.listForm input,.listForm select,.listForm textarea{border:1px solid #d9cbc5;border-radius:11px;padding:10px 11px;font:inherit;background:#fff;min-width:0}.subTitle{margin:24px 0 12px;padding-top:20px;border-top:1px solid #eee5e1;color:#6b1a2c;font-weight:1000}.textArea{margin-top:16px}.textArea textarea{min-height:120px;resize:vertical}.saveLine{display:flex;justify-content:flex-end;margin-top:16px}.primary{border:0;background:#6b1a2c;color:#fff}.performance{max-width:1320px}.ratings{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.ratings label{display:grid;grid-template-columns:1fr auto;gap:5px;align-items:center;padding:12px;border:1px solid #ece1dc;border-radius:14px;color:#6b1a2c;font-size:.73rem;font-weight:950}.ratings input{grid-column:1/-1}.twoText{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.twoText textarea,.simpleNotes textarea{min-height:120px}.measureForm{display:grid;grid-template-columns:1.2fr 1fr repeat(4,1fr) auto;gap:7px;margin:18px 0}.measureTable{border:1px solid #e8ddd7;border-radius:14px;overflow:hidden}.tr{display:grid;grid-template-columns:1.2fr repeat(4,1fr) 34px;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid #eee4df}.tr.head{border-top:0;background:#faf7f5;color:#6b1a2c;font-size:.72rem;font-weight:1000}.iconDanger{width:30px;height:30px;border:1px solid #eccaca;border-radius:8px;background:#fff;color:#a32727;font-weight:1000;cursor:pointer}.recoveryGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.recoveryGrid label{display:grid;grid-template-columns:1fr auto;gap:5px;padding:14px;border:1px solid #ebe0db;border-radius:14px}.recoveryGrid input{grid-column:1/-1}.simpleNotes{display:grid;gap:14px}.listForm{display:grid;grid-template-columns:150px 1fr 180px;gap:8px}.listForm textarea{grid-column:1/-1;min-height:90px}.entries,.docs{display:grid;gap:8px;margin-top:18px}.entries article,.docs article{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid #e9dfda;border-radius:14px;padding:12px}.entries b,.entries span,.docs b,.docs span{display:block}.entries span,.docs span{font-size:.72rem;color:#8b7d77}.entries p{margin:6px 0 0;white-space:pre-wrap}.poleGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.poleGrid div{padding:16px;border-radius:14px;background:#f8f4f1;text-align:center}.poleGrid b{display:block;font-size:1.3rem;color:#6b1a2c}.poleGrid span{font-size:.68rem;color:#887972}.docs article>div:last-child{display:flex;gap:8px;align-items:center}.docs a{color:#6b1a2c;font-weight:900}.empty{padding:24px;text-align:center;color:#8d7f79;border:1px dashed #ddcec7;border-radius:12px}.footer{display:flex;justify-content:space-between;gap:12px;padding:14px 20px;background:#fff;border-top:1px solid #e5dad4}.footer>div{display:flex;gap:8px;flex-wrap:wrap}.ghost{background:#fff;border:1px solid #d8c8c1;color:#6b1a2c}.archive{background:#fff4dd;border:1px solid #e6c574;color:#7a5208}.restore{background:#e9f6ec;border:1px solid #b9dfc2;color:#246638}.delete{background:#fff;border:1px solid #e9bebe;color:#a92323}
.attendanceMini{display:grid;gap:7px;margin-top:14px}.attendanceMini>div{display:flex;justify-content:space-between;gap:10px;align-items:center;border-top:1px solid #eee4df;padding-top:8px}.attendanceMini b,.attendanceMini span{display:block}.attendanceMini span{font-size:.7rem;color:#8b7d77}.attendanceMini strong{border-radius:999px;padding:5px 8px;font-size:.68rem}.attendanceMini strong.present{background:#e6f5e9;color:#23663a}.attendanceMini strong.excused{background:#fff3d6;color:#80570a}.attendanceMini strong.absent{background:#fdebec;color:#9d2731}
@media(max-width:1000px){.overview{grid-template-columns:1fr}.overview .wide{grid-row:auto}.fields.four,.ratings,.recoveryGrid,.poleGrid{grid-template-columns:1fr 1fr}.measureForm{grid-template-columns:1fr 1fr}.measureForm button{grid-column:1/-1}.editLayout{grid-template-columns:1fr}.photoCol{grid-template-columns:180px 1fr}.footer{align-items:flex-start;flex-direction:column}.footer>div:last-child{width:100%;justify-content:flex-end}}
@media(max-width:650px){.sheetBack{padding:6px}.sheet{width:100%;height:99vh;border-radius:18px}.hero{padding:16px}.identity{align-items:flex-start}.avatar{width:74px;height:90px;border-radius:14px}.hero h2{font-size:1.45rem}.facts{display:none}.content{padding:14px}.fields,.fields.four,.infoGrid,.metricGrid,.measureCurrent,.parents,.ratings,.twoText,.recoveryGrid,.poleGrid{grid-template-columns:1fr}.photoCol{grid-template-columns:1fr}.listForm{grid-template-columns:1fr}.tr{min-width:700px}.measureTable{overflow:auto}.footer>div{width:100%}.footer button{flex:1}}
`;
