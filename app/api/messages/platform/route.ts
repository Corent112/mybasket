import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ conversations: [] }, { status: 401 });

  const { data, error } = await supabase
    .from("platform_conversations")
    .select("*,platform_conversation_replies(*)")
    .or(`sender_user_id.eq.${user.id},recipient_user_id.eq.${user.id}`)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ conversations: [], error: error.message });
  return NextResponse.json({ conversations: data || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await request.json();
  const conversationId = String(body.conversationId || "");
  const message = String(body.message || "").trim();
  if (!conversationId || !message) return NextResponse.json({ error: "Message invalide" }, { status: 400 });

  const { error } = await supabase.from("platform_conversation_replies").insert({
    conversation_id: conversationId,
    sender_user_id: user.id,
    message,
    created_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from("platform_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  return NextResponse.json({ ok: true });
}
