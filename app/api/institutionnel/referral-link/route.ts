import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

async function context(structureId: string) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  if (!db) return null;
  const { data: member } = await db.from("institutional_members").select("id").eq("structure_id", structureId).eq("user_id", user.id).eq("status", "active").maybeSingle();
  return member ? { db } : null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  if (!structureId) return NextResponse.json({ error: "structureId manquant" }, { status: 400 });
  const ctx = await context(structureId);
  if (!ctx) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const current = await ctx.db.from("institutional_structures").select("player_referral_token").eq("id", structureId).maybeSingle();
  let token = String(current.data?.player_referral_token || "");
  if (!token) {
    token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    const q = await ctx.db.from("institutional_structures").update({ player_referral_token: token }).eq("id", structureId);
    if (q.error) return NextResponse.json({ error: q.error.message }, { status: 400 });
  }
  return NextResponse.json({ token, url: `${new URL(req.url).origin}/signalement-joueur/${token}` });
}
