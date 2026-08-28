"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const DOC_LABELS: Record<string, string> = { missing: "À déposer", requested: "Demandé", submitted: "Reçu", received: "Reçu", validated: "Validé", changes_requested: "À corriger", rejected: "Refusé", expired: "Expiré" };
const ATT_LABELS: Record<string, string> = { unknown: "À venir", present: "Présent", late: "Retard", excused: "Excusé", absent: "Absent" };

export default function CandidateTrainingPortal() {
  const supabase = useMemo(() => createClient(), []);
  const [candidate, setCandidate] = useState<any>(null);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, any>>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [evaluation, setEvaluation] = useState<any>(null);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const q = await supabase.from("training_candidates").select("*,training_cohorts(*)").eq("user_id", user.id).not("status", "eq", "withdrawn").order("created_at", { ascending: false }).limit(1).maybeSingle();
    setCandidate(q.data);
    if (!q.data) return;
    const cohortId = q.data.cohort_id;
    const [r, sub, msg, pay, ses, att, ev] = await Promise.all([
      supabase.from("training_document_requests").select("*").eq("cohort_id", cohortId).order("created_at"),
      supabase.from("training_document_submissions").select("*").eq("candidate_id", q.data.id),
      supabase.from("training_messages").select("*").eq("cohort_id", cohortId).or(`recipient_user_id.is.null,recipient_user_id.eq.${user.id}`).order("created_at", { ascending: false }),
      supabase.from("training_candidate_payments").select("*").eq("candidate_id", q.data.id).order("paid_at", { ascending: false }),
      supabase.from("training_attendance_sessions").select("*").eq("cohort_id", cohortId).order("session_date"),
      supabase.from("training_candidate_attendance").select("*").eq("candidate_id", q.data.id),
      supabase.from("training_candidate_evaluations").select("*").eq("candidate_id", q.data.id).maybeSingle(),
    ]);
    setRequirements(r.data || []);
    const map: Record<string, any> = {}; for (const x of sub.data || []) map[x.request_id] = x; setSubmissions(map);
    setMessages(msg.data || []); setPayments(pay.data || []); setSessions(ses.data || []); setAttendance(att.data || []); setEvaluation(ev.data || null);
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(requirement: any, file: File) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !candidate) return;
    const old = submissions[requirement.id], version = (old?.current_version || 0) + 1;
    let submissionId = old?.id;
    if (!submissionId) {
      const q = await supabase.from("training_document_submissions").insert({ request_id: requirement.id, candidate_id: candidate.id, status: "submitted", current_version: 1 }).select("id").single();
      if (q.error) return alert(q.error.message); submissionId = q.data.id;
    } else {
      const q = await supabase.from("training_document_submissions").update({ status: "submitted", current_version: version, reviewer_comment: null, submitted_at: new Date().toISOString() }).eq("id", submissionId);
      if (q.error) return alert(q.error.message);
    }
    const path = `${candidate.cohort_id}/${candidate.id}/${submissionId}/v${version}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const u = await supabase.storage.from("training-documents").upload(path, file); if (u.error) return alert(u.error.message);
    const url = supabase.storage.from("training-documents").getPublicUrl(path).data.publicUrl;
    const v = await supabase.from("training_document_versions").insert({ submission_id: submissionId, version_number: version, file_url: url, storage_path: path, original_filename: file.name, uploaded_by: user.id });
    if (v.error) return alert(v.error.message); await load();
  }

  if (!candidate) return <main className="candidate-empty">Aucune formation active.</main>;
  const cohort = candidate.training_cohorts || {};
  const required = requirements.filter((r) => r.is_required !== false);
  const docsDone = required.filter((r) => submissions[r.id]?.status === "validated").length;
  const expected = candidate.payment_exempt ? 0 : (candidate.fee_override_cents ?? cohort.fee_amount_cents ?? 0);
  const paid = payments.reduce((sum, p) => sum + (p.amount_cents || 0), 0);
  const present = sessions.filter((s) => { const a = attendance.find((x) => x.session_id === s.id); return a?.status === "present" || a?.status === "late"; }).length;

  return <main className="portal">
    <header><div><p>MA FORMATION</p><h1>{cohort.name || "Formation"}</h1><span>{cohort.start_date ? `Du ${new Date(`${cohort.start_date}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}{cohort.end_date ? ` au ${new Date(`${cohort.end_date}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}</span></div><strong>{candidate.administrative_status === "validated" ? "Formation validée" : "Dossier en cours"}</strong></header>
    <section className="summary"><article><b>{docsDone}/{required.length}</b><span>Dossier</span></article><article><b>{expected === 0 || paid >= expected ? "OK" : `${(paid/100).toFixed(0)} / ${(expected/100).toFixed(0)} €`}</b><span>Cotisation</span></article><article><b>{present}/{sessions.length}</b><span>Présence</span></article><article><b>{evaluation?.status === "validated" ? "Validée" : evaluation?.status === "in_progress" ? "En cours" : "À faire"}</b><span>Évaluation</span></article></section>
    <div className="grid"><section><h2>Dossier administratif</h2>{requirements.map((r) => { const x = submissions[r.id]; return <div className="row" key={r.id}><div><b>{r.title}</b><span>{r.instructions}</span><small>{DOC_LABELS[x?.status || "missing"]}{x?.reviewer_comment ? ` · ${x.reviewer_comment}` : ""}</small></div><label>{x ? "Nouvelle version" : "Déposer"}<input hidden type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(r, f); }} /></label></div>; })}</section>
      <section><h2>Planning & présence</h2>{sessions.map((s) => { const a = attendance.find((x) => x.session_id === s.id); return <article className="session" key={s.id}><div><b>{s.title}</b><span>{new Date(`${s.session_date}T12:00:00`).toLocaleDateString("fr-FR")} · {s.start_time?.slice(0,5) || ""}{s.end_time ? `–${s.end_time.slice(0,5)}` : ""}</span><small>{s.location || ""}</small></div><strong className={`att ${a?.status || "unknown"}`}>{ATT_LABELS[a?.status || "unknown"]}</strong></article>; })}{sessions.length === 0 && <p className="muted">Aucune journée enregistrée.</p>}</section>
      <section><h2>Messages & convocations</h2>{messages.map((m) => <article className="message" key={m.id}><b>{m.message_type === "convocation" ? "📣 " : ""}{m.subject || "Message"}</b><p>{m.body}</p><small>{new Date(m.created_at).toLocaleString("fr-FR")}</small></article>)}</section>
      <section><h2>Évaluation</h2>{evaluation ? <div className="evaluation"><b>{evaluation.status === "validated" ? "Évaluation validée" : "Évaluation en cours"}</b>{evaluation.score != null && <span>Note : {evaluation.score}/20</span>}{evaluation.strengths && <p><strong>Points forts</strong>{evaluation.strengths}</p>}{evaluation.development_areas && <p><strong>Axes de progression</strong>{evaluation.development_areas}</p>}</div> : <p className="muted">L’évaluation n’a pas encore commencé.</p>}</section></div>
    <style jsx>{`:global(body){background:#f6f2ee}.portal{max-width:1120px;margin:auto;padding:28px 18px;color:#302328}.candidate-empty{padding:40px}header{background:linear-gradient(135deg,#6b1a2c,#3f111c);color:#fff;border-radius:20px;padding:20px;display:flex;justify-content:space-between;align-items:center}header p{color:#d4a24c;font-weight:1000;letter-spacing:.1em;font-size:.68rem;margin:0}header h1{margin:3px 0}header span{color:#eadde0;font-size:.75rem}header strong{background:#ffffff18;border:1px solid #ffffff30;padding:8px 10px;border-radius:999px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}.summary article,.grid>section{background:#fff;border:1px solid #eadfd8;border-radius:14px;padding:12px}.summary b{font-size:1.25rem;color:#6b1a2c;display:block}.summary span{font-size:.67rem;color:#7e7074}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid h2{font-size:1rem;color:#4d1420}.row,.session{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #eee4df;padding:9px 0}.row b,.row span,.row small,.session b,.session span,.session small{display:block}.row span,.row small,.session span,.session small{font-size:.7rem;color:#84766e}.row label{background:#6b1a2c;color:white;border-radius:8px;padding:8px;height:max-content;font-weight:900;font-size:.72rem;cursor:pointer}.att{font-size:.65rem;border-radius:999px;padding:5px 8px;height:max-content;background:#f0edef}.att.present,.att.late{background:#eaf6ed;color:#24633a}.att.absent{background:#fff0f0;color:#a62d35}.message{border-bottom:1px solid #eee4df;padding:8px 0}.message p{white-space:pre-wrap}.message small,.muted{color:#837579;font-size:.7rem}.evaluation b,.evaluation span{display:block}.evaluation p strong{display:block;color:#6b1a2c}@media(max-width:800px){.grid{grid-template-columns:1fr}.summary{grid-template-columns:1fr 1fr}header{align-items:flex-start;gap:10px;flex-direction:column}}`}</style>
  </main>;
}
