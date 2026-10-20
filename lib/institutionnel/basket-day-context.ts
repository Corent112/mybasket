export type BasketDayIds={structureId:string;selectionId:string;eventId:string};
export const BASKET_DAY_KEY='mybasket:institution-basket-day';
export function basketDayIds(value:any):BasketDayIds|null {
 if(!value||!['structureId','selectionId','eventId'].every(key=>typeof value[key]==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value[key])))return null;
 return{structureId:value.structureId,selectionId:value.selectionId,eventId:value.eventId};
}
export async function loadBasketDay(ids:BasketDayIds,request:typeof fetch=fetch){
 const [selectionResponse,dayResponse]=await Promise.all([request(`/api/institutionnel/sport/selections?structureId=${encodeURIComponent(ids.structureId)}`,{cache:'no-store'}),request(`/api/institutionnel/detection-days?structureId=${encodeURIComponent(ids.structureId)}&eventId=${encodeURIComponent(ids.eventId)}`,{cache:'no-store'})]);
 const selections=await selectionResponse.json(),dayResult=await dayResponse.json();
 if(!selectionResponse.ok||!dayResponse.ok)throw Error(selections.error||dayResult.error||'Journée indisponible');
 const selected=selections.selections?.find((s:any)=>s.id===ids.selectionId&&s.roster_kind!=='preselection'),day=dayResult.event,calendar=dayResult.calendar;
 const group=selections.selections?.find((s:any)=>s.id===calendar?.selection_id);
 if(!selected||!day||day.id!==ids.eventId||!calendar||(calendar.selection_id!==selected.id&&group?.preparation_target_id!==selected.id))throw Error('Cette journée ne prépare pas la sélection choisie.');
 return{...ids,title:day.title as string,date:day.event_date as string,startTime:(day.start_time||'').slice(0,5),endTime:(calendar.end_time||'').slice(0,5),location:(day.location||'') as string,team:{id:String(selected.team_id),name:String(selected.name),category:String(selected.category||''),institutionId:ids.structureId,selectionId:ids.selectionId,players:(selected.players||[]).filter((p:any)=>p.team_player_id&&p.player).map((p:any)=>({id:String(p.team_player_id),firstName:String(p.player.first_name||''),lastName:String(p.player.last_name||''),position:String(p.player.position_primary||'')}))}};
}
export type BasketDayContext=Awaited<ReturnType<typeof loadBasketDay>>;
