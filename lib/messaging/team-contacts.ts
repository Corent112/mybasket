import type { SupabaseClient } from '@supabase/supabase-js';
export type TeamContact = { id: string; name: string; kind: 'staff' | 'player'; userId: string | null; playerId?: string };
export class MessagingAccessError extends Error { constructor(message: string, public status = 403) { super(message); } }
export async function teamMessagingContacts(db: SupabaseClient, userId: string, teamId: string) {
  const [teamResult, membersResult] = await Promise.all([
    db.from('teams').select('id,user_id,name').eq('id', teamId).maybeSingle(),
    db.from('team_members').select('user_id,role,permissions,status').eq('team_id', teamId).eq('status', 'active'),
  ]);
  if (teamResult.error || membersResult.error) throw new MessagingAccessError('Équipe indisponible.', 503);
  const team = teamResult.data, members = membersResult.data || [];
  const member = members.find(row => row.user_id === userId);
  if (!team || (team.user_id !== userId && !member)) throw new MessagingAccessError('Accès à cette équipe requis.');
  const canLinkPlayers = team.user_id === userId || member?.permissions?.players === true;
  const roster = canLinkPlayers ? await db.from('players').select('id,first_name,last_name,metadata').eq('team_id', teamId) : { data: [], error: null };
  if (roster.error) throw new MessagingAccessError('Effectif indisponible.', 503);
  const players = roster.data || [];
  const ids = [...new Set([team.user_id, ...members.map(row => row.user_id), ...players.map(row => row.metadata?.messagingUserId)].filter(Boolean))];
  const profiles = ids.length ? await db.from('profiles').select('id,display_name').in('id', ids) : { data: [], error: null };
  if (profiles.error) throw new MessagingAccessError('Comptes indisponibles.', 503);
  const accounts = new Map((profiles.data || []).map(row => [row.id, row.display_name || 'Membre du staff']));
  const contacts: TeamContact[] = [];
  for (const id of [team.user_id, ...members.map(row => row.user_id)]) {
    if (!id || id === userId || !accounts.has(id) || contacts.some(row => row.userId === id)) continue;
    contacts.push({ id: `staff:${id}`, name: accounts.get(id)!, kind: 'staff', userId: id });
  }
  for (const player of players) {
    const linked = player.metadata?.messagingUserId;
    if (linked === userId) continue;
    contacts.push({ id: `player:${player.id}`, name: [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Joueur', kind: 'player', playerId: player.id, userId: linked && accounts.has(linked) ? linked : null });
  }
  return { team, contacts, canLinkPlayers };
}
