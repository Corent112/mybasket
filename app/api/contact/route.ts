import { NextResponse } from "next/server";
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

  try {
    const result = await notifyAdmin({
      subject: `[MyBasket] ${sujet}`,
      title: sujet,
      fields: [["Nom", `${prenom} ${nom}`], ["Email", email], ["Téléphone", field("phone", 40)]],
      message,
      replyTo: email,
    });
    if (result.sent) return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Échec de l’envoi du formulaire de contact", error);
  }

  return NextResponse.json({
    error: "Envoi indisponible. Tu peux écrire directement à contact@mybasket.fr.",
  }, { status: 503 });
}
