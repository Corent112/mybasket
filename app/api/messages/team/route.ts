import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin-server';
import { teamMessagingContacts, MessagingAccessError } from '@/lib/messaging/team-contacts';
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
      return NextResponse.json({ contacts: result.contacts, canLinkPlayers: result.canLinkPlayers });
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
    if (!uuid(body.teamId) || !uuid(body.recipientId) || !message || message.length > 5000) throw new MessagingAccessError('Équipe, destinataire ou message invalide.', 400);
    const { contacts, team } = await teamMessagingContacts(db, user.id, body.teamId);
    const recipient = contacts.find(row => row.userId === body.recipientId);
    if (!recipient || recipient.userId === user.id) throw new MessagingAccessError('Ce destinataire n’est pas relié à cette équipe.');
    const { data: profile } = await db.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const now = new Date().toISOString();
    // Existing inbox schema: both parties get the same persisted conversation.
    const { data, error } = await db.from('platform_conversations').insert({ conversation_type: 'accompagnement', subject: `Équipe · ${team.name} · ${recipient.name}`, initial_message: message, sender_user_id: user.id, sender_name: profile?.display_name || 'Coach', sender_email: user.email || null, recipient_user_id: recipient.userId, reference_id: team.id, status: 'open', created_at: now, updated_at: now }).select('id').single();
    if (error || !data) throw new MessagingAccessError('Le message n’a pas pu être enregistré.', 503);
    return NextResponse.json({ id: data.id });
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
