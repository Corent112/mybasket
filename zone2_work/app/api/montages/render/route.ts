import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "") || req.cookies.get("sb-access-token")?.value;
    if (!token) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const body = await req.json();
    const montageId = String(body.montageId || "");
    if (!montageId) return NextResponse.json({ error: "montageId manquant" }, { status: 400 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData.user) return NextResponse.json({ error: "Session invalide" }, { status: 401 });

    const { data: montage, error } = await supabase.from("livestat_montages").select("id,user_id").eq("id", montageId).single();
    if (error || montage.user_id !== userData.user.id) return NextResponse.json({ error: "Montage introuvable" }, { status: 404 });

    const { data: job, error: jobError } = await supabase.from("livestat_render_jobs").insert({
      user_id: userData.user.id, montage_id: montageId, status: "queued",
    }).select("id,status").single();
    if (jobError) throw jobError;
    await supabase.from("livestat_montages").update({ export_status: "queued", updated_at: new Date().toISOString() }).eq("id", montageId);
    return NextResponse.json({ ok: true, job });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
