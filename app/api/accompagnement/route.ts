import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function text(value: unknown) {
  return String(value || "").trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const page = text(body.page);
    const normalizedPage = page.toLowerCase();
    const supabase = await createClient();

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
