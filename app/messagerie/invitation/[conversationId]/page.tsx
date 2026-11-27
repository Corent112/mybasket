import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { isMessageId } from "@/lib/messaging/inbox-controls";
import { isInvitationRecipient, saveInvitationDecision } from "@/lib/messaging/invitations";

type Decision = "accept" | "decline";
const invitationPath = (id: string, decision: Decision) => `/messagerie/invitation/${id}?decision=${decision}`;
const inboxPath = (id?: string) => id ? `/mon-compte?tab=messagerie&conversation=${id}` : "/mon-compte?tab=messagerie";

async function getRecipientInvitation(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "signed-out" } as const;
  const db = createAdminClient();
  if (!db) return { status: "unavailable" } as const;
  const { data: thread, error } = await db.from("platform_conversations")
    .select("id,sender_user_id,sender_name,recipient_user_id,recipient_email,status")
    .eq("id", id).maybeSingle();
  if (error) return { status: "unavailable" } as const;
  if (!thread || !isInvitationRecipient(thread, user)) return { status: "forbidden" } as const;
  return { status: "ok", db, user, thread } as const;
}

async function answerInvitation(id: string, decision: Decision) {
  "use server";
  if (!isMessageId(id) || (decision !== "accept" && decision !== "decline")) redirect(inboxPath());
  const path = invitationPath(id, decision);
  const invitation = await getRecipientInvitation(id);
  if (invitation.status === "signed-out") redirect(`/connexion?next=${encodeURIComponent(path)}`);
  if (invitation.status !== "ok") redirect(`${path}&result=error`);
  const { db, user, thread } = invitation;
  const status = await saveInvitationDecision(db, thread, user, decision).catch(() => null);
  if (status === "open") redirect(inboxPath(id));
  redirect(`${path}&result=${status === "declined" ? "declined" : "error"}`);
}

export default async function InvitationPage({ params, searchParams }: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ decision?: string; result?: string }>;
}) {
  const { conversationId: id } = await params;
  const query = await searchParams;
  const decision = query.decision === "decline" ? "decline" : "accept";
  const invitation = isMessageId(id) ? await getRecipientInvitation(id) : { status: "forbidden" } as const;
  const path = invitationPath(id, decision);

  return <main style={{ maxWidth: 560, margin: "40px auto", padding: 22 }}>
    <h1 style={{ color: "#6b1a2c" }}>Invitation à échanger</h1>
    {invitation.status === "signed-out" ? <>
      <p>Connecte-toi avec l’adresse qui a reçu l’invitation, ou crée un compte avec cette adresse.</p>
      <Link href={`/connexion?next=${encodeURIComponent(path)}`}>Se connecter ou créer un compte</Link>
    </> : invitation.status !== "ok" ? <p>Cette invitation est indisponible pour ce compte.</p>
    : invitation.thread.status === "declined" ? <><p>Invitation refusée.</p><Link href={inboxPath()}>Ouvrir ma messagerie</Link></>
    : invitation.thread.status === "open" ? <Link href={inboxPath(id)}>Ouvrir la conversation</Link>
    : invitation.thread.status === "invited" ? <>
      <p>{invitation.thread.sender_name || "Un membre MyBasket"} t’invite à discuter sur MyBasket.</p>
      {query.result === "error" && <p role="alert">Impossible d’enregistrer cette réponse. Réessaie.</p>}
      <form action={answerInvitation.bind(null, id, decision)}>
        <button type="submit" style={{ background: "#6b1a2c", color: "#fff", border: 0, borderRadius: 8, padding: "12px 16px", fontWeight: "bold" }}>
          {decision === "accept" ? "Confirmer l’acceptation" : "Confirmer le refus"}
        </button>
      </form>
      <p><Link href={invitationPath(id, decision === "accept" ? "decline" : "accept")}>
        {decision === "accept" ? "Refuser l’invitation" : "Accepter l’invitation"}
      </Link></p>
    </> : <p>Cette invitation est indisponible.</p>}
  </main>;
}
