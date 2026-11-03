import {createHash,randomBytes} from 'node:crypto';
export function createPlayerTestToken(teamId:string){const token=`${teamId}.${randomBytes(32).toString('hex')}`;return{token,tokenHash:hashPlayerTestToken(token)}}
export const hashPlayerTestToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export function playerTestTokenTeam(token:string){return /^[0-9a-f-]{36}\.[0-9a-f]{64}$/i.test(token)?token.slice(0,36):null;}
export async function canManageTeamTests(db:any,team:any,userId:string){
 if(!userId)return false;if(team.user_id===userId)return true;
 const member=await db.from('team_members').select('permissions').eq('team_id',team.id).eq('user_id',userId).eq('status','active').maybeSingle();
 if(member.data?.permissions?.players===true&&member.data.permissions.read_only!==true)return true;
 const structureId=team.metadata?.institutionStructureId;
 if(structureId){const m=await db.from('institutional_members').select('role,permissions').eq('structure_id',structureId).eq('user_id',userId).eq('status','active').maybeSingle();if(m.data&&m.data.permissions?.read_only!==true&&(['owner','admin','performance'].includes(m.data.role)||m.data.permissions?.players===true))return true;}
 return false;
}
export function testPlayerActive(player:any,teamId:string){return player?.metadata?.institutionRosterArchived!==true&&!['archived','archivé'].includes(String(player?.status||player?.metadata?.statut||'').toLocaleLowerCase('fr'))&&(player?.team_id===teamId||(Array.isArray(player?.metadata?.additionalTeamIds)&&player.metadata.additionalTeamIds.includes(teamId)));}
