export type PlayerClubSeason = {id:string;season:string;club:string;category:string;level:string};
export function normalizeClubHistory(value:unknown):PlayerClubSeason[]{
 if(!Array.isArray(value))return [];
 return value.filter(row=>row&&typeof row==='object').map((row,index)=>({id:String(row.id||`history-${index}`),season:String(row.season||'').slice(0,20),club:String(row.club||'').slice(0,120),category:String(row.category||'').slice(0,40),level:String(row.level||'').slice(0,80)}));
}
