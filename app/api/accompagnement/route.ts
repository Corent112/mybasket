import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPlatformConversation, notifyAdmin } from "@/lib/server-notifications";

function text(value: unknown) {
  return String(value || "").trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const page = text(body.page);
    const normalizedPage = page.toLowerCase();
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    const common = {
      first_name: text(body.prenom) || null,
      last_name: text(body.nom) || null,
      email: text(body.email) || null,
      phone: text(body.telephone || body.phone) || null,
      club: text(body.club) || null,
      message: text(body.message) || null,
      status: "new",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let error: { message?: string } | null = null;

    if (
      normalizedPage === "mentorat & formation" ||
      normalizedPage === "formation" ||
      normalizedPage.includes("mentorat")
    ) {
      const result = await supabase.from("formation_requests").insert({
        ...common,
        request_type: text(body.type_demande) || "Mentorat & Formation",
      });
      error = result.error;
    } else if (normalizedPage === "scouting vidéo") {
      const result = await supabase.from("accompagnement_requests").insert({
        ...common,
        service_type: `Scouting vidéo — ${
          text(body.type_demande) || "Demande générale"
        }`,
      });
      error = result.error;
    } else if (normalizedPage === "direction technique") {
      const result = await supabase.from("accompagnement_requests").insert({
        ...common,
        service_type: `Direction technique — ${
          text(body.type_demande) || "Projet sportif"
        }`,
      });
      error = result.error;
    } else {
      const result = await supabase.from("accompagnement_requests").insert({
        ...common,
        service_type: text(body.type_demande) || page || "Accompagnement",
      });
      error = result.error;
    }

    if (error) {
      return NextResponse.json(
        { error: error.message || "Erreur Supabase" },
        { status: 400 }
      );
    }

    const serviceLabel = page || text(body.type_demande) || "Accompagnement";
    const senderName = `${text(body.prenom)} ${text(body.nom)}`.trim() || "Utilisateur";
    const senderEmail = text(body.email);

    const notificationTheme = normalizedPage === "scouting vidéo"
      ? {
          eyebrow: "SCOUTING VIDÉO",
          icon: "🎥",
          accent: "#6B1A2C",
          intro: "Une nouvelle demande de scouting vidéo vient d’être envoyée. Les informations utiles sont regroupées ci-dessous pour pouvoir la traiter rapidement.",
          actionLabel: "Répondre au coach",
        }
      : normalizedPage === "direction technique"
        ? {
            eyebrow: "DIRECTION TECHNIQUE",
            icon: "🧠",
            accent: "#6B1A2C",
            intro: "Une nouvelle demande d’accompagnement en direction technique vient d’être envoyée depuis MyBasket.",
            actionLabel: "Répondre au demandeur",
          }
        : normalizedPage === "mentorat & formation" || normalizedPage === "formation" || normalizedPage.includes("mentorat")
          ? {
              eyebrow: "FORMATION & MENTORAT",
              icon: "🎓",
              accent: "#6B1A2C",
              intro: "Une nouvelle demande de formation ou de mentorat vient d’être envoyée depuis MyBasket.",
              actionLabel: "Répondre au coach",
            }
          : {
              eyebrow: "ACCOMPAGNEMENT",
              icon: "🏀",
              accent: "#6B1A2C",
              intro: "Une nouvelle demande d’accompagnement vient d’être envoyée depuis MyBasket.",
              actionLabel: "Répondre au demandeur",
            };

    // Les notifications sont secondaires : la demande reste enregistrée même
    // si Resend ou la messagerie interne sont temporairement indisponibles.
    await Promise.allSettled([
      notifyAdmin({
        subject: `[MyBasket] Nouvelle demande — ${serviceLabel}`,
        title: `Nouvelle demande ${serviceLabel}`,
        replyTo: senderEmail || null,
        fields: [
          ["Service", serviceLabel],
          ["Type", text(body.type_demande)],
          ["Nom", senderName],
          ["Email", senderEmail],
          ["Téléphone", text(body.telephone || body.phone)],
          ["Club", text(body.club)],
        ],
        message: text(body.message),
        theme: notificationTheme,
      }),
      createPlatformConversation({
        type: "accompagnement",
        subject: `${serviceLabel} — ${senderName}`,
        body: text(body.message) || text(body.type_demande) || "Nouvelle demande",
        senderUserId: authData.user?.id || null,
        senderName,
        senderEmail: senderEmail || null,
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Requête invalide",
      },
      { status: 500 }
    );
  }
}
