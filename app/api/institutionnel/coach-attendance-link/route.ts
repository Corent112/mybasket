import {NextResponse} from 'next/server';
import {institutionalSportActor,canManageSport} from '@/lib/institutionnel/sport-access-server';
import {signCoachAttendance,attendanceTokenHash} from '@/lib/institutionnel/coach-attendance-token';
export async function POST(req:Request){const b=await req.json().catch(()=>({})),structureId=String(b.structureId||''),selectionId=String(b.selectionId||'');const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;if(!canManageSport(ctx.member))return NextResponse.json({error:'Droits insuffisants'},{status:403});
 const selection=await ctx.admin.from('institutional_selections').select('id,team_id').eq('id',selectionId).eq('structure_id',structureId).maybeSingle();if(selection.error||!selection.data)return NextResponse.json({error:'Sélection introuvable'},{status:404});
 const team=await ctx.admin.from('teams').select('id,metadata,updated_at').eq('id',selection.data.team_id).maybeSingle();if(team.error||!team.data)return NextResponse.json({error:'Équipe indisponible'},{status:400});
 const expiresAt=Date.now()+30*86400000,token=b.action==='revoke'?'':signCoachAttendance({purpose:'institution-coach-attendance',structureId,selectionId,issuedBy:ctx.user.id,exp:expiresAt});
 const metadata={...(team.data.metadata||{})};if(token)metadata.institutionCoachAttendanceHash=attendanceTokenHash(token);else delete metadata.institutionCoachAttendanceHash;
 let query=ctx.admin.from('teams').update({metadata,updated_at:new Date().toISOString()}).eq('id',team.data.id);query=team.data.updated_at==null?query.is('updated_at',null):query.eq('updated_at',team.data.updated_at);const saved=await query.select('id');if(saved.error||!saved.data?.length)return NextResponse.json({error:'Enregistrement impossible. Réessaie.'},{status:409});
 return NextResponse.json(token?{url:`${new URL(req.url).origin}/presences-selection#${token}`,expiresAt:new Date(expiresAt).toISOString()}:{ok:true},{headers:{'Cache-Control':'no-store'}});
}
