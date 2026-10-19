import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { canManageSport, institutionalSportActor } from '@/lib/institutionnel/sport-access-server';
import { FAMILY_GROUPS, belongsToFamilyGroup } from '@/lib/institutionnel/family-form';
import { signFamilyClaim } from '@/lib/institutionnel/family-form-server';
export async function POST(req:Request) {
  const body=await req.json().catch(()=>({})),structureId=String(body.structureId||'');
  if(!structureId)return NextResponse.json({error:'Institution manquante'},{status:400});
  const actor=await institutionalSportActor(structureId);if('error'in actor)return actor.error;
  if(!canManageSport(actor.member))return NextResponse.json({error:'Droits insuffisants'},{status:403});
  const structure=await actor.admin.from('institutional_structures').select('name,season_label').eq('id',structureId).maybeSingle();
  if(structure.error||!structure.data)return NextResponse.json({error:'Institution introuvable'},{status:404});
  const counts={u13m:0,u13f:0,u14m:0,u14f:0};
  for(let start=0;;start+=1000){
    const result=await actor.admin.from('institutional_players').select('id,birthdate,category,sex,archived,status,profile_data').eq('structure_id',structureId).order('id').range(start,start+999);
    if(result.error)return NextResponse.json({error:'Lecture des groupes impossible'},{status:500});
    for(const player of result.data||[])for(const group of FAMILY_GROUPS)if(belongsToFamilyGroup(player,group.id,structure.data.season_label))counts[group.id]++;
    if((result.data||[]).length<1000)break;
  }
  const exp=Date.now()+30*86400000;
  const groups=await Promise.all(FAMILY_GROUPS.map(async group=>{
    const token=signFamilyClaim({purpose:'institution-family',structureId,group:group.id,exp});
    const url=`${new URL(req.url).origin}/informations-famille/${token}`;
    return {...group,count:counts[group.id],url,qr:await QRCode.toDataURL(url,{width:450,margin:2,errorCorrectionLevel:'M'})};
  }));
  return NextResponse.json({name:structure.data.name,expiresAt:new Date(exp).toISOString(),groups},{headers:{'Cache-Control':'no-store'}});
}
