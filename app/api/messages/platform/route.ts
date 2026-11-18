import { after, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin-server';
import { GROUP_SUBJECT, groupsForUser, groupForConversation } from '@/lib/messaging/groups';
import { sendMessagePush } from '@/lib/messaging/push-server';
import { MessagingAccessError } from '@/lib/messaging/team-contacts';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET() {
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();
 if(!user)return NextResponse.json({error:'Non connecté'},{status:401});
 const db=createAdminClient();if(!db)return NextResponse.json({error:'Messagerie indisponible.'},{status:503});
 try{
  const groups=await groupsForUser(db,user.id),groupMap=new Map(groups.map(g=>[g.id,g]));
  const direct=await db.from('platform_conversations').select('*,platform_conversation_replies(*)').or(`sender_user_id.eq.${user.id},recipient_user_id.eq.${user.id}`).order('updated_at',{ascending:false});
  if(direct.error)throw Error('read');
  const groupRows=groups.length?await db.from('platform_conversations').select('*,platform_conversation_replies(*)').in('id',groups.map(g=>g.id)):{data:[],error:null};
  if(groupRows.error)throw Error('read');
  const rows=[...new Map([...(direct.data||[]),...(groupRows.data||[])].map(row=>[row.id,row])).values()].filter(row=>!row.subject?.startsWith(GROUP_SUBJECT)||(groupMap.get(row.id)?.createdBy===row.sender_user_id&&groupMap.get(row.id)?.teamId===row.reference_id)).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
  const ids=[...new Set(rows.flatMap(row=>[row.sender_user_id,row.recipient_user_id,...(row.platform_conversation_replies||[]).map((r:{sender_user_id:string})=>r.sender_user_id)]).filter(Boolean))];
  const profiles=ids.length?await db.from('profiles').select('id,display_name').in('id',ids):{data:[]};
  const names=new Map((profiles.data||[]).map(row=>[row.id,row.display_name]));
  return NextResponse.json({userId:user.id,conversations:rows.map(row=>{const group=groupMap.get(row.id);return{...row,subject:group?group.name:row.subject,is_group:Boolean(group),member_count:group?.memberIds.length,participant_name:group?group.name:names.get(row.sender_user_id===user.id?row.recipient_user_id:row.sender_user_id)||row.sender_name||'MyBasket',platform_conversation_replies:[...(row.platform_conversation_replies||[])].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).map(reply=>({...reply,sender_name:names.get(reply.sender_user_id)||'Membre'}))}})},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Chargement de la messagerie impossible.'},{status:503})}
}
export async function POST(request:Request){
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:'Non connecté'},{status:401});
 const body=await request.json().catch(()=>null),id=String(body?.conversationId||''),message=String(body?.message||'').trim();
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||!message||message.length>5000)return NextResponse.json({error:'Message invalide (5 000 caractères maximum).'},{status:400});
 const db=createAdminClient();if(!db)return NextResponse.json({error:'Messagerie indisponible.'},{status:503});
 try{
  const{data:conversation,error:readError}=await db.from('platform_conversations').select('id,subject,reference_id,sender_user_id,recipient_user_id').eq('id',id).maybeSingle();
  if(readError||!conversation)throw new MessagingAccessError('Conversation inaccessible.');
  const group=await groupForConversation(db,conversation,user.id);
  if(!group&&conversation.sender_user_id!==user.id&&conversation.recipient_user_id!==user.id)throw new MessagingAccessError('Conversation inaccessible.');
  const{error}=await db.from('platform_conversation_replies').insert({conversation_id:conversation.id,sender_user_id:user.id,message,created_at:new Date().toISOString()});
  if(error)throw new MessagingAccessError('Le message n’a pas été enregistré.',503);
  await db.from('platform_conversations').update({updated_at:new Date().toISOString()}).eq('id',conversation.id);
  const recipients=(group?.memberIds||[conversation.sender_user_id,conversation.recipient_user_id]).filter((id):id is string=>Boolean(id&&id!==user.id));
  after(()=>sendMessagePush(db,recipients,{title:group?.name||'MyBasket',conversationId:conversation.id}));
  return NextResponse.json({ok:true});
 }catch(error){return NextResponse.json({error:error instanceof MessagingAccessError?error.message:'Message non envoyé.'},{status:error instanceof MessagingAccessError?error.status:503})}
}
