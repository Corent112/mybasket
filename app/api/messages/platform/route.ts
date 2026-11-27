import { after, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin-server';
import { GROUP_SUBJECT, groupsForUser, groupForConversation } from '@/lib/messaging/groups';
import { notifyMessageRecipients } from '@/lib/messaging/notify-server';
import { isSameOriginMutation } from '@/lib/security/request-origin';
import { isMessageId, messageBlocks, messagePeer } from '@/lib/messaging/inbox-controls';
import { MessagingAccessError } from '@/lib/messaging/team-contacts';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET() {
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();
 if(!user)return NextResponse.json({error:'Non connecté'},{status:401});
 const db=createAdminClient();if(!db)return NextResponse.json({error:'Messagerie indisponible.'},{status:503});
 try{
  const [groups, blocks, hidden] = await Promise.all([
   groupsForUser(db,user.id), messageBlocks(db,user.id),
   db.from('message_hidden_threads').select('conversation_id,hidden_at').eq('user_id',user.id),
  ]);
  if (hidden.error) throw hidden.error;
  const hiddenById = new Map((hidden.data ?? []).map(row => [row.conversation_id, Date.parse(row.hidden_at)]));
  const groupMap=new Map(groups.map(g=>[g.id,g]));
  const direct=await db.from('platform_conversations').select('*,platform_conversation_replies(*)').or(`sender_user_id.eq.${user.id},recipient_user_id.eq.${user.id}`).order('updated_at',{ascending:false});
  if(direct.error)throw Error('read');
  const groupRows=groups.length?await db.from('platform_conversations').select('*,platform_conversation_replies(*)').in('id',groups.map(g=>g.id)):{data:[],error:null};
  if(groupRows.error)throw Error('read');
  const rows=[...new Map([...(direct.data||[]),...(groupRows.data||[])].map(row=>[row.id,row])).values()]
   .filter(row=>!row.subject?.startsWith(GROUP_SUBJECT)||(groupMap.get(row.id)?.createdBy===row.sender_user_id&&groupMap.get(row.id)?.teamId===row.reference_id))
   .filter(row => {
    const cutoff = hiddenById.get(row.id);
    const peer = messagePeer(user.id, row);
    const messages = row.platform_conversation_replies ?? [];
    const group = groupMap.get(row.id);
    if (group && (cutoff != null || blocks.outgoing.has(row.sender_user_id))) {
      return messages.some((reply: { sender_user_id: string; created_at: string }) =>
       reply.sender_user_id !== user.id && !blocks.outgoing.has(reply.sender_user_id) && Date.parse(reply.created_at) > (cutoff ?? 0));
    }
    return cutoff == null || (peer && !blocks.outgoing.has(peer) && Date.parse(row.updated_at) > cutoff);
   }).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
  const ids=[...new Set([...blocks.outgoing, ...rows.flatMap(row=>[row.sender_user_id,row.recipient_user_id,...(row.platform_conversation_replies||[]).map((r:{sender_user_id:string})=>r.sender_user_id)]).filter(Boolean)])];
  const profiles=ids.length?await db.from('profiles').select('id,display_name').in('id',ids):{data:[]};
  const names=new Map((profiles.data||[]).map(row=>[row.id,row.display_name]));
  return NextResponse.json({userId:user.id,blockedContacts:[...blocks.outgoing].map(id=>({id,name:names.get(id)||"Contact MyBasket"})),conversations:rows.map(row=>{
   const group=groupMap.get(row.id), peer=messagePeer(user.id,row);
   const cutoff=hiddenById.get(row.id) ?? 0;
   const blocked=Boolean(peer && !group && blocks.outgoing.has(peer));
   const incomingBlock=Boolean(peer && !group && blocks.incoming.has(peer));
   return {
    ...row, subject:group?group.name:row.subject, is_group:Boolean(group), member_count:group?.memberIds.length,
    participant_name:group?group.name:names.get(peer)||row.recipient_email||row.sender_name||'MyBasket',
    is_blocked:blocked, can_block:Boolean(peer&&!group),
    can_reply:Boolean(group||peer||!row.recipient_email)&&!blocked&&!incomingBlock,
    initial_message:Date.parse(row.created_at)>cutoff&&(!group||!blocks.outgoing.has(row.sender_user_id))?row.initial_message:"",
    platform_conversation_replies:[...(row.platform_conversation_replies||[])]
     .filter(reply=>Date.parse(reply.created_at)>cutoff&&(!group||!blocks.outgoing.has(reply.sender_user_id)))
     .sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))
     .map(reply=>({...reply,sender_name:names.get(reply.sender_user_id)||'Membre'})),
   };
  })},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Chargement de la messagerie impossible.'},{status:503})}
}
export async function POST(request:Request){
 if (!isSameOriginMutation(request)) return NextResponse.json({error:'Origine invalide.'},{status:403});
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:'Non connecté'},{status:401});
 const body=await request.json().catch(()=>null),id=String(body?.conversationId||''),message=String(body?.message||'').trim();
 if(!isMessageId(id)||!message||message.length>5000)return NextResponse.json({error:'Message invalide (5 000 caractères maximum).'},{status:400});
 const db=createAdminClient();if(!db)return NextResponse.json({error:'Messagerie indisponible.'},{status:503});
 try{
  const{data:conversation,error:readError}=await db.from('platform_conversations').select('id,subject,reference_id,sender_user_id,recipient_user_id,recipient_email').eq('id',id).maybeSingle();
  if(readError||!conversation)throw new MessagingAccessError('Conversation inaccessible.');
  const group=await groupForConversation(db,conversation,user.id);
  if(!group&&conversation.sender_user_id!==user.id&&conversation.recipient_user_id!==user.id)throw new MessagingAccessError('Conversation inaccessible.');
  const blocks=await messageBlocks(db,user.id);
  const peer=messagePeer(user.id,conversation);
  if(!group && (conversation.recipient_email || (peer && (blocks.outgoing.has(peer) || blocks.incoming.has(peer))))) {
   throw new MessagingAccessError('Cette discussion ne peut pas recevoir de réponse sur MyBasket.',403);
  }
  const now=new Date().toISOString();
  const{error}=await db.from('platform_conversation_replies').insert({conversation_id:conversation.id,sender_user_id:user.id,message,created_at:now});
  if(error)throw new MessagingAccessError('Le message n’a pas été enregistré.',503);
  await db.from('platform_conversations').update({updated_at:now}).eq('id',conversation.id).lt('updated_at',now);
  const recipients=(group?.memberIds||[conversation.sender_user_id,conversation.recipient_user_id]).filter((id):id is string=>Boolean(id&&id!==user.id&&!blocks.outgoing.has(id)&&!blocks.incoming.has(id)));
  after(async()=>{
   const {data:profile}=await db.from('profiles').select('display_name').eq('id',user.id).maybeSingle();
   await notifyMessageRecipients(db,recipients,{title:group?.name||profile?.display_name||'MyBasket',conversationId:conversation.id});
  });
  return NextResponse.json({ok:true});
 }catch(error){return NextResponse.json({error:error instanceof MessagingAccessError?error.message:'Message non envoyé.'},{status:error instanceof MessagingAccessError?error.status:503})}
}

