import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { syncClubTeamAccess } from "@/lib/club-team-sync-server";

const ALLOWED_ROLES = new Set(["owner", "admin", "direction_technique", "secretariat"]);

export async function POST(request: NextRequest) {
  try {
    const { clubId } = await request.json().catch(() => ({}));
    if (!clubId) return NextResponse.json({ error: "clubId manquant." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

    const { data: membership } = await supabase
      .from("club_members")
      .select("role,status")
      .eq("club_id", clubId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || !ALLOWED_ROLES.has(String(membership.role || ""))) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Configuration serveur incomplète." }, { status: 500 });

    const result = await syncClubTeamAccess(admin, String(clubId));
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Synchronisation impossible." }, { status: 500 });
  }
}
