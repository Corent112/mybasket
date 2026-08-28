import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

async function mail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY; if (!key) return false;
  const from = process.env.MYBASKET_EMAIL_FROM || "MyBasket <notifications@mybasket.fr>";
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, html }) });
  return r.ok;
}
function esc(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]!)); }

export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await request.json(), admin = createAdminClient();

  if (body.mode === "activity_email") {
    if (!admin) return NextResponse.json({ ok: true });
    const { data: a } = await admin.from("activity_log").select("*").eq("id", String(body.activityId || "")).maybeSingle(); if (!a?.team_id) return NextResponse.json({ ok: true });
    const [{ data: t }, { data: m }] = await Promise.all([admin.from("teams").select("user_id,name").eq("id", a.team_id).maybeSingle(), admin.from("team_members").select("user_id").eq("team_id", a.team_id).eq("status", "active")]);
    const ids = [...new Set([t?.user_id, ...(m || []).map((x) => x.user_id)].filter(Boolean))];
    for (const uid of ids) { if (uid === user.id) continue; const { data: p } = await admin.from("notification_preferences").select("email,in_app").eq("user_id", uid).eq("team_id", a.team_id).eq("event_key", a.action_key).maybeSingle(); if (p?.in_app !== false) await admin.from("user_notifications").insert({ user_id: uid, activity_id: a.id, title: a.title, body: a.description, href: a.href, email_status: p?.email === false ? "skipped" : "pending" }); if (p?.email !== false) { const { data: pr } = await admin.from("profiles").select("email").eq("id", uid).maybeSingle(); if (pr?.email) { const ok = await mail(pr.email, `MyBasket · ${t?.name || "Équipe"} · ${a.title}`, `<h2>${esc(a.title)}</h2><p>${esc(a.description || "")}</p>`); await admin.from("user_notifications").update({ email_status: ok ? "sent" : "failed" }).eq("activity_id", a.id).eq("user_id", uid); } } }
    return NextResponse.json({ ok: true });
  }

  const cohortId = String(body.cohortId || "");
  const { data: instructor } = await supabase.from("training_instructors").select("id").eq("cohort_id", cohortId).eq("user_id", user.id).maybeSingle();
  const { data: profile } = await supabase.from("profiles").select("platform_role").eq("id", user.id).maybeSingle();
  if (!instructor && !["ceo", "superadmin"].includes(String(profile?.platform_role || ""))) {
    const { data: cohort } = await supabase.from("training_cohorts").select("institution_id").eq("id", cohortId).maybeSingle();
    const { data: member } = cohort?.institution_id ? await supabase.from("institutional_members").select("id").eq("structure_id", cohort.institution_id).eq("user_id", user.id).eq("status", "active").maybeSingle() : { data: null } as any;
    if (!member) return NextResponse.json({ error: "Accès formateur requis" }, { status: 403 });
  }
  if (!admin) return NextResponse.json({ error: "Service email indisponible" }, { status: 500 });

  if (body.mode === "candidate_bulk") {
    const candidateIds = Array.isArray(body.candidateIds) ? body.candidateIds.map(String) : [];
    if (!candidateIds.length) return NextResponse.json({ error: "Aucun candidat sélectionné" }, { status: 400 });
    const { data: candidates } = await admin.from("training_candidates").select("id,user_id,email,first_name,last_name").eq("cohort_id", cohortId).in("id", candidateIds);
    const template = String(body.template || "custom"), subject = String(body.subject || "").trim(), customBody = String(body.body || "").trim();
    let sent = 0;
    for (const candidate of candidates || []) {
      let text = customBody;
      let localSubject = subject || "Formation MyBasket";
      if (template === "missing_documents") {
        const [{ data: reqs }, { data: subs }] = await Promise.all([
          admin.from("training_document_requests").select("id,title,is_required").eq("cohort_id", cohortId),
          admin.from("training_document_submissions").select("request_id,status").eq("candidate_id", candidate.id),
        ]);
        const validated = new Set((subs || []).filter((x) => x.status === "validated").map((x) => x.request_id));
        const missing = (reqs || []).filter((x) => x.is_required !== false && !validated.has(x.id)).map((x) => x.title);
        if (!missing.length) continue;
        localSubject = subject || "Votre dossier de formation est incomplet";
        text = `Bonjour ${candidate.first_name || ""},\n\nIl manque encore les éléments suivants dans votre dossier :\n- ${missing.join("\n- ")}\n\nMerci de les déposer depuis votre espace MyBasket.`;
      }
      await admin.from("training_messages").insert({ cohort_id: cohortId, sender_id: user.id, recipient_user_id: candidate.user_id, message_type: String(body.messageType || "message"), subject: localSubject || null, body: text });
      if (candidate.email && await mail(candidate.email, localSubject, `<p>Bonjour ${esc(candidate.first_name || "")},</p><p>${esc(text).replace(/\n/g, "<br>")}</p>`)) sent++;
    }
    return NextResponse.json({ ok: true, sent });
  }

  const messageType = String(body.messageType || "message"), subject = String(body.subject || "").trim(), text = String(body.body || "").trim();
  if (!cohortId || !text) return NextResponse.json({ error: "Message incomplet" }, { status: 400 });
  const q = await supabase.from("training_messages").insert({ cohort_id: cohortId, sender_id: user.id, recipient_user_id: null, message_type: messageType, subject: subject || null, body: text });
  if (q.error) return NextResponse.json({ error: q.error.message }, { status: 400 });
  const { data: candidates } = await admin.from("training_candidates").select("email,first_name").eq("cohort_id", cohortId).not("status", "eq", "withdrawn");
  let sent = 0; for (const candidate of candidates || []) if (candidate.email && await mail(candidate.email, subject || "Formation MyBasket", `<p>Bonjour ${esc(candidate.first_name || "")},</p><p>${esc(text).replace(/\n/g, "<br>")}</p>`)) sent++;
  return NextResponse.json({ ok: true, sent });
}
