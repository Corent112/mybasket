"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TrainingPlanningBoard from "@/components/formation/TrainingPlanningBoard";
import PedagogicalScenarioEditor from "@/components/formation/PedagogicalScenarioEditor";

type Program = { id: string; name: string; code: string | null };
type Cohort = {
  id: string;
  program_id: string;
  name: string;
  capacity: number | null;
  fee_amount_cents?: number | null;
  currency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  registration_open?: boolean | null;
  training_programs?: { name?: string | null; code?: string | null } | null;
};
type Candidate = {
  id: string;
  cohort_id: string;
  user_id: string;
  status: string;
  progression: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  club_name?: string | null;
  license_number?: string | null;
  birthdate?: string | null;
  notes?: string | null;
  administrative_status?: string | null;
  fee_override_cents?: number | null;
  payment_exempt?: boolean | null;
  payment_note?: string | null;
};
type RequirementKind = "checkbox" | "form" | "payment" | "teachup" | "document";
type Requirement = { id: string; title: string; instructions: string | null; due_at: string | null; is_required?: boolean; requirement_type?: RequirementKind | null; external_url?: string | null; sort_order?: number | null };
type Submission = { id: string; request_id: string; candidate_id: string; status: string; current_version: number; reviewer_comment: string | null };
type Payment = { id: string; candidate_id: string; amount_cents: number; payment_method: string; paid_at: string; reference?: string | null; notes?: string | null };
type AttendanceSession = { id: string; cohort_id: string; title: string; session_date: string; start_time?: string | null; end_time?: string | null; location?: string | null; is_required: boolean };
type Attendance = { id: string; session_id: string; candidate_id: string; status: string; notes?: string | null };
type Evaluation = { id: string; candidate_id: string; status: string; score?: number | null; result?: string | null; strengths?: string | null; development_areas?: string | null; notes?: string | null };

type Tab = "registered" | "attendance" | "documents" | "planning" | "scenario" | "communication" | "settings";

const ADMIN_STATUS: Record<string, string> = {
  invited: "Invité",
  in_progress: "Dossier en cours",
  incomplete: "Dossier incomplet",
  complete: "Dossier complet",
  registered: "Inscrit",
  in_training: "En formation",
  validated: "Formation validée",
  withdrawn: "Abandon",
};
const DOC_STATUS: Record<string, string> = {
  missing: "Manquant",
  requested: "Demandé",
  received: "Reçu",
  submitted: "Reçu",
  validated: "Validé",
  changes_requested: "À corriger",
  rejected: "Refusé",
  expired: "Expiré",
};
const PAYMENT_METHOD: Record<string, string> = { card: "Carte", transfer: "Virement", cash: "Espèces", check: "Chèque", other: "Autre" };
const ATTENDANCE_STATUS: Record<string, string> = { unknown: "—", present: "Présent", late: "Retard", excused: "Excusé", absent: "Absent" };
const EVAL_STATUS: Record<string, string> = { not_started: "En cours", in_progress: "En cours", validated: "Validé", rejected: "Non validé" };
const REQUIREMENT_KIND: Record<RequirementKind, { label: string; icon: string; help: string }> = {
  checkbox: { label: "Case à cocher", icon: "☑️", help: "Une action simple à confirmer." },
  form: { label: "Formulaire", icon: "📝", help: "Un formulaire à compléter ou à réaliser." },
  payment: { label: "Paiement", icon: "💳", help: "Un paiement obligatoire à confirmer." },
  teachup: { label: "Inscription TeachUp", icon: "🎓", help: "L’inscription TeachUp doit être réalisée." },
  document: { label: "Document", icon: "📄", help: "Document à fournir ou à compléter. Les fichiers seront ajoutés ensuite." },
};

function money(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format((cents || 0) / 100);
}
function initials(candidate: Candidate) {
  return `${candidate.first_name?.[0] || candidate.email?.[0] || "?"}${candidate.last_name?.[0] || ""}`.toUpperCase();
}

