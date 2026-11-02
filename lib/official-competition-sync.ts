export type OfficialConnection={id:string;team_id:string;source_url:string;ffbb_team_name?:string|null;competition_kind?:string|null};
/** Refresh scores in their existing connection. Never recreate the team or replace coded match stats. */
export async function refreshOfficialConnection(db:any,teamId:string,connection:OfficialConnection,fetcher:typeof fetch=fetch){
 if(connection.team_id!==teamId)throw Error('Cette compétition n’est pas reliée à cette équipe.');
 const query=new URLSearchParams({url:connection.source_url});
 if(connection.ffbb_team_name)query.set('team',connection.ffbb_team_name);
 const response=await fetcher(`/api/ffbb/competition?${query}`,{cache:'no-store'});
 const parsed=await response.json();
 if(!response.ok)throw Error(parsed.error||'La source officielle est indisponible. Les résultats enregistrés sont conservés.');
 if(parsed.mode!=='team'||!Array.isArray(parsed.matches))throw Error('Choisis à nouveau le club officiel pour actualiser cette compétition.');
 const timestamp=new Date().toISOString();
 const matches=parsed.matches.filter((game:any)=>game.sourceKey&&/^\d{4}-\d{2}-\d{2}$/.test(game.date));
 if(!matches.length)throw Error('La source ne renvoie aucun match exploitable. Les résultats enregistrés sont conservés.');
 const normalized=matches.map((game:any)=>({connection_id:connection.id,team_id:teamId,source_match_key:String(game.sourceKey),round_label:game.round||null,match_date:game.date,start_time:game.time||null,home_away:game.homeAway,opponent:game.opponent,our_score:game.ourScore??null,opponent_score:game.opponentScore??null,competition_kind:connection.competition_kind||'championship',source_url:connection.source_url,last_synced_at:timestamp}));
 const write=await db.from('ffbb_synced_matches').upsert(normalized,{onConflict:'connection_id,source_match_key'});
 if(write.error)throw Error('Résultats reçus, mais enregistrement impossible. Réessaie.');
 const mark=await db.from('ffbb_team_connections').update({last_synced_at:timestamp}).eq('id',connection.id).eq('team_id',teamId);
 if(mark.error)throw Error('Scores enregistrés, mais date de synchronisation indisponible.');
 return {count:normalized.length,updatedAt:timestamp};
}
