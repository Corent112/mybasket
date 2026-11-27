import type { SupabaseClient } from "@supabase/supabase-js";

export const isMessageId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export async function messageBlocks(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from("message_user_blocks").select("blocker_id,blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  if (error) throw error;
  return {
    outgoing: new Set<string>((data ?? []).filter(row => row.blocker_id === userId).map(row => row.blocked_id)),
    incoming: new Set<string>((data ?? []).filter(row => row.blocked_id === userId).map(row => row.blocker_id)),
  };
}

export function messagePeer(userId: string, conversation: { sender_user_id: string | null; recipient_user_id: string | null }) {
  const peer = conversation.sender_user_id === userId ? conversation.recipient_user_id : conversation.sender_user_id;
  return peer === userId ? null : peer;
}
