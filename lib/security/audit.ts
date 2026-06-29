import { createClient } from "@/lib/supabase/server";

export async function logSecurityEvent(input: {
  type: string;
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = await createClient();

    await supabase.from("security_events").insert({
      event_type: input.type,
      user_id: input.userId ?? null,
      email: input.email ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      metadata: input.metadata ?? {},
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Security event log failed:", error);
  }
}

export async function logAdminAction(input: {
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("admin_audit_logs").insert({
      actor_id: user?.id ?? null,
      action: input.action,
      target_table: input.targetTable ?? null,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? {},
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Admin audit log failed:", error);
  }
}
