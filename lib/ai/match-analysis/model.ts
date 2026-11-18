export const STAT_FIELDS = [
  ['pts','PTS'],['twoMade','2P réussis'],['twoAttempted','2P tentés'],['threeMade','3P réussis'],['threeAttempted','3P tentés'],
  ['ftMade','LF réussis'],['ftAttempted','LF tentés'],['offReb','REB OFF'],['defReb','REB DÉF'],['reb','REB'],['assists','PD'],['steals','INT'],['blocks','CTR'],['turnovers','BP'],['fouls','Fautes'],
] as const;
export type StatKey=typeof STAT_FIELDS[number][0];
export type Stats=Record<StatKey,number|null>;
export type StatsTeam={name:string;totals:Stats;players:Array<{name:string;stats:Stats}>};
export type MatchSheet={teams:StatsTeam[];warnings:string[]};
export type Evidence={id:string;label:string;value:number;unit:string;formula?:string};
export type Finding={text:string;evidence:string[]};
export type MatchReport={constats:Finding[];hypotheses:Finding[];priorites:Finding[]};
export function blankStats():Stats{return Object.fromEntries(STAT_FIELDS.map(([key])=>[key,null])) as Stats}
export function normalizeStats(raw:unknown):Stats{
 const values=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
 return Object.fromEntries(STAT_FIELDS.map(([key])=>{const v=values[key],n=Number(v);return[key,v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isInteger(n)||n<0||n>2000?null:n]})) as Stats;
}
export function normalizeSheet(raw:unknown):MatchSheet{
 const input=raw as {teams?:Array<{name?:unknown;totals?:unknown;players?:Array<{name?:unknown;stats?:unknown}>}>;warnings?:unknown[]};
 return{teams:(Array.isArray(input?.teams)?input.teams:[]).slice(0,4).map((team,index)=>({name:String(team?.name||`Équipe ${index+1}`).slice(0,100),totals:normalizeStats(team?.totals),players:(Array.isArray(team?.players)?team.players:[]).slice(0,25).map(p=>({name:String(p?.name||'Joueur').slice(0,100),stats:normalizeStats(p?.stats)}))})),warnings:(Array.isArray(input?.warnings)?input.warnings:[]).map(w=>String(w).slice(0,300)).slice(0,12)};
}
export function sheetIssues(team:StatsTeam):{errors:string[];warnings:string[]}{
 const s=team.totals,errors:string[]=[],warnings:string[]=[];
 for(const [made,attempt,label]of [['twoMade','twoAttempted','2P'],['threeMade','threeAttempted','3P'],['ftMade','ftAttempted','LF']] as const){if(s[made]!==null&&s[attempt]!==null&&s[made]!>s[attempt]!)errors.push(`${team.name} : les ${label} réussis dépassent les tentés.`)}
 if(s.pts!==null&&s.twoMade!==null&&s.threeMade!==null&&s.ftMade!==null&&s.pts!==s.twoMade*2+s.threeMade*3+s.ftMade)warnings.push(`${team.name} : les points ne correspondent pas aux paniers et LF saisis.`);
 if(s.reb!==null&&s.offReb!==null&&s.defReb!==null&&s.reb!==s.offReb+s.defReb)warnings.push(`${team.name} : le total des rebonds diffère de REB OFF + REB DÉF.`);
 for(const player of team.players){const issues=sheetIssues({...team,name:`${team.name} · ${player.name}`,totals:player.stats,players:[]});errors.push(...issues.errors);warnings.push(...issues.warnings)}
 return{errors,warnings};
}
export function matchEvidence(sheet:MatchSheet,ownIndex:number):Evidence[]{
 const evidence:Evidence[]=[];
 sheet.teams.forEach((team,index)=>{
  const prefix=`t${index}`,s=team.totals;
  for(const[key,label]of STAT_FIELDS)if(s[key]!==null)evidence.push({id:`${prefix}.${key}`,label:`${team.name} · ${label}`,value:s[key]!,unit:''});
  const add=(key:string,label:string,value:number|null,unit='%',formula?:string)=>{if(value!==null&&Number.isFinite(value))evidence.push({id:`${prefix}.${key}`,label:`${team.name} · ${label}`,value:Math.round(value*10)/10,unit,formula})};
  const percent=(made:number|null,attempt:number|null)=>made!==null&&attempt!==null&&attempt>0?100*made/attempt:null;
  add('twoPct','Réussite à 2P',percent(s.twoMade,s.twoAttempted));add('threePct','Réussite à 3P',percent(s.threeMade,s.threeAttempted));add('ftPct','Réussite aux LF',percent(s.ftMade,s.ftAttempted));
  const fga=s.twoAttempted!==null&&s.threeAttempted!==null?s.twoAttempted+s.threeAttempted:null;
  if(fga!==null&&fga>0){
   add('threeShare','Part des tirs à 3P',s.threeAttempted!==null?100*s.threeAttempted/fga:null);
   add('efg','eFG%',s.twoMade!==null&&s.threeMade!==null?100*(s.twoMade+1.5*s.threeMade)/fga:null,'%','(2P réussis + 1,5 × 3P réussis) / tirs tentés');
   add('ftRate','LF tentés / tir tenté',s.ftAttempted!==null?s.ftAttempted/fga:null,'','LF tentés / tirs tentés');
  }
  const possessions=fga!==null&&s.ftAttempted!==null&&s.offReb!==null&&s.turnovers!==null?fga+.44*s.ftAttempted-s.offReb+s.turnovers:null;
  if(possessions!==null&&possessions>0){add('estimatedPossessions','Possessions estimées',possessions,'','Tirs tentés + 0,44 × LF tentés − REB OFF + BP');add('estimatedTovPct','BP / possessions estimées',s.turnovers!==null?s.turnovers/possessions*100:null);add('estimatedOrtg','Points / 100 possessions estimées',s.pts!==null?s.pts/possessions*100:null,'','Points / possessions estimées × 100')}
  const opponent=sheet.teams.length===2?sheet.teams[1-index].totals:null;
  if(opponent?.defReb!==null&&opponent?.defReb!==undefined&&s.offReb!==null&&s.offReb+opponent.defReb>0)add('orbPct','Rebonds offensifs disponibles captés',100*s.offReb/(s.offReb+opponent.defReb));
  team.players.forEach((player,j)=>{for(const[key,label]of STAT_FIELDS)if(player.stats[key]!==null)evidence.push({id:`${prefix}.p${j}.${key}`,label:`${team.name} · ${player.name} · ${label}`,value:player.stats[key]!,unit:''})});
 });
 if(sheet.teams.length===2&&sheet.teams[ownIndex]?.totals.pts!==null&&sheet.teams[1-ownIndex]?.totals.pts!==null)evidence.push({id:'score.margin',label:'Écart au score de l’équipe analysée',value:sheet.teams[ownIndex].totals.pts!-sheet.teams[1-ownIndex].totals.pts!,unit:'pts'});
 return evidence;
}
/** Every claim must reference an actual supplied number; prose does not introduce new numbers. */
export function normalizeReport(raw:unknown,evidence:Evidence[]):MatchReport{
 const allowed=new Set(evidence.map(e=>e.id)),input=raw as Record<string,unknown>;
 const section=(name:string):Finding[]=>(Array.isArray(input?.[name])?input[name]:[]).slice(0,5).flatMap((row:unknown)=>{
  const r=row as {text?:unknown;evidence?:unknown};const text=typeof r?.text==='string'?r.text.trim().slice(0,900):'',ids=Array.isArray(r?.evidence)?[...new Set(r.evidence.filter((id):id is string=>typeof id==='string'&&allowed.has(id)))].slice(0,5):[];
  return text&&!/\d/.test(text)&&ids.length?[{text,evidence:ids}]:[];
 });
 return{constats:section('constats'),hypotheses:section('hypotheses'),priorites:section('priorites')};
}
