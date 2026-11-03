import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin-server';
import {canManageTeamTests,createPlayerTestToken} from '@/lib/player-test-links';
import {isSameOriginMutation} from '@/lib/security/request-origin';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(!isSameOriginMutation(req))return NextResponse.json({error:'Origine refusée'},{status:403});
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:'Non connecté'},{status:401});
 const db=createAdminClient();if(!db)return NextResponse.json({error:'Service indisponible'},{status:503});
 const body=await req.json().catch(()=>({}));const team=await db.from('teams').select('id,user_id,metadata,updated_at').eq('id',String(body.teamId||'')).maybeSingle();
 if(!team.data||!await canManageTeamTests(db,team.data,user.id))return NextResponse.json({error:'Droits insuffisants'},{status:403});
 const revoke=body.action==='revoke',created=revoke?null:createPlayerTestToken(team.data.id);
 let query=db.from('teams').update({metadata:{...team.data.metadata,playerTestsLink:created?{tokenHash:created.tokenHash,issuedBy:user.id,enabled:true}:null},updated_at:new Date().toISOString()}).eq('id',team.data.id);
 query=team.data.updated_at?query.eq('updated_at',team.data.updated_at):query.is('updated_at',null);
 const write=await query.select('id');
 if(write.error)return NextResponse.json({error:'Enregistrement impossible'},{status:500});if(!write.data?.length)return NextResponse.json({error:'Les réglages ont changé. Réessaie.'},{status:409});
 return NextResponse.json({ok:true,url:created?`${new URL(req.url).origin}/tests/mesures/${created.token}`:null},{headers:{'Cache-Control':'private, no-store'}});
}