export async function PATCH(request: Request) {
 if (!isSameOriginMutation(request)) return NextResponse.json({error:'Origine invalide.'},{status:403});
 const sb=await createClient();
 const {data:{user}}=await sb.auth.getUser();
 if (!user) return NextResponse.json({error:'Non connecté'},{status:401});
 const body=await request.json().catch(()=>null);
 const unblockById = body?.action === 'unblock' && isMessageId(body?.contactId);
 if (!unblockById && (!isMessageId(body?.conversationId)||!['hide','block','unblock'].includes(body?.action))) {
  return NextResponse.json({error:'Demande invalide.'},{status:400});
 }
 const db=createAdminClient();
 if (!db) return NextResponse.json({error:'Messagerie indisponible.'},{status:503});
 try {
  if (unblockById) {
   const {error}=await db.from('message_user_blocks').delete().eq('blocker_id',user.id).eq('blocked_id',body.contactId);
   if (error) throw error;
   return NextResponse.json({ok:true});
  }
  const {data:conversation,error}=await db.from('platform_conversations')
   .select('id,subject,reference_id,sender_user_id,recipient_user_id').eq('id',body.conversationId).maybeSingle();
  if (error || !conversation) throw new MessagingAccessError('Conversation inaccessible.');
  const group=await groupForConversation(db,conversation,user.id);
  if (!group&&conversation.sender_user_id!==user.id&&conversation.recipient_user_id!==user.id) throw new MessagingAccessError('Conversation inaccessible.');
  const peer=messagePeer(user.id,conversation);
  const result=body.action==='hide'
   ? await db.from('message_hidden_threads').upsert({user_id:user.id,conversation_id:conversation.id,hidden_at:new Date().toISOString()})
   : !group&&peer
    ? body.action==='block'
     ? await db.from('message_user_blocks').upsert({blocker_id:user.id,blocked_id:peer})
     : await db.from('message_user_blocks').delete().eq('blocker_id',user.id).eq('blocked_id',peer)
    : null;
  if (!result) throw new MessagingAccessError('Cette action est réservée aux conversations privées.',400);
  if (result.error) throw result.error;
  return NextResponse.json({ok:true});
 } catch (error) {
  return NextResponse.json({error:error instanceof MessagingAccessError?error.message:'La modification a échoué.'},{status:error instanceof MessagingAccessError?error.status:503});
 }
}
