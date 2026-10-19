import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin-server';
import { belongsToFamilyGroup, familyBirthdate, familyGroup, familyName, familyPlayerPatch } from '@/lib/institutionnel/family-form';
import { readFamilyClaim, signFamilyClaim } from '@/lib/institutionnel/family-form-server';
import { getClientIp, rateLimit } from '@/lib/security/rate-limit';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}) {
  const {token}=await params,claim=readFamilyClaim(token,'institution-family');if(!claim)return json({error:'Lien invalide ou expiré. Demandez un nouveau QR code à votre institution.'},410);
  const db=createAdminClient();if(!db)return json({error:'Service indisponible'},503);
  const {data,error}=await db.from('institutional_structures').select('name,logo_url,season_label').eq('id',claim.structureId).maybeSingle();
  if(error||!data)return json({error:'Institution introuvable'},404);
  return json({name:data.name,logo:data.logo_url,season:data.season_label,group:familyGroup(claim.group)});
}
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}) {
  const {token}=await params,claim=readFamilyClaim(token,'institution-family');if(!claim)return json({error:'Lien invalide ou expiré'},410);
  if(!rateLimit(`family:${claim.structureId}:${getClientIp(req.headers)}`,30,60000).allowed)return json({error:'Trop de tentatives. Réessayez dans une minute.'},429);
  const db=createAdminClient();if(!db)return json({error:'Service indisponible'},503);
  let b:any;try {const raw=await req.text();if(raw.length>10000)return json({error:'Formulaire trop volumineux'},413);b=JSON.parse(raw);}catch{return json({error:'Formulaire invalide'},400);}
  const institution=await db.from('institutional_structures').select('season_label').eq('id',claim.structureId).maybeSingle();
  if(institution.error||!institution.data)return json({error:'Institution indisponible. Réessayez.'},503);
  const seasonLabel=institution.data.season_label;
  if(b.action==='find') {
    const birthdate=familyBirthdate(b.birthdate),first=familyName(b.firstName),last=familyName(b.lastName);
    if(!birthdate||!first||!last||first.length>100||last.length>150)return json({error:'Renseignez le nom, le prénom et la date de naissance.'},400);
    const result=await db.from('institutional_players').select('id,first_name,last_name,birthdate,category,sex,archived,status').eq('structure_id',claim.structureId).eq('birthdate',birthdate);
    if(result.error)return json({error:'Recherche indisponible. Réessayez.'},503);
    const players=(result.data||[]).filter(p=>belongsToFamilyGroup(p,claim.group,seasonLabel)&&familyName(p.first_name)===first&&familyName(p.last_name)===last);
    if(players.length>1)return json({error:'Plusieurs fiches correspondent à cette identité. Contactez votre institution avant de compléter.'},409);
    return json({players:players.map(p=>({name:`${p.first_name} ${p.last_name}`,ticket:signFamilyClaim({purpose:'institution-family-player',structureId:claim.structureId,group:claim.group,playerId:p.id,exp:Math.min(claim.exp,Date.now()+15*60000)})}))});
  }
  if(b.action!=='save')return json({error:'Action inconnue'},400);
  const ticket=readFamilyClaim(String(b.ticket||''),'institution-family-player');
  if(!ticket||ticket.structureId!==claim.structureId||ticket.group!==claim.group)return json({error:'Vérifiez de nouveau l’identité du joueur avant de transmettre.'},403);
  if(b.confirm!==true)return json({error:'Confirmez que vous êtes autorisé à renseigner cette fiche.'},400);
  const current=await db.from('institutional_players').select('id,structure_id,birthdate,category,sex,archived,status,profile_data,updated_at').eq('id',ticket.playerId!).eq('structure_id',claim.structureId).maybeSingle();
  if(current.error)return json({error:'Lecture impossible. Réessayez.'},503);
  if(!current.data||!belongsToFamilyGroup(current.data,claim.group,seasonLabel))return json({error:'Cette fiche n’est plus disponible dans ce groupe.'},404);
  let patch:Record<string,any>;try{patch=familyPlayerPatch(b.fields||{},current.data.profile_data||{},claim.group);}catch(error){return json({error:error instanceof Error?error.message:'Informations invalides'},400);}
  let query=db.from('institutional_players').update(patch).eq('id',current.data.id).eq('structure_id',claim.structureId);
  query=current.data.updated_at?query.eq('updated_at',current.data.updated_at):query.is('updated_at',null);
  const saved=await query.select('id').maybeSingle();
  if(saved.error)return json({error:'Enregistrement impossible. Vos informations restent dans le formulaire.'},503);
  if(!saved.data)return json({error:'La fiche vient de changer. Cliquez à nouveau sur Enregistrer.'},409);
  return json({ok:true});
}
