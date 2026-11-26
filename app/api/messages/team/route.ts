import { after, NextResponse } from 'next/server';
import { GROUP_SUBJECT, messageGroups, registerMessageGroup } from '@/lib/messaging/groups';
import { notifyMessageRecipients } from '@/lib/messaging/notify-server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin-server';
import { teamMessagingContacts, MessagingAccessError } from '@/lib/messaging/team-contacts';
export const runtime='nodejs';
export const maxDuration=60;
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
async function context() {
  const sb = await createClient(); const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new MessagingAccessError('Connecte-toi pour ouvrir la messagerie.', 401);
  const db = createAdminClient(); if (!db) throw new MessagingAccessError('Messagerie temporairement indisponible.', 503);
  return { user, db };
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof MessagingAccessError ? error.message : 'La messagerie est indisponible. Réessaie.' }, { status: error instanceof MessagingAccessError ? error.status : 500 }); }
export async function GET(request: Request) {
  try {
    const { user, db } = await context(); const teamId = new URL(request.url).searchParams.get('teamId');
    if (teamId) {
      if (!uuid(teamId)) throw new MessagingAccessError('Équipe invalide.', 400);
      const result = await teamMessagingContacts(db, user.id, teamId);
      const {data:row,error:groupError}=await db.from('teams').select('metadata').eq('id',teamId).maybeSingle();
      if(groupError)throw new MessagingAccessError('Groupes indisponibles.',503);
      return NextResponse.json({ contacts: result.contacts, canLinkPlayers: result.canLinkPlayers, groups:messageGroups(row?.metadata).filter(group=>group.memberIds.includes(user.id)).map(group=>({id:group.id,name:group.name,count:group.memberIds.length})) });
    }
    const [owned, member] = await Promise.all([db.from('teams').select('id,name').eq('user_id', user.id), db.from('team_members').select('team_id').eq('user_id', user.id).eq('status', 'active')]);
    if (owned.error || member.error) throw new MessagingAccessError('Équipes indisponibles.', 503);
    const ids = (member.data || []).map(row => row.team_id);
    const shared = ids.length ? await db.from('teams').select('id,name').in('id', ids) : { data: [], error: null };
    if (shared.error) throw new MessagingAccessError('Équipes indisponibles.', 503);
    return NextResponse.json({ teams: [...new Map([...(owned.data || []), ...(shared.data || [])].map(row => [row.id, row])).values()] });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { user, db } = await context(); const body = await request.json();
    const message = String(body.message || '').trim();
    const ids = [...new Set(Array.isArray(body.recipientIds) ? body.recipientIds : [body.recipientId])];
    if (!uuid(body.teamId) || !ids.length || ids.length>50 || !ids.every(uuid) || !message || message.length > 5000) throw new MessagingAccessError('Équipe, destinataires ou message invalide.', 400);
    const { contacts, team } = await teamMessagingContacts(db, user.id, body.teamId);
    const recipients=ids.map(id=>contacts.find(row=>row.userId===id));
    if(recipients.some(row=>!row||row.userId===user.id))throw new MessagingAccessError('Un destinataire n’est pas relié à cette équipe.');
    const { data: profile } = await db.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const now = new Date().toISOString(), isGroup=body.mode==='group';
    const name=String(body.groupName||'').trim().slice(0,80);
    if(isGroup&&(!name||ids.length<2))throw new MessagingAccessError('Nomme le groupe et choisis au moins deux destinataires.',400);
    const rows=(isGroup?recipients.slice(0,1):recipients).map(recipient=>({id:crypto.randomUUID(),conversation_type:'accompagnement',subject:isGroup?GROUP_SUBJECT+name:`Équipe · ${team.name} · ${recipient!.name}`,initial_message:message,sender_user_id:user.id,sender_name:profile?.display_name||'Coach',sender_email:user.email||null,recipient_user_id:recipient!.userId,reference_id:team.id,status:'open',created_at:now,updated_at:now}));
    const { data, error } = await db.from('platform_conversations').insert(rows).select('id');
    if(error||data?.length!==rows.length)throw new MessagingAccessError('Le message n’a pas pu être enregistré.',503);
    if(isGroup){
      try{await registerMessageGroup(db,team.id,{id:rows[0].id,name,memberIds:[user.id,...ids as string[]],createdBy:user.id,createdAt:now})}
      catch(error){await db.from('platform_conversations').delete().eq('id',rows[0].id);throw error}
    }
    after(async()=>{if(isGroup)await notifyMessageRecipients(db,ids as string[],{title:name,conversationId:rows[0].id});else await Promise.all(rows.map(row=>notifyMessageRecipients(db,[row.recipient_user_id!],{title:profile?.display_name||'MyBasket',conversationId:row.id}))) });
    return NextResponse.json({ id: rows[0].id, ids:rows.map(row=>row.id), count:rows.length, group:isGroup });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const { user, db } = await context(); const body = await request.json(); const email = String(body.email || '').trim().toLowerCase();
    if (!uuid(body.teamId) || !uuid(body.playerId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new MessagingAccessError('Joueur ou adresse email invalide.', 400);
    const { canLinkPlayers } = await teamMessagingContacts(db, user.id, body.teamId);
    if (!canLinkPlayers) throw new MessagingAccessError('Droit de gestion des joueurs requis.');
    const [player, profile] = await Promise.all([db.from('players').select('id,metadata,updated_at').eq('id', body.playerId).eq('team_id', body.teamId).maybeSingle(), db.from('profiles').select('id').eq('email', email).maybeSingle()]);
    if (player.error || !player.data) throw new MessagingAccessError('Joueur introuvable.', 404);
    if (profile.error || !profile.data) throw new MessagingAccessError('Aucun compte MyBasket trouvé avec cette adresse. Le joueur doit disposer de son propre compte.', 400);
    if (profile.data.id === user.id) throw new MessagingAccessError('Utilise le compte personnel du joueur, distinct du compte du coach.', 400);
    let write = db.from('players').update({ metadata: { ...(player.data.metadata || {}), messagingUserId: profile.data.id }, updated_at: new Date().toISOString() }).eq('id', body.playerId).eq('team_id', body.teamId);
    write = player.data.updated_at ? write.eq('updated_at', player.data.updated_at) : write.is('updated_at', null);
    const result = await write.select('id').maybeSingle();
    if (!result.error && !result.data) throw new MessagingAccessError('La fiche joueur a changé. Recharge les contacts puis réessaie.', 409);
    if (result.error) throw new MessagingAccessError('Compte non relié. Réessaie.', 503);
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
