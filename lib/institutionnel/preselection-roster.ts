/** Propagate decisions only inside the day's explicitly linked preselection. */
export async function syncPreselectionDecision(db:any,structureId:string,eventId:string,playerId:string,userId:string){
 const check=(result:any)=>{if(result.error)throw new Error(result.error.message);return result.data;};
 const link=check(await db.from('institutional_events').select('id,selection_id,event_date').eq('id',eventId).eq('structure_id',structureId).eq('archived',false).maybeSingle());
 if(!link?.selection_id)return;
 const selection=check(await db.from('institutional_selections').select('id,team_id').eq('id',link.selection_id).eq('structure_id',structureId).neq('status','archived').maybeSingle());if(!selection)return;
 const team=check(await db.from('teams').select('metadata').eq('id',selection.team_id).maybeSingle());if(!team)return;
 const isPreselection=team.metadata?.institutionRosterKind==='preselection';let membershipIds=[selection.id],relatedIds=[selection.id];
 // Older gatherings may be linked directly to the final target. Its roster is never removed here.
 if(!isPreselection){const groups=check(await db.from('institutional_selections').select('id,team_id').eq('structure_id',structureId).neq('status','archived'))||[],teamIds=groups.map((group:any)=>group.team_id).filter(Boolean);const teams=teamIds.length?check(await db.from('teams').select('id,metadata').in('id',teamIds))||[]:[];const matchingTeams=new Set(teams.filter((row:any)=>row.metadata?.institutionRosterKind==='preselection'&&row.metadata?.institutionPreparationTargetId===selection.id).map((row:any)=>row.id));membershipIds=groups.filter((group:any)=>matchingTeams.has(group.team_id)).map((group:any)=>group.id);relatedIds=[selection.id,...membershipIds];}

 const player=check(await db.from('institutional_players').select('id,profile_data,archived').eq('id',playerId).eq('structure_id',structureId).maybeSingle());if(!player||player.archived)return;
 const days:any[]=[];
 for(let start=0;;start+=1000){let query=db.from('institutional_events').select('id,event_date,start_time').eq('structure_id',structureId);query=isPreselection?query.eq('selection_id',selection.id):query.in('selection_id',relatedIds);const rows=check(await query.eq('archived',false).order('event_date').order('id').range(start,start+999))||[];days.push(...rows);if(rows.length<1000)break;}
 const decisions=player.profile_data?.detectionDecisions||{},attendance=player.profile_data?.detectionAttendance||{};
 const ordered=days.sort((a,b)=>`${a.event_date} ${a.start_time||''} ${a.id}`.localeCompare(`${b.event_date} ${b.start_time||''} ${b.id}`));
 const decided=ordered.filter(day=>['selected','not_selected'].includes(decisions[day.id]));
 const latest=decided.at(-1);
 if(!latest){if(!isPreselection)return;const member=check(await db.from('institutional_selection_players').select('id').eq('selection_id',selection.id).eq('player_id',playerId).eq('status','active').maybeSingle());if(!member)return;}
 for(const selectionId of membershipIds){if(latest&&decisions[latest.id]==='selected')check(await db.from('institutional_selection_players').upsert({selection_id:selectionId,player_id:playerId,team_player_id:null,status:'active',created_by:userId},{onConflict:'selection_id,player_id',ignoreDuplicates:true}));else if(latest)check(await db.from('institutional_selection_players').delete().eq('selection_id',selectionId).eq('player_id',playerId));}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 for(const day of ordered){
  if(day.event_date<=link.event_date||day.event_date<today||attendance[day.id]||decisions[day.id]!==undefined)continue;
  const prior=decided.filter(item=>item.event_date<day.event_date).at(-1);if(!prior&&latest)continue;
  // Only detection/training days have these participant joins. Never alter another calendar module.
  const detection=check(await db.from('institutional_detection_events').select('id').eq('id',day.id).eq('structure_id',structureId).eq('archived',false).maybeSingle());if(!detection)continue;
  if(!prior||decisions[prior.id]==='selected')check(await db.from('institutional_detection_participants').upsert({event_id:day.id,player_id:playerId,status:'invited'},{onConflict:'event_id,player_id',ignoreDuplicates:true}));
  else check(await db.from('institutional_detection_participants').delete().eq('event_id',day.id).eq('player_id',playerId).eq('status','invited'));
 }
}
