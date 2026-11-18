import type { SupabaseClient } from '@supabase/supabase-js';
import { MessagingAccessError } from './team-contacts';
export const GROUP_SUBJECT = '[MyBasket groupe] ';
export type MessageGroup = { id:string; name:string; memberIds:string[]; createdBy:string; createdAt:string };
export function messageGroups(metadata:unknown):MessageGroup[]{
 const rows=(metadata as {messagingGroups?:unknown})?.messagingGroups;
 if(!Array.isArray(rows))return[];
 return rows.filter((g):g is MessageGroup=>Boolean(g&&typeof g.id==='string'&&typeof g.name==='string'&&typeof g.createdBy==='string'&&Array.isArray(g.memberIds)&&g.memberIds.every((id:unknown)=>typeof id==='string')));
}
export async function groupsForUser(db:SupabaseClient,userId:string){
 const result=await db.from('teams').select('id,metadata').contains('metadata',{messagingGroups:[{memberIds:[userId]}]});
 if(result.error)throw new MessagingAccessError('Groupes indisponibles.',503);
 return(result.data||[]).flatMap(team=>messageGroups(team.metadata).filter(group=>group.memberIds.includes(userId)).map(group=>({...group,teamId:team.id})));
}
export async function groupForConversation(db:SupabaseClient,conversation:{id:string;subject:string;reference_id?:string|null;sender_user_id?:string|null},userId:string){
 if(!conversation.subject.startsWith(GROUP_SUBJECT))return null;
 const{data,error}=await db.from('teams').select('id,metadata').eq('id',conversation.reference_id).maybeSingle();
 if(error)throw new MessagingAccessError('Groupe indisponible.',503);
 const group=messageGroups(data?.metadata).find(g=>g.id===conversation.id&&g.createdBy===conversation.sender_user_id&&g.memberIds.includes(userId));
 if(!group)throw new MessagingAccessError('Tu ne fais pas partie de ce groupe.');
 return group;
}
/** Compare-and-swap protects other team settings and simultaneous group creation. */
export async function registerMessageGroup(db:SupabaseClient,teamId:string,group:MessageGroup){
 for(let attempt=0;attempt<3;attempt++){
  const{data:team,error}=await db.from('teams').select('metadata,updated_at').eq('id',teamId).maybeSingle();
  if(error||!team)throw new MessagingAccessError('Équipe indisponible.',503);
  const groups=messageGroups(team.metadata);if(groups.length>=100)throw new MessagingAccessError('Cette équipe a atteint la limite de 100 groupes.',400);
  let update=db.from('teams').update({metadata:{...(team.metadata||{}),messagingGroups:[...groups,group]},updated_at:new Date(Math.max(Date.now(),(Date.parse(team.updated_at||'')||0)+1)).toISOString()}).eq('id',teamId);
  update=team.updated_at?update.eq('updated_at',team.updated_at):update.is('updated_at',null);
  const result=await update.select('id').maybeSingle();
  if(result.error)throw new MessagingAccessError('Le groupe n’a pas pu être enregistré.',503);
  if(result.data)return;
 }
 throw new MessagingAccessError('L’équipe a été modifiée. Réessaie de créer le groupe.',409);
}
