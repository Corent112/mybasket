import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { notifyAdmin } from "@/lib/server-notifications";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { getClientIp, rateLimit } from "@/lib/security/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  }
  if (!rateLimit(`contact:${getClientIp(request.headers)}`, 5, 600_000).allowed) {
    return NextResponse.json({ error: "Trop de demandes. Réessaie dans quelques minutes." }, { status: 429 });
  }

  const data = await request.json().catch(() => null);
  const field = (key: string, max: number) =>
    typeof data?.[key] === "string" ? data[key].trim().slice(0, max) : "";
  const nom = field("nom", 120);
  const prenom = field("prenom", 120);
  const email = field("email", 254);
  const sujet = field("sujet", 120).replace(/[\r\n]+/g, " ");
  const message = field("message", 5000);
  if (!nom || !prenom || !EMAIL_RE.test(email) || !sujet || !message) {
    return NextResponse.json({ error: "Vérifie les champs obligatoires et ton adresse email." }, { status: 400 });
  }

  const db = createAdminClient();
  const phone = field("phone", 40) || null;
  const organization = field("organization", 160) || null;
  if (["Demande d’accès Club", "Demande d’accès Institution"].includes(sujet) && !organization) {
    return NextResponse.json({ error: "Renseigne le nom de la structure." }, { status: 400 });
  }
  const saved = await db?.from("contact_requests").insert({
    first_name: prenom, last_name: nom, email, phone, organization, subject: sujet, message,
  }).select("id").single();

  if (!db || !saved?.data || saved.error) {
    console.error("Enregistrement de la demande indisponible", saved?.error?.code);
    return NextResponse.json({
      error: "Envoi indisponible. Tu peux écrire directement à contact@mybasket.fr.",
    }, { status: 503 });
  }

  try {
    const result = await notifyAdmin({
      subject: `[MyBasket] ${sujet}`,
      title: sujet,
      fields: [["Nom", `${prenom} ${nom}`], ["Structure", organization], ["Email", email], ["Téléphone", phone]],
      message,
      replyTo: email,
    });
    if (result.sent) {
      const { error } = await db.from("contact_requests")
        .update({ notified_at: new Date().toISOString() }).eq("id", saved.data.id);
      if (error) console.error("Suivi de notification indisponible", error.code);
    }
  } catch (error) {
    console.error("Échec de la notification d’une demande de contact", error);
  }

  return NextResponse.json({ ok: true });
}
