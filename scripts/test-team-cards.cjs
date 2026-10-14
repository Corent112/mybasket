const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const seasonCtx={exports:{},URL};vm.runInNewContext(compile(fs.readFileSync('lib/team-season.ts','utf8')),seasonCtx);
const {competitionSeason,currentBasketballSeason,linkedCompetitionSeason}=seasonCtx.exports;
assert.equal(competitionSeason([{date:'2026-09-12'},{date:'2027-05-30'}]),'2026-2027');
assert.equal(competitionSeason([{date:'2024-10-12'},{date:'2025-05-30'}]),'2024-2025');
assert.equal(competitionSeason([{date:'2025-05-30'},{date:'2026-09-12'}]),undefined);
assert.equal(competitionSeason([{date:'2026-02-30'}]),undefined);
assert.equal(currentBasketballSeason(new Date('2026-10-14T12:00:00Z')),'2026-2027');
assert.equal(currentBasketballSeason(new Date('2026-01-14T12:00:00Z')),'2025-2026');
assert.equal(linkedCompetitionSeason({},'https://lnb.fr/fr/calendar?yid=2024'),'2024-2025');
const source=fs.readFileSync('app/mon-compte/page.tsx','utf8'),ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let reload;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='reloadTeams')reload=node.initializer.getText(ast);ts.forEachChild(node,visit)}visit(ast);assert(reload);
async function check({hasPlayed=true, zero=false, cacheError=false}={}) {
 const teams=[{id:'u18',name:'U18',competitionSource:'ffbb',season:'2025-2026'},{id:'u21',name:'U21',competitionSource:'lnb',season:'2025-2026'}];
 const connections=[{id:'wrong',team_id:'u18',source_url:'https://lnb.fr/fr/calendar?yid=2025',is_primary:true},{id:'own',team_id:'u18',source_url:'https://competitions.ffbb.com/ligues/idf/equipes/18',competition_kind:'championship',ffbb_team_name:'U18 Club'},{id:'lnb',team_id:'u21',source_url:'https://lnb.fr/fr/calendar?yid=2026',competition_kind:'championship'}];
 const state={},reads=[],errors=[];
 const payload={teamStats:{played:zero?0:3,wins:zero?0:2,losses:zero?0:1,pointsFor:zero?0:138,pointsAgainst:zero?0:121},matches:hasPlayed?[{date:'2026-09-30',ourScore:70,opponentScore:60}]:[{date:'2026-10-30',ourScore:null,opponentScore:null}]};
 const ctx={exports:{},...seasonCtx.exports,console:{error:(...args)=>errors.push(args)},getTeams:async()=>teams,setTeams:v=>state.teams=v,setTeamCalendarMatchCounts:v=>state.counts=v,setFfbbConnectedTeamIds:v=>state.connected=v,setTeamFfbbStandings:v=>state.summaries=v,require:()=>({fetchTeamFromFfbbApi:async(url,name)=>{reads.push({url,name});return payload}}),fetch:async url=>{reads.push({url});return {ok:true,json:async()=>({teamStats:{played:5,wins:4,losses:1,pointsFor:400,pointsAgainst:350}})}},supabase:{auth:{getUser:async()=>({data:{user:{id:'coach'}}})},from(table){const result=table==='match_stats'?{error:cacheError?new Error('local cache unavailable'):null,data:cacheError?[]:Array.from({length:4},(_,i)=>({team_id:'u18',id:`local-${i}`}))}:{data:connections};const chain={select(){return chain},in(){return chain},then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};return chain}}};
 vm.createContext(ctx);vm.runInContext(compile('const reload='+reload+';exports.reload=reload;'),ctx);await ctx.exports.reload();
 assert.equal(errors.length,cacheError?1:0);assert.equal(state.counts.u18||0,cacheError?0:4);
 assert.equal(state.summaries.u18.games,zero?0:3);assert.equal(state.summaries.u18.wins,zero?0:2);
 assert.equal(state.summaries.u18.seasonLabel,'2026-2027');assert.equal(state.summaries.u21.seasonLabel,'2026-2027');
 assert.equal(state.summaries.u18.pointsForAverage,zero?null:46);assert.equal(state.summaries.u18.pointsAgainstAverage,zero?null:121/3);
 assert.equal(state.summaries.u21.games,5);const direct=reads.find(read=>read.name==='U18 Club');assert(direct);assert(direct.url.startsWith('https://competitions.ffbb.com/'));
 assert.equal(teams[0].season,'2025-2026'); // Display correction never rewrites historical metadata on load.
}
Promise.all([check(),check({hasPlayed:false}),check({zero:true}),check({cacheError:true})]).then(()=>console.log('Team cards: official totals over partial/local results, FFBB/LNB isolation, zero games, correct linked seasons, historical seasons and read-only loading passed.')).catch(error=>{console.error(error);process.exitCode=1});
