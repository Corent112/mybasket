import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

const ROLES = new Set(["owner", "admin", "formation", "performance", "communication", "lecture"]);

function permissionsFor(role: string) {
  if (role === "owner" || role === "admin") return { players: true, training: true, calendar: true, documents: true, communication: true, members: true, settings: true };
  if (role === "formation") return { players: false, training: true, calendar: true, documents: true, communication: true, members: false, settings: false };
  if (role === "performance") return { players: true, training: false, calendar: true, documents: true, communication: false, members: false, settings: false };
  if (role === "communication") return { players: false, training: false, calendar: true, documents: true, communication: true, members: false, settings: false };
  return { players: true, training: true, calendar: true, documents: true, communication: false, members: false, settings: false, read_only: true };
}

async function actorContext(structureId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Non connecté" }, { status: 401 }) } as const;
  const admin = createAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY absente" }, { status: 503 }) } as const;
  const { data: member } = await admin.from("institutional_members").select("id,role,status").eq("structure_id", structureId).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!member) return { error: NextResponse.json({ error: "Accès refusé à cette institution" }, { status: 403 }) } as const;
  return { admin, user, member } as const;
}

export async function GET(req: Request) {
  const structureId = new URL(req.url).searchParams.get("structureId") || "";
  if (!structureId) return NextResponse.json({ error: "structureId manquant" }, { status: 400 });
  const ctx = await actorContext(structureId);
  if ("error" in ctx) return ctx.error;

  const { data: members, error } = await ctx.admin.from("institutional_members").select("id,user_id,role,status,permissions,created_at").eq("structure_id", structureId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const ids = (members || []).map((m: any) => m.user_id).filter(Boolean);
  const profiles = ids.length ? await ctx.admin.from("profiles").select("id,email,display_name,avatar_url").in("id", ids) : { data: [] as any[] };
  const byId = new Map((profiles.data || []).map((p: any) => [String(p.id), p]));
  return NextResponse.json({ members: (members || []).map((m: any) => ({ ...m, profiles: byId.get(String(m.user_id)) || null })) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  const email = String(body.email || "").trim().toLowerCase();
  const role = ROLES.has(String(body.role || "")) ? String(body.role) : "lecture";
  if (!structureId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Institution ou email invalide" }, { status: 400 });
  const ctx = await actorContext(structureId);
  if ("error" in ctx) return ctx.error;
  if (!new Set(["owner", "admin"]).has(String(ctx.member.role))) return NextResponse.json({ error: "Seuls le propriétaire ou un administrateur peut inviter des membres." }, { status: 403 });

  let userId = "";
  let invited = false;
  const { data: profile } = await ctx.admin.from("profiles").select("id,email").ilike("email", email).maybeSingle();
  if (profile?.id) {
    userId = String(profile.id);
  } else {
    const origin = new URL(req.url).origin;
    const invite = await ctx.admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/institutionnel/${structureId}` });
    if (invite.error || !invite.data.user?.id) return NextResponse.json({ error: invite.error?.message || "Invitation Supabase impossible" }, { status: 400 });
    userId = invite.data.user.id;
    invited = true;
  }

  const existing = await ctx.admin.from("institutional_members").select("id").eq("structure_id", structureId).eq("user_id", userId).maybeSingle();
  const payload = { role, status: "active", permissions: permissionsFor(role), updated_at: new Date().toISOString() };
  const write = existing.data?.id
    ? await ctx.admin.from("institutional_members").update(payload).eq("id", existing.data.id)
    : await ctx.admin.from("institutional_members").insert({ structure_id: structureId, user_id: userId, ...payload });
  if (write.error) return NextResponse.json({ error: write.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, invited });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  const memberId = String(body.memberId || "");
  const role = ROLES.has(String(body.role || "")) ? String(body.role) : "lecture";
  if (!structureId || !memberId) return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
  const ctx = await actorContext(structureId);
  if ("error" in ctx) return ctx.error;
  if (!new Set(["owner", "admin"]).has(String(ctx.member.role))) return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
  const q = await ctx.admin.from("institutional_members").update({ role, permissions: permissionsFor(role), updated_at: new Date().toISOString() }).eq("id", memberId).eq("structure_id", structureId);
  if (q.error) return NextResponse.json({ error: q.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  const memberId = String(body.memberId || "");
  const ctx = await actorContext(structureId);
  if ("error" in ctx) return ctx.error;
  if (!new Set(["owner", "admin"]).has(String(ctx.member.role))) return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
  const q = await ctx.admin.from("institutional_members").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", memberId).eq("structure_id", structureId).neq("role", "owner");
  if (q.error) return NextResponse.json({ error: q.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
