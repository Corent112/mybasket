import type { SupabaseClient, User } from "@supabase/supabase-js";
import { messageBlocks } from "./inbox-controls";

type Thread = {
  id: string;
  sender_user_id: string | null;
  recipient_user_id: string | null;
  recipient_email: string | null;
  status: string;
};
type Recipient = Pick<User, "id" | "email" | "email_confirmed_at">;

export function isInvitationRecipient(thread: Thread, user: Recipient) {
  return thread.sender_user_id !== user.id &&
    (thread.recipient_user_id === user.id || (
      !thread.recipient_user_id && Boolean(user.email_confirmed_at && user.email &&
        thread.recipient_email?.toLowerCase() === user.email.toLowerCase())
    ));
}

export async function saveInvitationDecision(db: SupabaseClient, thread: Thread, user: Recipient, decision: "accept" | "decline") {
  if (!isInvitationRecipient(thread, user)) return null;
  if (thread.status === "open" || thread.status === "declined") return thread.status;
  if (thread.status !== "invited") return null;
  if (decision === "accept" && thread.sender_user_id) {
    const blocks = await messageBlocks(db, user.id);
    if (blocks.incoming.has(thread.sender_user_id) || blocks.outgoing.has(thread.sender_user_id)) return null;
  }
  const status = decision === "accept" ? "open" : "declined";
  const { data, error } = await db.from("platform_conversations").update({
    status,
    recipient_user_id: user.id,
    recipient_email: null,
    updated_at: new Date().toISOString(),
  }).eq("id", thread.id).eq("status", "invited").select("id").maybeSingle();
  return error || !data ? null : status;
}
