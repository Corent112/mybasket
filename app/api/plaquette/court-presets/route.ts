import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const table = "plaquette_court_presets";
const fields = "id, name, style, branding, player_colors, created_at";
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "Session expirée");
  const { data, error } = await supabase.from(table).select(fields)
    .eq("user_id", user.id).order("created_at", { ascending: false }).abortSignal(request.signal);
  if (error) {
    console.error("Court presets list", error.code);
    return fail(502, "Terrains du compte indisponibles");
  }
  return NextResponse.json({ owner: user.id, items: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!object(body) || typeof body.id !== "string" || typeof body.owner !== "string"
    || typeof body.name !== "string" || !body.name.trim() || !object(body.style)
    || !object(body.branding) || !object(body.player_colors)) return fail(400, "Terrain invalide");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== body.owner) return fail(401, "Session expirée");

  const values = {
    name: body.name.trim().slice(0, 40),
    style: body.style,
    branding: body.branding,
    player_colors: body.player_colors,
  };
  // Existing models retain their identifier. For new models, reuse the
  // browser-generated UUID so retrying a request cannot create a duplicate.
  if (body.create === true && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id))
    return fail(400, "Identifiant de terrain invalide");
  const presets = supabase.from(table);
  const query = body.create === true
    ? presets.upsert({ ...values, id: body.id, user_id: user.id }, { onConflict: "id" })
    : presets.update(values).eq("id", body.id).eq("user_id", user.id);
  const { data, error } = await query.select("id, created_at").abortSignal(request.signal).single();
  if (error) {
    console.error("Court preset save", error.code);
    return fail(502, "Écriture sur le compte indisponible");
  }
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const owner = url.searchParams.get("owner");
  if (!id) return fail(400, "Identifiant manquant");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== owner) return fail(401, "Session expirée");

  const { error } = await supabase.from(table).delete().eq("id", id)
    .eq("user_id", user.id).abortSignal(request.signal);
  if (error) return fail(502, "Suppression sur le compte indisponible");
  return new Response(null, { status: 204 });
}
