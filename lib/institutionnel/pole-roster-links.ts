/** Reads the current one-player roster model. Callers must still authorize the returned team/structure. */
export async function resolveCanonicalPoleRoster(db:any,input:{rosterPlayerId?:string;canonicalPlayerId?:string;structureId?:string}) {
 let query=db.from('players').select('id,team_id,metadata');
 if(input.rosterPlayerId)query=query.eq('id',input.rosterPlayerId);
 else if(input.canonicalPlayerId)query=query.eq('metadata->>institutionCentralPlayerId',input.canonicalPlayerId);
 else return null;
 const players=await query.limit(20);if(players.error)throw Error(players.error.message);
 for(const player of players.data||[]){
  const canonicalId=player.metadata?.institutionCentralPlayerId;if(!canonicalId)continue;
  let q=db.from('institutional_pole_teams').select('structure_id,team_id').eq('team_id',player.team_id).eq('team_kind','pole').eq('active',true);
  if(input.structureId)q=q.eq('structure_id',input.structureId);
  const pole=await q.maybeSingle();if(pole.error)throw Error(pole.error.message);if(!pole.data)continue;
  const structureId=pole.data.structure_id;
  const canonical=await db.from('institutional_players').select('id').eq('id',canonicalId).eq('structure_id',structureId).eq('archived',false).maybeSingle();
  if(canonical.error)throw Error(canonical.error.message);if(!canonical.data)continue;
  const assignments=await db.from('institutional_pole_partner_assignments').select('partner_team_id').eq('structure_id',structureId).eq('pole_player_id',player.id).eq('active',true);
  if(assignments.error)throw Error(assignments.error.message);
  const ids=[...new Set((assignments.data||[]).map((a:any)=>a.partner_team_id))];
  const partners=ids.length?await db.from('institutional_pole_teams').select('team_id').eq('structure_id',structureId).eq('team_kind','partner').eq('active',true).in('team_id',ids):{data:[],error:null};
  if(partners.error)throw Error(partners.error.message);
  const sources=[{kind:'pole' as const,teamId:player.team_id,playerId:player.id,seasonId:null},...(partners.data||[]).map((p:any)=>({kind:'club' as const,teamId:p.team_id,playerId:player.id,seasonId:null}))];
  return {structure_id:structureId,institutional_player_id:canonicalId,pole_team_id:player.team_id,pole_player_id:player.id,season_id:null,sources};
 }
 return null;
}