export default function TrainingManager({ institutionId }: { institutionId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [attendance, setAttendanceRows] = useState<Attendance[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>("registered");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showCandidate, setShowCandidate] = useState(false);
  const [busy, setBusy] = useState(false);

  const [newProgram, setNewProgram] = useState("BFA");
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [newCohort, setNewCohort] = useState("Promotion 2026/2027");
  const [newCohortDates, setNewCohortDates] = useState({ start_date: "", end_date: "" });
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateForm, setCandidateForm] = useState({
    first_name: "",
    last_name: "",
    club_name: "",
    birthdate: "",
    phone: "",
    email: "",
    cohort_id: "",
  });
  const [reqTitle, setReqTitle] = useState("");
  const [reqInstructions, setReqInstructions] = useState("");
  const [reqDue, setReqDue] = useState("");
  const [reqKind, setReqKind] = useState<RequirementKind>("checkbox");
  const [reqExternalUrl, setReqExternalUrl] = useState("");
  const [sessionForm, setSessionForm] = useState({ title: "Journée de formation", session_date: new Date().toISOString().slice(0, 10), start_time: "09:00", end_time: "17:00", location: "" });
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "transfer", reference: "", notes: "" });
  const [messageForm, setMessageForm] = useState({ subject: "", body: "", type: "message" });

  const cohort = cohorts.find((item) => item.id === cohortId) || null;
  const selectedCandidate = candidates.find((item) => item.id === selectedCandidateId) || null;

  async function loadCohort(id: string) {
    if (!id) return;
    const [c, r, sub, pay, ses, att, evals] = await Promise.all([
      supabase.from("training_candidates").select("*").eq("cohort_id", id).order("created_at"),
      supabase.from("training_document_requests").select("*").eq("cohort_id", id).order("created_at"),
      supabase.from("training_document_submissions").select("*,training_document_requests!inner(cohort_id)").eq("training_document_requests.cohort_id", id),
      supabase.from("training_candidate_payments").select("*").eq("cohort_id", id).order("paid_at", { ascending: false }),
      supabase.from("training_attendance_sessions").select("*").eq("cohort_id", id).order("session_date"),
      supabase.from("training_candidate_attendance").select("*,training_attendance_sessions!inner(cohort_id)").eq("training_attendance_sessions.cohort_id", id),
      supabase.from("training_candidate_evaluations").select("*").eq("cohort_id", id),
    ]);
    const loadedCandidates = (c.data || []) as Candidate[];
    setCandidates(loadedCandidates);
    setRequirements((r.data || []) as Requirement[]);
    setSubmissions((sub.data || []) as unknown as Submission[]);
    setPayments((pay.data || []) as Payment[]);
    setSessions((ses.data || []) as AttendanceSession[]);
    setAttendanceRows((att.data || []) as unknown as Attendance[]);
    setEvaluations((evals.data || []) as Evaluation[]);
    const first = loadedCandidates[0]?.id || "";
    setSelectedCandidateId((current) => (current && loadedCandidates.some((candidate) => candidate.id === current) ? current : first));
    setChecked(new Set());
  }

  async function reload(preferred?: string) {
    let pq = supabase.from("training_programs").select("*").order("created_at", { ascending: false });
    let cq = supabase.from("training_cohorts").select("*,training_programs(name,code)").order("created_at", { ascending: false });
    if (institutionId) {
      pq = pq.eq("institution_id", institutionId);
      cq = cq.eq("institution_id", institutionId);
    }
    const [p, c] = await Promise.all([pq, cq]);
    const loadedPrograms = (p.data || []) as Program[];
    setPrograms(loadedPrograms);
    setSelectedProgramId((current) => current && loadedPrograms.some((x) => x.id === current) ? current : (loadedPrograms[0]?.id || ""));
    setCohorts((c.data || []) as unknown as Cohort[]);
    const next = preferred || cohortId || c.data?.[0]?.id || "";
    setCohortId(next);
    if (next) await loadCohort(next);
  }

  useEffect(() => { void reload(); }, [institutionId]); // eslint-disable-line react-hooks/exhaustive-deps

  function submissionFor(candidateId: string, requestId: string) {
    return submissions.find((item) => item.candidate_id === candidateId && item.request_id === requestId);
  }
  function requiredDocuments() { return requirements.filter((item) => item.is_required !== false); }
  function documentStats(candidate: Candidate) {
    const required = requiredDocuments();
    const validated = required.filter((item) => submissionFor(candidate.id, item.id)?.status === "validated").length;
    return { validated, total: required.length, complete: required.length === 0 || validated === required.length };
  }
  function expectedFee(candidate: Candidate) {
    if (candidate.payment_exempt) return 0;
    return candidate.fee_override_cents ?? cohort?.fee_amount_cents ?? 0;
  }
  function paymentStats(candidate: Candidate) {
    const expected = expectedFee(candidate);
    const paid = payments.filter((item) => item.candidate_id === candidate.id).reduce((sum, item) => sum + (item.amount_cents || 0), 0);
    const complete = candidate.payment_exempt || expected === 0 || paid >= expected;
    return { expected, paid, complete, remaining: Math.max(0, expected - paid) };
  }
  function attendanceStats(candidate: Candidate) {
    const required = sessions.filter((item) => item.is_required !== false);
    const records = required.map((session) => attendance.find((item) => item.session_id === session.id && item.candidate_id === candidate.id));
    const present = records.filter((item) => item?.status === "present" || item?.status === "late").length;
    const absent = records.filter((item) => item?.status === "absent").length;
    return { present, total: required.length, absent };
  }
  function evaluationFor(candidate: Candidate) { return evaluations.find((item) => item.candidate_id === candidate.id) || null; }
  function autoAdminStatus(candidate: Candidate) {
    if (candidate.administrative_status === "validated" || candidate.administrative_status === "withdrawn" || candidate.administrative_status === "in_training") return candidate.administrative_status;
    const docs = documentStats(candidate);
    const pay = paymentStats(candidate);
    if (docs.complete && pay.complete) return "registered";
    if (docs.complete) return "complete";
    return requirements.length ? "incomplete" : "in_progress";
  }
  function candidateProgress(candidate: Candidate) {
    const docs = documentStats(candidate);
    const pay = paymentStats(candidate);
    const att = attendanceStats(candidate);
    const evalStatus = evaluationFor(candidate)?.status === "validated";
    const parts = [docs.complete, pay.complete, sessions.length === 0 || att.present === att.total, evalStatus];
    return Math.round((parts.filter(Boolean).length / parts.length) * 100);
  }

  const filtered = candidates.filter((candidate) => {
    const text = `${candidate.first_name || ""} ${candidate.last_name || ""} ${candidate.email || ""} ${candidate.club_name || ""}`.toLowerCase();
    const status = autoAdminStatus(candidate);
    return text.includes(search.toLowerCase()) && (filter === "all" || status === filter || (filter === "unpaid" && !paymentStats(candidate).complete) || (filter === "incomplete" && !documentStats(candidate).complete));
  });

  const kpis = useMemo(() => ({
    total: candidates.length,
    dossier: candidates.filter((c) => documentStats(c).complete).length,
    paid: candidates.filter((c) => paymentStats(c).complete).length,
    ready: candidates.filter((c) => documentStats(c).complete && paymentStats(c).complete).length,
  }), [candidates, requirements, submissions, payments, cohort]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createProgram() {
    const name = newProgram.trim();
    if (!name) return alert("Renseigne le type de formation.");
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert("Session expirée. Reconnecte-toi.");
      const q = await supabase.from("training_programs").insert({ name, code: name, created_by: user.id, institution_id: institutionId || null }).select("*").single();
      if (q.error) return alert(`Création du type impossible : ${q.error.message}`);
      const created = q.data as Program;
      setPrograms((items) => [created, ...items.filter((x) => x.id !== created.id)]);
      setSelectedProgramId(created.id);
      setNewProgram("");
    } finally { setBusy(false); }
  }
  async function createCohort() {
    const programId = selectedProgramId || programs[0]?.id || "";
    const name = newCohort.trim();
    if (!programId) return alert("Crée ou sélectionne d’abord un type de formation.");
    if (!name) return alert("Renseigne le nom de la promotion.");
    setBusy(true);
    try {
      if (newCohortDates.start_date && newCohortDates.end_date && newCohortDates.end_date < newCohortDates.start_date) return alert("La date de fin doit être après la date de début.");
      const q = await supabase.from("training_cohorts").insert({
        program_id: programId,
        name,
        planning_title: name,
        status: "active",
        institution_id: institutionId || null,
        start_date: newCohortDates.start_date || null,
        end_date: newCohortDates.end_date || null,
      }).select("id").single();
      if (q.error) return alert(`Création de la promotion impossible : ${q.error.message}`);
      await reload(q.data.id);
      setCohortId(q.data.id);
      setNewCohortDates({ start_date: "", end_date: "" });
      setTab("registered");
    } finally { setBusy(false); }
  }
  function openCandidateForm() {
    setCandidateForm({ first_name: "", last_name: "", club_name: "", birthdate: "", phone: "", email: "", cohort_id: cohortId });
    setShowAddCandidate(true);
  }
  async function addCandidate() {
    const targetCohortId = candidateForm.cohort_id || cohortId;
    if (!targetCohortId) return alert("Choisis la formation du candidat.");
    if (!candidateForm.last_name.trim() || !candidateForm.first_name.trim()) return alert("Renseigne le nom et le prénom du candidat.");
    if (!candidateForm.email.trim()) return alert("Renseigne l’adresse email du candidat.");
    setBusy(true);
    try {
      const response = await fetch(institutionId ? "/api/institutionnel/training/candidates" : "/api/training/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortId: targetCohortId,
          firstName: candidateForm.first_name.trim(),
          lastName: candidateForm.last_name.trim(),
          clubName: candidateForm.club_name.trim(),
          birthdate: candidateForm.birthdate || null,
          phone: candidateForm.phone.trim(),
          email: candidateForm.email.trim(),
        }),
      });
      const json = await response.json();
      if (!response.ok) return alert(json.error || "Impossible d’ajouter le candidat");
      setShowAddCandidate(false);
      setCandidateForm({ first_name: "", last_name: "", club_name: "", birthdate: "", phone: "", email: "", cohort_id: "" });
      setCohortId(targetCohortId);
      setTab("registered");
      await loadCohort(targetCohortId);
      if (json.candidateId) setSelectedCandidateId(json.candidateId);
    } finally { setBusy(false); }
  }
  async function patchCandidate(candidateId: string, patch: Partial<Candidate>) {
    const q = await supabase.from("training_candidates").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", candidateId);
    if (q.error) return alert(q.error.message);
    setCandidates((items) => items.map((item) => item.id === candidateId ? { ...item, ...patch } : item));
  }
  async function addRequirement() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !cohortId || !reqTitle.trim()) return;
    const q = await supabase.from("training_document_requests").insert({ cohort_id: cohortId, title: reqTitle.trim(), instructions: reqInstructions || null, due_at: reqDue ? new Date(`${reqDue}T23:59:59`).toISOString() : null, is_required: true, requirement_type: reqKind, external_url: reqExternalUrl.trim() || null, created_by: user.id });
    if (q.error) return alert(q.error.message);
    setReqTitle(""); setReqInstructions(""); setReqDue(""); setReqExternalUrl(""); setReqKind("checkbox");
    await loadCohort(cohortId);
  }
  async function removeRequirement(requirement: Requirement) {
    if (!confirm(`Supprimer « ${requirement.title} » des éléments obligatoires ?`)) return;
    await supabase.from("training_document_submissions").delete().eq("request_id", requirement.id);
    const q = await supabase.from("training_document_requests").delete().eq("id", requirement.id);
    if (q.error) return alert(q.error.message);
    await loadCohort(cohortId);
  }
  function requirementDone(candidateId: string, requestId: string) {
    return submissionFor(candidateId, requestId)?.status === "validated";
  }
  async function toggleRequirement(candidateId: string, requestId: string, done: boolean) {
    await setDocumentStatus(candidateId, requestId, done ? "validated" : "missing");
  }
  async function setDocumentStatus(candidateId: string, requestId: string, status: string) {
    const response = await fetch(institutionId ? "/api/institutionnel/training/candidate-documents" : "/api/training/candidate-documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", candidateId, requestId, status }) });
    const json = await response.json();
    if (!response.ok) return alert(json.error || "Impossible de modifier le document");
    await loadCohort(cohortId);
  }
  async function addPayment(candidate: Candidate) {
    const amount = Math.round(Number(paymentForm.amount.replace(",", ".")) * 100);
    if (!Number.isFinite(amount) || amount <= 0) return alert("Montant invalide");
    const { data: { user } } = await supabase.auth.getUser();
    const q = await supabase.from("training_candidate_payments").insert({ cohort_id: cohortId, candidate_id: candidate.id, amount_cents: amount, payment_method: paymentForm.method, reference: paymentForm.reference || null, notes: paymentForm.notes || null, created_by: user?.id || null });
    if (q.error) return alert(q.error.message);
    setPaymentForm({ amount: "", method: "transfer", reference: "", notes: "" });
    await loadCohort(cohortId);
  }
  async function createSession() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!cohortId || !sessionForm.title.trim()) return;
    const q = await supabase.from("training_attendance_sessions").insert({ cohort_id: cohortId, ...sessionForm, location: sessionForm.location || null, is_required: true, created_by: user?.id || null });
    if (q.error) return alert(q.error.message);
    await loadCohort(cohortId);
  }
  async function setAttendance(sessionId: string, candidateId: string, status: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const existing = attendance.find((item) => item.session_id === sessionId && item.candidate_id === candidateId);
    const payload = { session_id: sessionId, candidate_id: candidateId, status, updated_by: user?.id || null, updated_at: new Date().toISOString() };
    const q = existing ? await supabase.from("training_candidate_attendance").update(payload).eq("id", existing.id) : await supabase.from("training_candidate_attendance").insert(payload);
    if (q.error) return alert(q.error.message);
    await loadCohort(cohortId);
  }
  async function saveEvaluation(candidate: Candidate, patch: Partial<Evaluation>) {
    const { data: { user } } = await supabase.auth.getUser();
    const current = evaluationFor(candidate);
    const payload = { cohort_id: cohortId, candidate_id: candidate.id, ...patch, evaluated_by: user?.id || null, evaluated_at: patch.status === "validated" ? new Date().toISOString() : current?.status === "validated" ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
    const q = current ? await supabase.from("training_candidate_evaluations").update(payload).eq("id", current.id) : await supabase.from("training_candidate_evaluations").insert(payload);
    if (q.error) return alert(q.error.message);
    await loadCohort(cohortId);
  }
  async function updateCohort(patch: Partial<Cohort>) {
    if (!cohort) return;
    const q = await supabase.from("training_cohorts").update(patch).eq("id", cohort.id);
    if (q.error) return alert(q.error.message);
    setCohorts((items) => items.map((item) => item.id === cohort.id ? { ...item, ...patch } : item));
  }
  async function sendMessage(mode: "selected" | "all" | "missing_documents") {
    const ids = mode === "all" ? candidates.map((c) => c.id) : [...checked];
    if (mode !== "all" && ids.length === 0) return alert("Sélectionne au moins un candidat.");
    const response = await fetch(institutionId ? "/api/institutionnel/training/messages" : "/api/training/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "candidate_bulk", cohortId, candidateIds: ids, template: mode === "missing_documents" ? "missing_documents" : "custom", messageType: messageForm.type, subject: messageForm.subject, body: messageForm.body }) });
    const json = await response.json();
    if (!response.ok) return alert(json.error || "Envoi impossible");
    alert(`${json.sent ?? ids.length} message(s) traité(s).`);
  }
  async function downloadCohortPdf(type: "participants" | "attendance") {
    const response = await fetch(institutionId ? "/api/institutionnel/training/cohort-documents" : "/api/training/cohort-documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cohortId, type }) });
    if (!response.ok) { const json = await response.json().catch(() => ({})); return alert(json.error || "PDF impossible"); }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${type}-${cohort?.name || "formation"}.pdf`; a.click(); URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const rows = [["Prénom","Nom","Email","Club","Dossier","Cotisation","Présence","Évaluation","Statut"], ...filtered.map((c) => {
      const d = documentStats(c), p = paymentStats(c), a = attendanceStats(c), e = evaluationFor(c);
      return [c.first_name || "", c.last_name || "", c.email || "", c.club_name || "", `${d.validated}/${d.total}`, `${p.paid / 100}/${p.expected / 100}`, `${a.present}/${a.total}`, EVAL_STATUS[e?.status || "not_started"] || "À faire", ADMIN_STATUS[autoAdminStatus(c)] || autoAdminStatus(c)];
    })];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `inscrits-${cohort?.name || "formation"}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function toggleCandidate(id: string) {
    setChecked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleAll() {
    setChecked((current) => current.size === filtered.length && filtered.length ? new Set() : new Set(filtered.map((c) => c.id)));
  }

  return <main className="training-root">
    <section className="formation-switcher">
      <div className="formation-title"><div><p>FORMATION DES CADRES</p><h2>Gestion des formations & des inscrits</h2><span>Une formation centralise dossier, cotisation, présence, documents, évaluations et communications.</span></div>{cohort && <div className="cohort-score"><b>{kpis.ready}/{kpis.total}</b><small>prêts administrativement</small></div>}</div>
      <div className="switch-row">
        <select value={cohortId} onChange={async (e) => { setCohortId(e.target.value); setTab("registered"); await loadCohort(e.target.value); }}><option value="">Choisir une formation</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.training_programs?.name ? `${c.training_programs.name} · ` : ""}{c.name}</option>)}</select>
        <details><summary>+ Créer une formation</summary><div className="create-pop"><label>Type / diplôme<input value={newProgram} onChange={(e) => setNewProgram(e.target.value)} placeholder="Ex. BFA" /></label><button disabled={busy} onClick={createProgram}>Créer le type</button><label>Type utilisé<select value={selectedProgramId} onChange={(e)=>setSelectedProgramId(e.target.value)}><option value="">Sélectionner un type</option>{programs.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Promotion<input value={newCohort} onChange={(e) => setNewCohort(e.target.value)} /></label><div className="date-pair"><label>Date de début<input type="date" value={newCohortDates.start_date} onChange={(e)=>setNewCohortDates({...newCohortDates,start_date:e.target.value})}/></label><label>Date de fin<input type="date" value={newCohortDates.end_date} onChange={(e)=>setNewCohortDates({...newCohortDates,end_date:e.target.value})}/></label></div><button disabled={busy} onClick={createCohort}>Créer la promotion</button></div></details>
      </div>
    </section>

    {!cohort ? <div className="empty-state">Crée ou sélectionne une formation pour commencer.</div> : <>
      <nav className="training-tabs">
        {([['registered','Inscrits'],['attendance','Présences'],['documents','Dossier & pièces'],['planning','Planning'],['scenario','Scénario pédagogique'],['communication','Communication'],['settings','Paramètres']] as [Tab,string][]).map(([key,label]) => <button key={key} onClick={() => setTab(key)} className={tab === key ? "active" : ""}>{label}</button>)}
      </nav>

      {tab === "registered" && <>
        <section className="kpis"><article><b>{kpis.total}</b><span>Inscrits</span></article><article><b>{kpis.dossier}</b><span>Dossiers complets</span></article><article><b>{kpis.paid}</b><span>Cotisations OK</span></article><article><b>{kpis.ready}</b><span>Prêts</span></article></section>
        <section className="toolbar">
          <button className="add-candidate-main" disabled={busy} onClick={openCandidateForm}>+ Ajouter un candidat</button>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher nom, club, email…" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Tous</option><option value="incomplete">Dossier incomplet</option><option value="unpaid">Cotisation à régler</option>{Object.entries(ADMIN_STATUS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
          <button className="ghost" onClick={exportCsv}>Exporter CSV</button><button className="ghost" onClick={() => void downloadCohortPdf("participants")}>Liste PDF</button>
        </section>
        {checked.size > 0 && <section className="bulk"><b>{checked.size} sélectionné(s)</b><button onClick={() => setTab("communication")}>Envoyer un message</button><button onClick={() => void sendMessage("missing_documents")}>Relancer pièces manquantes</button><button className="ghost" onClick={() => setChecked(new Set())}>Annuler</button></section>}
        <section className="table-card"><div className="table-scroll"><table><thead><tr><th><input type="checkbox" checked={filtered.length > 0 && checked.size === filtered.length} onChange={toggleAll} /></th><th>Candidat</th><th>Dossier</th><th>Cotisation</th><th>Documents</th><th>Présence</th><th>Évaluation</th><th>Statut</th><th></th></tr></thead><tbody>{filtered.map((candidate) => {
          const docs = documentStats(candidate), pay = paymentStats(candidate), att = attendanceStats(candidate), evaluation = evaluationFor(candidate), status = autoAdminStatus(candidate);
          return <tr key={candidate.id} className={checked.has(candidate.id) ? "selected-row" : ""}><td><input type="checkbox" checked={checked.has(candidate.id)} onChange={() => toggleCandidate(candidate.id)} /></td><td><button className="person" onClick={() => { setSelectedCandidateId(candidate.id); setShowCandidate(true); }}><span className="avatar">{initials(candidate)}</span><span><b>{candidate.first_name || candidate.last_name ? `${candidate.first_name || ""} ${candidate.last_name || ""}` : candidate.email || "Candidat"}</b><small>{candidate.club_name || "Club non renseigné"}{candidate.birthdate ? ` · ${new Date(`${candidate.birthdate}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}</small><small>{candidate.phone || ""}{candidate.phone && candidate.email ? " · " : ""}{candidate.email || ""}</small></span></button></td><td><span className={`pill ${docs.complete ? "ok" : "warn"}`}>{docs.complete ? "✓ Complet" : `⚠ ${docs.validated}/${docs.total}`}</span></td><td><button className={`cell-button ${pay.complete ? "ok-text" : "danger-text"}`} onClick={() => { setSelectedCandidateId(candidate.id); setShowCandidate(true); }}>{candidate.payment_exempt ? "Exonéré" : pay.complete ? `✓ ${money(pay.paid, cohort.currency || "EUR")}` : `${money(pay.paid, cohort.currency || "EUR")} / ${money(pay.expected, cohort.currency || "EUR")}`}</button></td><td>{docs.validated}/{docs.total}</td><td>{att.present}/{att.total}{att.absent > 0 ? <small className="danger-text"> · {att.absent} abs.</small> : null}</td><td><span className={`pill ${evaluation?.status === "validated" ? "ok" : evaluation?.status === "rejected" ? "bad" : "neutral"}`}>{EVAL_STATUS[evaluation?.status || "not_started"] || "En cours"}</span></td><td><select value={candidate.administrative_status || status} onChange={(e) => void patchCandidate(candidate.id, { administrative_status: e.target.value })}>{Object.entries(ADMIN_STATUS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></td><td><button className="open" onClick={() => { setSelectedCandidateId(candidate.id); setShowCandidate(true); }}>Ouvrir</button></td></tr>;
        })}</tbody></table></div>{filtered.length === 0 && <div className="empty-state">Aucun candidat pour ce filtre.</div>}</section>
      </>}

      {tab === "attendance" && <section className="panel"><div className="panel-head"><div><p>PRÉSENCES</p><h3>Journées de formation</h3><span>Ajoute Journée 1, Journée 2, Journée 3… puis coche simplement les stagiaires présents.</span></div></div>
        <div className="session-create simple-session"><input value={sessionForm.title} onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })} placeholder="Ex. Journée 1" /><input type="date" value={sessionForm.session_date} onChange={(e) => setSessionForm({ ...sessionForm, session_date: e.target.value })} /><input type="time" value={sessionForm.start_time} onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })} /><input type="time" value={sessionForm.end_time} onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })} /><input value={sessionForm.location} onChange={(e) => setSessionForm({ ...sessionForm, location: e.target.value })} placeholder="Lieu (facultatif)" /><button onClick={createSession}>+ Ajouter la journée</button><button className="ghost" onClick={() => void downloadCohortPdf("attendance")}>Exporter la présence PDF</button></div>
        {sessions.length === 0 ? <div className="empty-state mini-empty">Aucune journée. Commence par créer « Journée 1 ».</div> : <div className="attendance-help">✓ = présent · une case non cochée reste à renseigner.</div>}
        <div className="table-scroll"><table className="attendance-grid"><thead><tr><th>Stagiaire</th>{sessions.map((s) => <th key={s.id}><b>{s.title}</b><small>{new Date(`${s.session_date}T12:00:00`).toLocaleDateString("fr-FR")} {s.start_time ? `· ${s.start_time.slice(0,5)}` : ""}</small></th>)}</tr></thead><tbody>{candidates.map((c) => <tr key={c.id}><td><b>{c.first_name} {c.last_name}</b><small>{c.club_name}</small></td>{sessions.map((s) => { const record = attendance.find((a) => a.session_id === s.id && a.candidate_id === c.id); const present = record?.status === "present" || record?.status === "late"; return <td key={s.id} className="presence-check"><label title={`${s.title} — ${c.first_name || ""} ${c.last_name || ""}`}><input type="checkbox" checked={present} onChange={(e) => void setAttendance(s.id, c.id, e.target.checked ? "present" : "unknown")} /><span>{present ? "Présent" : "À renseigner"}</span></label></td>; })}</tr>)}</tbody></table></div>
      </section>}

      {tab === "documents" && <section className="panel requirements-panel"><div className="panel-head"><div><p>SUIVI DU DOSSIER</p><h3>Éléments obligatoires</h3><span>Choisis ce que chaque stagiaire doit faire. L’écran stagiaire affichera ensuite une simple case « Réalisé ».</span></div></div>
        <div className="kind-picker">{(Object.keys(REQUIREMENT_KIND) as RequirementKind[]).map((kind) => { const meta = REQUIREMENT_KIND[kind]; return <button key={kind} className={reqKind === kind ? "kind active" : "kind"} onClick={() => setReqKind(kind)}><span>{meta.icon}</span><b>{meta.label}</b><small>{meta.help}</small></button>; })}</div>
        <div className="requirement-create"><input value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} placeholder={reqKind === "teachup" ? "Ex. Inscription TeachUp" : reqKind === "payment" ? "Ex. Paiement des frais" : "Nom de l’élément obligatoire"} /><input value={reqInstructions} onChange={(e) => setReqInstructions(e.target.value)} placeholder="Consigne courte (facultatif)" />{(reqKind === "teachup" || reqKind === "form") && <input value={reqExternalUrl} onChange={(e) => setReqExternalUrl(e.target.value)} placeholder="Lien à ouvrir (facultatif)" />}<input type="date" value={reqDue} onChange={(e) => setReqDue(e.target.value)} /><button onClick={addRequirement}>+ Ajouter</button></div>
        <div className="requirements">{requirements.map((r) => { const kind = (r.requirement_type || "document") as RequirementKind; const meta = REQUIREMENT_KIND[kind] || REQUIREMENT_KIND.document; const done = candidates.filter((c) => requirementDone(c.id, r.id)).length; return <article key={r.id}><div className="req-main"><span className="req-icon">{meta.icon}</span><div><b>{r.title}</b><small>{meta.label}{r.instructions ? ` · ${r.instructions}` : ""}{r.due_at ? ` · avant le ${new Date(r.due_at).toLocaleDateString("fr-FR")}` : ""}</small>{r.external_url && <a href={r.external_url} target="_blank" rel="noreferrer">Ouvrir le lien ↗</a>}</div></div><div className="req-actions"><strong>{done}/{candidates.length} réalisés</strong><button className="ghost danger" onClick={() => void removeRequirement(r)}>Supprimer</button></div></article>; })}{requirements.length === 0 && <div className="empty-state mini-empty">Aucun élément obligatoire. Ajoute par exemple « Inscription TeachUp » ou « Paiement ».</div>}</div>
      </section>}

      {tab === "planning" && <section className="embedded"><TrainingPlanningBoard cohortId={cohortId} /></section>}
      {tab === "scenario" && <section className="embedded"><PedagogicalScenarioEditor cohortId={cohortId} /></section>}

      {tab === "communication" && <section className="panel communication"><div className="panel-head"><div><p>COMMUNICATION</p><h3>Écrire depuis la vraie liste d’inscrits</h3><span>{checked.size ? `${checked.size} candidat(s) sélectionné(s)` : "Aucune sélection : tu peux envoyer à toute la promotion."}</span></div></div><div className="message-grid"><label>Type<select value={messageForm.type} onChange={(e) => setMessageForm({ ...messageForm, type: e.target.value })}><option value="message">Message</option><option value="convocation">Convocation</option><option value="reminder">Rappel</option></select></label><label>Sujet<input value={messageForm.subject} onChange={(e) => setMessageForm({ ...messageForm, subject: e.target.value })} /></label><label className="wide">Message<textarea value={messageForm.body} onChange={(e) => setMessageForm({ ...messageForm, body: e.target.value })} rows={6} /></label></div><div className="actions"><button disabled={checked.size === 0} onClick={() => void sendMessage("selected")}>Envoyer aux sélectionnés</button><button className="secondary" onClick={() => void sendMessage("all")}>Envoyer à toute la promotion</button><button className="ghost" disabled={checked.size === 0} onClick={() => void sendMessage("missing_documents")}>Relancer les pièces manquantes</button></div></section>}

      {tab === "settings" && <section className="panel settings"><div className="panel-head"><div><p>PARAMÈTRES</p><h3>Règles de cette formation</h3></div></div><div className="settings-grid"><label>Tarif de la formation (€)<input type="number" min="0" step="0.01" defaultValue={(cohort.fee_amount_cents || 0) / 100} onBlur={(e) => void updateCohort({ fee_amount_cents: Math.round(Number(e.target.value || 0) * 100) })} /></label><label>Capacité<input type="number" min="0" defaultValue={cohort.capacity || ""} onBlur={(e) => void updateCohort({ capacity: e.target.value ? Number(e.target.value) : null })} /></label><label>Date de début<input type="date" defaultValue={cohort.start_date || ""} onBlur={(e) => void updateCohort({ start_date: e.target.value || null })} /></label><label>Date de fin<input type="date" defaultValue={cohort.end_date || ""} onBlur={(e) => void updateCohort({ end_date: e.target.value || null })} /></label><label className="wide">Lieu<input defaultValue={cohort.location || ""} onBlur={(e) => void updateCohort({ location: e.target.value || null })} /></label></div></section>}
    </>}

    {showAddCandidate && <div className="modal-backdrop" onMouseDown={(e)=>{ if(e.target===e.currentTarget)setShowAddCandidate(false); }}><section className="candidate-modal"><div className="modal-head"><div><p>INSCRIPTION</p><h3>Ajouter un candidat</h3><span>Le candidat sera ajouté directement à la formation sélectionnée.</span></div><button className="close" onClick={()=>setShowAddCandidate(false)}>×</button></div><div className="candidate-form-grid"><label>Nom *<input autoFocus value={candidateForm.last_name} onChange={(e)=>setCandidateForm({...candidateForm,last_name:e.target.value})} placeholder="Nom" /></label><label>Prénom *<input value={candidateForm.first_name} onChange={(e)=>setCandidateForm({...candidateForm,first_name:e.target.value})} placeholder="Prénom" /></label><label>Club<input value={candidateForm.club_name} onChange={(e)=>setCandidateForm({...candidateForm,club_name:e.target.value})} placeholder="Club" /></label><label>Date de naissance<input type="date" value={candidateForm.birthdate} onChange={(e)=>setCandidateForm({...candidateForm,birthdate:e.target.value})} /></label><label>Téléphone<input value={candidateForm.phone} onChange={(e)=>setCandidateForm({...candidateForm,phone:e.target.value})} placeholder="06 00 00 00 00" /></label><label>Email *<input type="email" value={candidateForm.email} onChange={(e)=>setCandidateForm({...candidateForm,email:e.target.value})} placeholder="candidat@email.fr" /></label><label className="wide">Formation *<select value={candidateForm.cohort_id} onChange={(e)=>setCandidateForm({...candidateForm,cohort_id:e.target.value})}><option value="">Choisir une formation</option>{cohorts.map((c)=><option key={c.id} value={c.id}>{c.training_programs?.name ? `${c.training_programs.name} · ` : ""}{c.name}</option>)}</select></label>{(()=>{const target=cohorts.find((c)=>c.id===candidateForm.cohort_id);return target && (target.start_date||target.end_date) ? <div className="formation-dates wide"><b>{target.training_programs?.name || "Formation"} · {target.name}</b><span>{target.start_date ? `Du ${new Date(`${target.start_date}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}{target.end_date ? ` au ${new Date(`${target.end_date}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}</span></div> : null;})()}</div><div className="modal-actions"><button className="ghost" onClick={()=>setShowAddCandidate(false)}>Annuler</button><button disabled={busy} onClick={addCandidate}>{busy ? "Ajout…" : "Ajouter le candidat"}</button></div></section></div>}

    {showCandidate && selectedCandidate && <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCandidate(false); }}><section className="drawer"><div className="drawer-head"><div className="person-title"><span className="avatar large">{initials(selectedCandidate)}</span><div><p>DOSSIER CANDIDAT</p><h3>{selectedCandidate.first_name || ""} {selectedCandidate.last_name || ""}</h3><small>{selectedCandidate.email}</small></div></div><button className="close" onClick={() => setShowCandidate(false)}>×</button></div><div className="drawer-summary">{(() => { const d=documentStats(selectedCandidate),p=paymentStats(selectedCandidate),a=attendanceStats(selectedCandidate),e=evaluationFor(selectedCandidate);return <><span className={d.complete?"ok-card":"warn-card"}><b>{d.validated}/{d.total}</b><small>Dossier</small></span><span className={p.complete?"ok-card":"warn-card"}><b>{p.complete?"OK":money(p.remaining,cohort?.currency||"EUR")}</b><small>Cotisation</small></span><span><b>{a.present}/{a.total}</b><small>Présence</small></span><span><b>{candidateProgress(selectedCandidate)}%</b><small>Avancement</small></span><span><b>{EVAL_STATUS[e?.status||"not_started"]}</b><small>Évaluation</small></span></>;})()}</div>
      <div className="drawer-section"><h4>Identité & inscription</h4><div className="fields"><label>Prénom<input defaultValue={selectedCandidate.first_name || ""} onBlur={(e) => void patchCandidate(selectedCandidate.id, { first_name: e.target.value })} /></label><label>Nom<input defaultValue={selectedCandidate.last_name || ""} onBlur={(e) => void patchCandidate(selectedCandidate.id, { last_name: e.target.value })} /></label><label>Email<input defaultValue={selectedCandidate.email || ""} onBlur={(e) => void patchCandidate(selectedCandidate.id, { email: e.target.value })} /></label><label>Téléphone<input defaultValue={selectedCandidate.phone || ""} onBlur={(e) => void patchCandidate(selectedCandidate.id, { phone: e.target.value })} /></label><label>Club<input defaultValue={selectedCandidate.club_name || ""} onBlur={(e) => void patchCandidate(selectedCandidate.id, { club_name: e.target.value })} /></label><label>N° licence<input defaultValue={selectedCandidate.license_number || ""} onBlur={(e) => void patchCandidate(selectedCandidate.id, { license_number: e.target.value })} /></label></div></div>
      <div className="drawer-section"><h4>À faire pour cette formation</h4><div className="candidate-docs">{requirements.map((r) => { const kind = (r.requirement_type || "document") as RequirementKind; const meta = REQUIREMENT_KIND[kind] || REQUIREMENT_KIND.document; const sub = submissionFor(selectedCandidate.id,r.id); const done = sub?.status === "validated"; return <div key={r.id} className={done ? "candidate-task done" : "candidate-task"}><div className="task-info"><span className="req-icon">{meta.icon}</span><div><b>{r.title}</b><small>{meta.label}{r.instructions ? ` · ${r.instructions}` : ""}</small>{r.external_url && <a href={r.external_url} target="_blank" rel="noreferrer">Ouvrir le lien ↗</a>}</div></div>{kind === "document" ? <select value={sub?.status || "missing"} onChange={(e) => void setDocumentStatus(selectedCandidate.id,r.id,e.target.value)}>{Object.entries(DOC_STATUS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select> : <label className="task-check"><input type="checkbox" checked={done} onChange={(e) => void toggleRequirement(selectedCandidate.id,r.id,e.target.checked)} /><span>{done ? "Réalisé" : "À faire"}</span></label>}</div>; })}{requirements.length===0 && <p className="muted">Aucun élément obligatoire défini.</p>}</div></div>
      <div className="drawer-section"><h4>Présence aux journées</h4><div className="candidate-presence">{sessions.map((session) => { const row = attendance.find((a) => a.session_id === session.id && a.candidate_id === selectedCandidate.id); const present = row?.status === "present" || row?.status === "late"; return <label key={session.id} className={present ? "presence-item done" : "presence-item"}><input type="checkbox" checked={present} onChange={(e) => void setAttendance(session.id, selectedCandidate.id, e.target.checked ? "present" : "unknown")} /><span><b>{session.title}</b><small>{new Date(`${session.session_date}T12:00:00`).toLocaleDateString("fr-FR")}{session.start_time ? ` · ${session.start_time.slice(0,5)}` : ""}</small></span><strong>{present ? "Présent" : "À renseigner"}</strong></label>; })}{sessions.length===0 && <p className="muted">Aucune journée de formation créée.</p>}</div></div>
      <div className="drawer-section"><h4>Cotisation</h4>{(() => { const p=paymentStats(selectedCandidate);return <><div className="payment-line"><span>Tarif attendu <b>{money(p.expected,cohort?.currency||"EUR")}</b></span><span>Réglé <b>{money(p.paid,cohort?.currency||"EUR")}</b></span><span>Reste <b>{money(p.remaining,cohort?.currency||"EUR")}</b></span></div><label className="checkline"><input type="checkbox" checked={!!selectedCandidate.payment_exempt} onChange={(e) => void patchCandidate(selectedCandidate.id,{payment_exempt:e.target.checked})}/> Exonéré de cotisation</label><div className="payment-form"><input type="number" step="0.01" min="0" placeholder="Montant €" value={paymentForm.amount} onChange={(e)=>setPaymentForm({...paymentForm,amount:e.target.value})}/><select value={paymentForm.method} onChange={(e)=>setPaymentForm({...paymentForm,method:e.target.value})}>{Object.entries(PAYMENT_METHOD).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><input placeholder="Référence" value={paymentForm.reference} onChange={(e)=>setPaymentForm({...paymentForm,reference:e.target.value})}/><button onClick={()=>void addPayment(selectedCandidate)}>Enregistrer le paiement</button></div><div className="payment-history">{payments.filter(x=>x.candidate_id===selectedCandidate.id).map(x=><small key={x.id}>{new Date(x.paid_at).toLocaleDateString("fr-FR")} · {money(x.amount_cents,cohort?.currency||"EUR")} · {PAYMENT_METHOD[x.payment_method]||x.payment_method}</small>)}</div></>;})()}</div>
      <div className="drawer-section"><h4>Validation de la formation</h4>{(() => { const ev=evaluationFor(selectedCandidate);return <div className="evaluation-grid"><label>Décision<select value={ev?.status||"not_started"} onChange={(e)=>void saveEvaluation(selectedCandidate,{status:e.target.value,result:e.target.value==="validated"?"validated":e.target.value==="rejected"?"not_validated":null})}><option value="not_started">En cours</option><option value="validated">Validé</option><option value="rejected">Non validé</option></select></label><label>Note / 20 (facultatif)<input type="number" min="0" max="20" step="0.5" defaultValue={ev?.score ?? ""} onBlur={(e)=>void saveEvaluation(selectedCandidate,{score:e.target.value?Number(e.target.value):null})}/></label><label className="wide">Commentaire / décision<textarea defaultValue={ev?.notes||""} onBlur={(e)=>void saveEvaluation(selectedCandidate,{notes:e.target.value})} placeholder="Commentaire de validation, motif de non-validation…"/></label><label className="wide">Points forts<textarea defaultValue={ev?.strengths||""} onBlur={(e)=>void saveEvaluation(selectedCandidate,{strengths:e.target.value})}/></label><label className="wide">Axes de progression<textarea defaultValue={ev?.development_areas||""} onBlur={(e)=>void saveEvaluation(selectedCandidate,{development_areas:e.target.value})}/></label></div>;})()}</div>
    </section></div>}

    <style jsx>{`
      :global(body){background:#f6f2ee}.training-root{display:grid;gap:10px;color:#302328}.formation-switcher,.panel,.table-card,.embedded{background:#fff;border:1px solid #eadfd8;border-radius:16px}.formation-switcher{padding:16px}.formation-title,.switch-row,.panel-head,.bulk,.actions,.payment-line{display:flex;justify-content:space-between;gap:12px;align-items:center}.formation-title p,.panel-head p,.drawer-head p{margin:0;color:#b37a20;font-size:.68rem;font-weight:1000;letter-spacing:.1em}.formation-title h2,.panel-head h3,.drawer-head h3{margin:3px 0;color:#4d1420}.formation-title span,.panel-head span{font-size:.76rem;color:#7d6f73}.cohort-score{text-align:center;background:#f8eff1;border-radius:12px;padding:8px 14px}.cohort-score b{display:block;color:#6b1a2c;font-size:1.2rem}.cohort-score small{font-size:.66rem}.switch-row{margin-top:12px;justify-content:flex-start}.switch-row>select{min-width:360px}.switch-row details{position:relative}.switch-row summary{list-style:none;background:#6b1a2c;color:#fff;border-radius:9px;padding:9px 12px;font-weight:900;cursor:pointer}.create-pop{position:absolute;z-index:10;top:42px;left:0;width:340px;background:#fff;border:1px solid #dacbc5;border-radius:12px;padding:12px;box-shadow:0 12px 30px #4d142022;display:grid;gap:7px}.training-tabs{display:flex;gap:5px;overflow:auto;padding:2px}.training-tabs button{white-space:nowrap;background:#fff;color:#5f4e53;border:1px solid #dfd3ce}.training-tabs button.active{background:#6b1a2c;color:#fff;border-color:#6b1a2c}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.kpis article{background:#fff;border:1px solid #eadfd8;border-radius:13px;padding:12px}.kpis b{font-size:1.45rem;color:#6b1a2c;display:block}.kpis span{font-size:.7rem;color:#7d6f73}.toolbar{display:grid;grid-template-columns:auto minmax(220px,1fr) 190px auto auto;gap:7px}.add-candidate-main{white-space:nowrap}.date-pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}.bulk{background:#fff4df;border:1px solid #e7c680;border-radius:12px;padding:9px 12px;justify-content:flex-start}.table-card{overflow:hidden}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;min-width:980px}th,td{padding:9px 8px;border-bottom:1px solid #eee5e1;text-align:left;font-size:.74rem;vertical-align:middle}th{background:#faf7f5;color:#695b5f;font-size:.64rem;text-transform:uppercase;letter-spacing:.04em;position:sticky;top:0;z-index:1}th small,td small{display:block;font-size:.62rem;color:#88797d;margin-top:2px}.selected-row{background:#fff9ed}.person{display:flex;align-items:center;gap:8px;background:transparent!important;color:#33272a!important;padding:0!important;text-align:left}.person b,.person small{display:block}.avatar{width:30px;height:30px;border-radius:50%;background:#6b1a2c;color:#fff;display:grid;place-items:center;font-size:.62rem;font-weight:1000;flex:0 0 auto}.avatar.large{width:46px;height:46px;font-size:.78rem}.pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-weight:900;font-size:.65rem}.pill.ok{background:#e9f6ed;color:#24633a}.pill.warn{background:#fff3dc;color:#8c5a00}.pill.neutral{background:#f1eff0;color:#6f6165}.pill.bad{background:#fdebec;color:#a1242f}.cell-button{background:transparent!important;padding:0!important;color:inherit!important}.ok-text{color:#25703d!important}.danger-text{color:#a62d35!important}.open{padding:6px 8px}.panel{padding:14px}.session-create,.requirement-create{display:grid;grid-template-columns:1.5fr 150px 110px 110px auto auto;gap:6px}.requirement-create{grid-template-columns:1.2fr 1.4fr 1fr 150px auto;margin-top:12px}.kind-picker{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-top:12px}.kind{background:#fff!important;color:#4d1420!important;border:1px solid #e4d8d2!important;text-align:left;display:grid;gap:3px;min-height:90px}.kind>span{font-size:1.25rem}.kind b{font-size:.72rem}.kind small{font-size:.62rem;color:#85767a;font-weight:600}.kind.active{background:#fff5e1!important;border-color:#d4a24c!important;box-shadow:0 0 0 2px #d4a24c22}.simple-session{margin-top:12px;grid-template-columns:1.2fr 145px 100px 100px 1fr auto auto}.attendance-help{margin:10px 0 4px;background:#eef7ef;color:#2d6a3c;border-radius:9px;padding:8px 10px;font-size:.72rem;font-weight:800}.mini-empty{padding:16px;margin-top:10px}.attendance-grid th:not(:first-child),.attendance-grid td:not(:first-child){text-align:center}.presence-check label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}.presence-check input,.task-check input,.presence-item input{width:18px;height:18px;accent-color:#6b1a2c}.presence-check span{font-size:.68rem;color:#75666b}.req-main{display:flex;align-items:center;gap:9px}.req-icon{font-size:1.25rem;flex:0 0 auto}.req-main a,.task-info a{display:inline-block;margin-top:3px;color:#6b1a2c;font-size:.68rem;font-weight:900}.req-actions{display:flex;align-items:center;gap:8px}.req-actions .danger{color:#a12424!important;border-color:#efcaca!important}.requirements{display:grid;gap:6px;margin-top:10px}.requirements article{display:flex;justify-content:space-between;gap:10px;border:1px solid #eadfd8;border-radius:10px;padding:9px}.requirements small{display:block;color:#827479;margin-top:3px}.embedded{padding:8px}.communication{display:grid;gap:12px}.message-grid,.settings-grid,.fields,.evaluation-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.message-grid label,.settings-grid label,.fields label,.evaluation-grid label{display:grid;gap:5px;font-size:.67rem;font-weight:900;color:#75666b}.wide{grid-column:1/-1}.actions{justify-content:flex-end}.secondary{background:#d4a24c!important;color:#2c2023!important}.ghost{background:#fff!important;color:#6b1a2c!important;border:1px solid #d7bcc3!important}.empty-state{text-align:center;padding:28px;color:#87777b;background:#fff;border:1px dashed #d8c8c2;border-radius:14px}.modal-backdrop,.drawer-backdrop{position:fixed;inset:0;background:#21161a80;z-index:1000;display:flex;justify-content:flex-end}.candidate-modal{width:min(700px,94vw);margin:auto;background:#fff;border-radius:18px;padding:16px;box-shadow:0 18px 60px #0003}.modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #eee5e1;padding-bottom:12px;margin-bottom:12px}.modal-head p{margin:0;color:#b37a20;font-size:.68rem;font-weight:1000;letter-spacing:.1em}.modal-head h3{margin:3px 0;color:#4d1420}.modal-head span{font-size:.75rem;color:#7d6f73}.candidate-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.candidate-form-grid label{display:grid;gap:5px;font-size:.7rem;font-weight:900;color:#75666b}.formation-dates{background:#fff7e7;border:1px solid #ecd39c;border-radius:10px;padding:10px}.formation-dates b,.formation-dates span{display:block}.formation-dates span{margin-top:3px;font-size:.72rem;color:#735f64}.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.drawer{height:100%;width:min(720px,94vw);background:#f7f3f0;overflow:auto;padding:16px;box-shadow:-12px 0 30px #0002}.drawer-head{display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid #eadfd8;border-radius:15px;padding:12px}.person-title{display:flex;gap:10px;align-items:center}.close{font-size:1.4rem;background:#eee6e3!important;color:#4d1420!important}.drawer-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:8px 0}.drawer-summary span{background:#fff;border:1px solid #eadfd8;border-radius:10px;padding:8px;text-align:center}.drawer-summary b,.drawer-summary small{display:block}.drawer-summary b{color:#5c1c29}.drawer-summary small{font-size:.61rem;color:#82757a}.drawer-summary .ok-card{background:#eff8f2}.drawer-summary .warn-card{background:#fff8e8}.drawer-section{background:#fff;border:1px solid #eadfd8;border-radius:14px;padding:12px;margin-bottom:8px}.drawer-section h4{margin:0 0 9px;color:#4d1420}.candidate-docs{display:grid;gap:6px}.candidate-docs>div{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px;border:1px solid #eee5e1;border-radius:9px}.candidate-docs small{display:block;color:#84767a}.candidate-docs select{width:150px}.candidate-task.done,.presence-item.done{background:#eff8f2;border-color:#cfe4d5}.task-info{display:flex;gap:8px;align-items:center}.task-check{display:flex;align-items:center;gap:6px;font-size:.72rem;font-weight:900;white-space:nowrap}.candidate-presence{display:grid;gap:6px}.presence-item{display:grid;grid-template-columns:22px 1fr auto;gap:8px;align-items:center;border:1px solid #eee5e1;border-radius:9px;padding:9px}.presence-item span b,.presence-item span small{display:block}.presence-item span small{font-size:.66rem;color:#84767a}.presence-item strong{font-size:.7rem;color:#6b1a2c}.payment-line{background:#faf7f5;border-radius:9px;padding:8px}.payment-line span{font-size:.7rem}.payment-line b{display:block;color:#6b1a2c}.checkline{display:flex!important;align-items:center;gap:7px;margin:8px 0;font-size:.75rem!important}.checkline input{width:auto}.payment-form{display:grid;grid-template-columns:130px 140px 1fr auto;gap:6px}.payment-history{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.payment-history small{background:#f3eeeb;border-radius:999px;padding:5px 8px}.muted{font-size:.75rem;color:#887a7e}input,select,textarea{box-sizing:border-box;width:100%;border:1px solid #ddd1ca;border-radius:8px;padding:8px;background:#fff;color:#2d2023;font:inherit}button{border:0;border-radius:8px;padding:8px 10px;background:#6b1a2c;color:#fff;font-weight:900;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}
      @media(max-width:1050px){.toolbar{grid-template-columns:1fr 1fr}.session-create,.requirement-create{grid-template-columns:1fr 1fr}.kind-picker{grid-template-columns:repeat(3,1fr)}.drawer-summary{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:700px){.candidate-form-grid,.date-pair{grid-template-columns:1fr}.kind-picker{grid-template-columns:1fr 1fr}.formation-title,.switch-row,.panel-head{align-items:flex-start;flex-direction:column}.switch-row>select{min-width:0;width:100%}.kpis{grid-template-columns:1fr 1fr}.toolbar,.session-create,.requirement-create,.message-grid,.settings-grid,.fields,.evaluation-grid,.payment-form{grid-template-columns:1fr}.wide{grid-column:auto}.drawer-summary{grid-template-columns:1fr 1fr}.actions,.bulk{align-items:stretch;flex-direction:column}}
    `}</style>
  </main>;
}
