import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { getTeamRpeAccess, hasRpePermission } from "@/lib/rpe/access";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const teamId = String(body?.teamId || "");
  const alertId = String(body?.alertId || "");
  if (!teamId || !alertId) return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });

  const access = await getTeamRpeAccess(teamId);
  if (!access.allowed || !hasRpePermission(access, "rpe_individual")) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin || !access.userId) return NextResponse.json({ error: "Serveur indisponible." }, { status: 500 });

  const { error } = await admin
    .from("rpe_alerts")
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: access.userId })
    .eq("id", alertId)
    .eq("team_id", teamId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
