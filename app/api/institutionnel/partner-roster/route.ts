import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin-server';

async function context(){
 const sb=await createClient();const {data:{user}}=await sb.auth.getUser();
 if(!user)return null;const db=createAdminClient();if(!db)return null;
 const members=await db.from('team_members').select('team_id,permissions').eq('user_id',user.id).eq('status','active');
 const owned=await db.from('teams').select('id').eq('user_id',user.id);
 if(members.error||owned.error)throw Error('Vérification des droits impossible');
 const permissions=new Map<string,boolean>((members.data||[]).filter((m:any)=>m.permissions?.view_team!==false).map((m:any)=>[m.team_id,m.permissions?.players===true]));
 for(const t of owned.data||[])permissions.set(t.id,true);
 return {db,user,permissions};
}

export async function GET(){try{
 const ctx=await context();if(!ctx)return NextResponse.json({error:'Non connecté'},{status:401});
 const ids=[...ctx.permissions.keys()];if(!ids.length)return NextResponse.json({players:[]});
 const links=await ctx.db.from('institutional_pole_teams').select('structure_id,team_id').in('team_id',ids).eq('team_kind','partner').eq('active',true);
 if(links.error)throw Error(links.error.message);
 const teamIds=(links.data||[]).map((l:any)=>l.team_id);if(!teamIds.length)return NextResponse.json({players:[]});
 const assignments=await ctx.db.from('institutional_pole_partner_assignments').select('structure_id,pole_player_id,partner_team_id').in('partner_team_id',teamIds).eq('active',true);
 if(assignments.error)throw Error(assignments.error.message);
 const valid=new Set((links.data||[]).map((l:any)=>`${l.structure_id}:${l.team_id}`));
 const permitted=(assignments.data||[]).filter((a:any)=>valid.has(`${a.structure_id}:${a.partner_team_id}`));
 const pids=[...new Set(permitted.map((a:any)=>a.pole_player_id))];
 const players=pids.length?await ctx.db.from('players').select('*').in('id',pids):{data:[],error:null};
 if(players.error)throw Error(players.error.message);
 // The roster uses the existing player UUID. Nothing is copied into another team.
 return NextResponse.json({players:(players.data||[]).map((p:any)=>({...p,metadata:{...p.metadata,additionalTeamIds:permitted.filter((a:any)=>a.pole_player_id===p.id).map((a:any)=>a.partner_team_id)}}))});
}catch{return NextResponse.json({error:'Chargement des polistes partenaires impossible'},{status:503});}}

export async function PATCH(req:Request){try{
 const ctx=await context();if(!ctx)return NextResponse.json({error:'Non connecté'},{status:401});
 const b=await req.json().catch(()=>({})),teamId=String(b.teamId||''),playerId=String(b.player?.supabasePlayerId||b.player?.id||'');
 if(ctx.permissions.get(teamId)!==true)return NextResponse.json({error:'Droits insuffisants'},{status:403});
 const links=await ctx.db.from('institutional_pole_teams').select('structure_id').eq('team_id',teamId).eq('team_kind','partner').eq('active',true);
 if(links.error)throw Error(links.error.message);
 const structures=(links.data||[]).map((l:any)=>l.structure_id);
 if(!structures.length)return NextResponse.json({error:'Équipe partenaire introuvable'},{status:404});
 const assignment=await ctx.db.from('institutional_pole_partner_assignments').select('id').in('structure_id',structures).eq('partner_team_id',teamId).eq('pole_player_id',playerId).eq('active',true).limit(1).maybeSingle();
 if(assignment.error||!assignment.data)return NextResponse.json({error:'Ce joueur n’est pas rattaché à cette équipe'},{status:403});
 const old=await ctx.db.from('players').select('*').eq('id',playerId).single();if(old.error)throw Error(old.error.message);
 const p=b.player;const text=(v:unknown)=>String(v??'').slice(0,2000);
 // Allow identity/sport fields only; ownership, team links and access metadata stay server-owned.
 const payload:Record<string,unknown>={updated_at:new Date().toISOString()};
 const textFields:Record<string,string[]>={first_name:['firstName'],last_name:['lastName'],position_primary:['postePrincipal'],position_secondary:['posteSecondaire'],height:['taille'],weight:['poids'],dominant_hand:['mainDominante'],status:['statut'],notes:['notes'],license_number:['licenceNumber','licenseNumber','license_number'],tutor1_phone:['tuteur1Phone','tutor1Phone','tutor1_phone'],tutor1_email:['tuteur1Email','tutor1Email','tutor1_email'],tutor2_phone:['tuteur2Phone','tutor2Phone','tutor2_phone'],tutor2_email:['tuteur2Email','tutor2Email','tutor2_email']};
 for(const [column,keys] of Object.entries(textFields)){const key=keys.find(k=>p[k]!==undefined);if(key)payload[column]=text(p[key]);}
 if('photo' in p)payload.photo_url=p.photo||null;
 if('num' in p)payload.number=p.num===null?null:Number(p.num);
 if('dob' in p){const raw=text(p.dob),french=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);const date=french?`${french[3]}-${french[2].padStart(2,'0')}-${french[1].padStart(2,'0')}`:raw;if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:'Date de naissance invalide'},{status:400});payload.birth_date=date||null;}
 const reserved=new Set(['id','metadata','player_id','playerId','user_id','userId','ownerUserId','team_id','teamId','primaryTeamId','additionalTeamIds']);
 const business=Object.fromEntries(Object.entries(p).filter(([key])=>!reserved.has(key)&&!/^institution|^supabase|^collaboration/i.test(key)));
 const metadata={...old.data.metadata,...business};
 payload.metadata=metadata;
 if(('first_name' in payload&&!payload.first_name)||('last_name' in payload&&!payload.last_name))return NextResponse.json({error:'Nom et prénom obligatoires'},{status:400});
 let query=ctx.db.from('players').update(payload).eq('id',playerId);
 query=old.data.updated_at?query.eq('updated_at',old.data.updated_at):query.is('updated_at',null);
 const saved=await query.select('*').single();if(saved.error||!saved.data)throw Error('La fiche a changé. Recharge puis réessaie.');
 if(metadata.institutionCentralPlayerId){
   const canonical:Record<string,unknown>={updated_at:payload.updated_at};
   const map:Record<string,string>={first_name:'first_name',last_name:'last_name',birth_date:'birthdate',photo_url:'photo_url',license_number:'license_number',position_primary:'position_primary',position_secondary:'position_secondary',dominant_hand:'dominant_hand',tutor1_phone:'tutor1_phone',tutor1_email:'tutor1_email',tutor2_phone:'tutor2_phone',tutor2_email:'tutor2_email'};
   for(const [source,target] of Object.entries(map))if(source in payload)canonical[target]=payload[source];
   const write=await ctx.db.from('institutional_players').update(canonical).eq('id',metadata.institutionCentralPlayerId).in('structure_id',structures).select('id').maybeSingle();
   if(write.error||!write.data){const rollback=Object.fromEntries(Object.keys(payload).map(key=>[key,old.data[key]??null]));await ctx.db.from('players').update(rollback).eq('id',playerId).eq('updated_at',payload.updated_at);throw Error('Actualisation de la fiche institution impossible. Réessaie.');}
 }
 return NextResponse.json({player:saved.data});
}catch{return NextResponse.json({error:'Enregistrement impossible'},{status:400});}}
