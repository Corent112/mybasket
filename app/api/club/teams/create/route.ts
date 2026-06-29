import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCreateTeam } from "@/lib/club-limits-server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Non authentifié." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);

    const name = String(body?.name ?? "").trim();
    const category = String(body?.category ?? "").trim();
    const gender = String(body?.gender ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Le nom de l’équipe est obligatoire." },
        { status: 400 }
      );
    }

    const allowed = await canCreateTeam(user.id);

    if (!allowed) {
      return NextResponse.json(
        { error: "Limite d’équipes atteinte pour ton abonnement." },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("club_teams")
      .insert({
        owner_id: user.id,
        name,
        category: category || null,
        gender: gender || null,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Erreur création équipe:", error);

      return NextResponse.json(
        { error: "Impossible de créer l’équipe." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      team: data,
    });
  } catch (error) {
    console.error("Erreur API création équipe:", error);

    return NextResponse.json(
      { error: "Erreur serveur." },
      { status: 500 }
    );
  }
}