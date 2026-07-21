// app/api/contact/route.ts
import { NextResponse } from "next/server";

type ContactPayload = {
  nom?: string;
  prenom?: string;
  email?: string;
  phone?: string;
  sujet?: string;
  message?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let data: ContactPayload;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const nom = data.nom?.trim();
  const prenom = data.prenom?.trim();
  const email = data.email?.trim();
  const message = data.message?.trim();

  // Validation des champs obligatoires
  if (!nom || !prenom || !email || !message) {
    return NextResponse.json(
      { error: "Merci de remplir tous les champs obligatoires (*)." },
      { status: 400 }
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  }

  // ───────────────────────────────────────────────────────────
  // TODO : envoi réel du message.
  // Exemples possibles selon ton stack :
  //   • Email transactionnel : Resend, Nodemailer, SendGrid…
  //   • Enregistrement en base : Supabase, Prisma…
  //   • Notification : Slack, Discord webhook…
  //
  // Exemple avec Resend (npm i resend) :
  //   import { Resend } from "resend";
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   await resend.emails.send({
  //     from: "MyBasket <contact@mybasket.fr>",
  //     to: "contact@mybasket.fr",
  //     replyTo: email,
  //     subject: `[Contact] ${data.sujet ?? "Nouveau message"} — ${prenom} ${nom}`,
  //     text: `${prenom} ${nom} (${email}, ${data.phone ?? "—"})\n\n${message}`,
  //   });
  // ───────────────────────────────────────────────────────────

  // Pour l'instant on logge côté serveur (visible dans la console / les logs).
  console.log("[contact] nouveau message :", {
    nom,
    prenom,
    email,
    phone: data.phone ?? "",
    sujet: data.sujet ?? "",
    message,
  });

  return NextResponse.json({ ok: true });
}

// Optionnel : refuser proprement les autres méthodes
export function GET() {
  return NextResponse.json({ error: "Méthode non autorisée." }, { status: 405 });
}