import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin-server';
import { pushKeys,pushRegistered,registerPush,unregisterPush } from '@/lib/messaging/push-server';
import { MessagingAccessError } from '@/lib/messaging/team-contacts';
export const runtime='nodejs';
async function context(){const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)throw new MessagingAccessError('Connecte-toi pour activer les notifications.',401);const db=createAdminClient();if(!db)throw new MessagingAccessError('Notifications indisponibles.',503);return{user,db}}
const failure=(error:unknown)=>NextResponse.json({error:error instanceof MessagingAccessError?error.message:'Notifications indisponibles.'},{status:error instanceof MessagingAccessError?error.status:503});
export async function GET(request:Request){try{const{user,db}=await context();const endpoint=new URL(request.url).searchParams.get('endpoint');if(endpoint&&endpoint.length>4096)throw new MessagingAccessError('Appareil invalide.',400);if(endpoint)return NextResponse.json({enabled:await pushRegistered(db,user.id,endpoint)},{headers:{'Cache-Control':'no-store'}});const keys=await pushKeys(db);return NextResponse.json({publicKey:keys.publicKey},{headers:{'Cache-Control':'no-store'}})}catch(error){return failure(error)}}
export async function POST(request:Request){try{const{user,db}=await context();const body=await request.json();await registerPush(db,user.id,body.subscription);return NextResponse.json({ok:true})}catch(error){return failure(error)}}
export async function DELETE(request:Request){try{const{user,db}=await context();const{endpoint}=await request.json();if(typeof endpoint!=='string'||endpoint.length>4096)throw new MessagingAccessError('Appareil invalide.',400);await unregisterPush(db,user.id,endpoint);return NextResponse.json({ok:true})}catch(error){return failure(error)}}
