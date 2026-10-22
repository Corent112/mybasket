export function isEarlierPreparationDay(source:{id:string;event_date:string;start_time?:string|null},target:{id:string;event_date:string;start_time?:string|null}){
 if(source.id===target.id)return false;
 if(source.event_date!==target.event_date)return source.event_date<target.event_date;
 return !!source.start_time&&!!target.start_time&&source.start_time.slice(0,5)<target.start_time.slice(0,5);
}
export function retainedDayPlayers(participants:any[],players:any[],eventId:string){
 const roster=new Map(players.filter(p=>!p.archived).map(p=>[String(p.id),p]));
 return [...new Set<string>(participants.filter(part=>{const player=roster.get(String(part.player_id));return player&&(player.profile_data?.detectionDecisions?.[eventId]??part.status)==='selected';}).map(part=>String(part.player_id)))].map(id=>roster.get(id)!);
}
