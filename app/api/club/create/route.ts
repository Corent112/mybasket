import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Configuration serveur Supabase incomplète." }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    const name = String(body?.name ?? "").trim();
    const city = String(body?.city ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Le nom du club est obligatoire." }, { status: 400 });
    }

    const { data: existingMembership } = await admin
      .from("club_members")
      .select("club_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (existingMembership?.club_id) {
      return NextResponse.json({ error: "Ton compte est déjà rattaché à un club.", clubId: existingMembership.club_id }, { status: 409 });
    }

    const { data: club, error: clubError } = await admin
      .from("clubs")
      .insert({
        name,
        city: city || null,
        status: "active",
      })
      .select("id,name,city,status")
      .single();

    if (clubError || !club?.id) {
      console.error("Erreur création club:", clubError);
      return NextResponse.json({ error: clubError?.message || "Création du club impossible." }, { status: 500 });
    }

    const { error: memberError } = await admin.from("club_members").insert({
      club_id: club.id,
      user_id: user.id,
      role: "owner",
      status: "active",
    });

    if (memberError) {
      console.error("Erreur rattachement owner:", memberError);
      await admin.from("clubs").delete().eq("id", club.id);
      return NextResponse.json({ error: memberError.message || "Rattachement propriétaire impossible." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, club });
  } catch (error: any) {
    console.error("Erreur API création club:", error);
    return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
  }
}
