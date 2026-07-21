import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const page = String(body.page || "").trim();
    const isFormation = /formation|mentorat/i.test(page);
    const supabase = await createClient();

    const common = {
      first_name: String(body.prenom || "").trim() || null,
      last_name: String(body.nom || "").trim() || null,
      email: String(body.email || "").trim() || null,
      phone: String(body.telephone || body.phone || "").trim() || null,
      message: String(body.message || "").trim() || null,
      status: "new",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = isFormation
      ? await supabase.from("formation_requests").insert({
          ...common,
          request_type: String(body.type_demande || page || "Formation"),
        })
      : await supabase.from("accompagnement_requests").insert({
          ...common,
          service_type: String(body.type_demande || page || "Accompagnement"),
        });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Requête invalide" },
      { status: 500 },
    );
  }
}
