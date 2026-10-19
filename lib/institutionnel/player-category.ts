/** Age category is derived from the birth year in the institution's season. */
export function currentInstitutionSeason(now=new Date()) {const start=now.getFullYear()-(now.getMonth()<6?1:0);return `${start}-${start+1}`;}
export function playerAgeCategory(birthdate:unknown,seasonLabel?:string|null):string|null {
 const season=String(seasonLabel||currentInstitutionSeason()).match(/^(20\d{2})\s*[-/–—]\s*(20\d{2}|\d{2})$/);if(!season)return null;
 const start=Number(season[1]),end=season[2].length===2?Math.floor(start/100)*100+Number(season[2]):Number(season[2]);if(end!==start+1)return null;
 const raw=String(birthdate||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return null;const [year,month,day]=raw.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 const age=end-year;return age>=1&&age<=22?`U${age}`:null;
}
export function playerCategoryGroup(category:unknown){const value=String(category||'').toUpperCase();return value==='U12'||value==='U13'?'U13':value;}
export function categoryMatches(category:unknown,filter:string){return !filter || (filter==='group:u13'?playerCategoryGroup(category)==='U13':category===filter);}
export function withPlayerCategory<T extends {birthdate?:string|null;category?:string|null}>(player:T,season?:string|null){const category=playerAgeCategory(player.birthdate,season)||player.category||null;return {...player,category,category_group:playerCategoryGroup(category),category_season:season||currentInstitutionSeason()};}
export async function loadInstitutionSeason(db:any,structureId:string){const result=await db.from('institutional_structures').select('season_label').eq('id',structureId).maybeSingle();if(result.error)throw new Error(result.error.message);return result.data?.season_label||currentInstitutionSeason();}
