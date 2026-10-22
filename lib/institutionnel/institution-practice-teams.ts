export async function loadInstitutionPracticeTeams(request:typeof fetch=fetch){
 const response=await request('/api/institutionnel/access',{cache:'no-store'}),access=await response.json();
 if(!response.ok){if(response.status===401)return[];throw Error(access.error||'Institutions indisponibles.');}
 const teams:any[]=[];
 for(const structure of access.structures||[]){const result=await request(`/api/institutionnel/sport/selections?structureId=${encodeURIComponent(structure.id)}`,{cache:'no-store'}),body=await result.json();if(!result.ok)throw Error(body.error||'Sélections indisponibles.');
  for(const selection of body.selections||[]){if(!selection.team_id)continue;teams.push({id:String(selection.team_id),name:String(selection.name||'Sélection'),category:String(selection.category||''),institutionId:String(structure.id),institutionName:String(structure.name||''),selectionId:String(selection.id),players:(selection.players||[]).filter((entry:any)=>entry.team_player_id&&entry.player).map((entry:any)=>({id:String(entry.team_player_id),firstName:String(entry.player.first_name||''),lastName:String(entry.player.last_name||''),position:String(entry.player.position_primary||'')}))});}
 }
 return teams;
}
