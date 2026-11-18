import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin-server';
export async function GET() {
  const sb=await createClient();const{data:{user}}=await sb.auth.getUser();
  if(!user)return NextResponse.json({error:'Non connecté'},{status:401});
  const db=createAdminClient()||sb;
  const{data,error}=await db.from('platform_conversations').select('*,platform_conversation_replies(*)').or(`sender_user_id.eq.${user.id},recipient_user_id.eq.${user.id}`).order('updated_at',{ascending:false});
  if(error)return NextResponse.json({error:'Chargement de la messagerie impossible.'},{status:503});
  const rows=data||[],ids=[...new Set(rows.map(row=>row.sender_user_id===user.id?row.recipient_user_id:row.sender_user_id).filter(Boolean))];
  const profiles=ids.length?await db.from('profiles').select('id,display_name').in('id',ids):{data:[]};
  const names=new Map((profiles.data||[]).map(row=>[row.id,row.display_name]));
  return NextResponse.json({userId:user.id,conversations:rows.map(row=>({...row,participant_name:names.get(row.sender_user_id===user.id?row.recipient_user_id:row.sender_user_id)||row.sender_name||'MyBasket',platform_conversation_replies:[...(row.platform_conversation_replies||[])].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))}))},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
  const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:'Non connecté'},{status:401});
  const body=await request.json().catch(()=>null),id=String(body?.conversationId||''),message=String(body?.message||'').trim();
  if(!id||!message||message.length>5000)return NextResponse.json({error:'Message invalide (5 000 caractères maximum).'},{status:400});
  const db=createAdminClient()||sb;
  const{data:conversation,error:readError}=await db.from('platform_conversations').select('id,sender_user_id,recipient_user_id').eq('id',id).or(`sender_user_id.eq.${user.id},recipient_user_id.eq.${user.id}`).maybeSingle();
  if(readError||!conversation)return NextResponse.json({error:'Conversation inaccessible.'},{status:403});
  const{error}=await db.from('platform_conversation_replies').insert({conversation_id:conversation.id,sender_user_id:user.id,message,created_at:new Date().toISOString()});
  if(error)return NextResponse.json({error:'Le message n’a pas été enregistré.'},{status:503});
  await db.from('platform_conversations').update({updated_at:new Date().toISOString()}).eq('id',conversation.id);
  return NextResponse.json({ok:true});
}
