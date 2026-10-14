const fs = require('fs'), vm = require('vm'), ts = require('typescript'), assert = require('node:assert/strict');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const route = fs.readFileSync('app/api/ffbb/competition/route.ts', 'utf8');
const ast = ts.createSourceFile('route.ts', route, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && ['fetchTeamFromFfbbApi','apiNumber','apiDate','apiTime','teamNameMatches','norm','text'].includes(n.name?.text)).map(n => n.getText(ast)).join('\n');
async function apiSummary({ totalFor = '225', totalAgainst = '154', played = '3', partial = true } = {}) {
  const paths = [];
  const test = { exports: {}, URL, URLSearchParams, ffbbApiToken: async () => 'test', ffbbApiGet: async path => {
    paths.push(path);
    if (path.includes('engagements')) return { data: { id:'our-team', nom:'Notre équipe', idPoule:{id:'pool'}, idCompetition:{nom:'Championnat'} } };
    return { data: { nom:'A', rencontres: [
      {id:'g1',numero:'1',joue:true,resultatEquipe1:'70',resultatEquipe2:'60',idEngagementEquipe1:{id:'our-team'},idEngagementEquipe2:{id:'opponent'},date_rencontre:'2026-10-01T20:00:00'},
      ...(!partial ? [
        {id:'g2',joue:true,resultatEquipe1:'80',resultatEquipe2:'50',idEngagementEquipe1:{id:'our-team'},idEngagementEquipe2:{id:'opponent'}},
        {id:'g3',joue:true,resultatEquipe1:'75',resultatEquipe2:'44',idEngagementEquipe1:{id:'our-team'},idEngagementEquipe2:{id:'opponent'}}
      ] : []),
      {id:'future',joue:false,resultatEquipe1:'0',resultatEquipe2:'0',idEngagementEquipe1:{id:'opponent'},idEngagementEquipe2:{id:'our-team'}},
      {id:'other',joue:true,resultatEquipe1:'99',resultatEquipe2:'98',idEngagementEquipe1:{id:'x'},idEngagementEquipe2:{id:'y'}}
    ], classements:[{ idEngagement:{id:'our-team'},matchJoues:played,gagnes:'3',perdus:'0',position:'1',paniersMarques:totalFor,paniersEncaisses:totalAgainst }] } };
  } };
  vm.createContext(test); vm.runInContext(compile(functions+'\nexports.load=fetchTeamFromFfbbApi;'), test);
  const result = await test.exports.load('https://competitions.ffbb.com/ligues/idf/comites/0078/clubs/buc/equipes/123', '');
  assert(paths.some(path => path.includes('classements.paniersMarques') && path.includes('classements.paniersEncaisses')));
  assert.equal(result.matches.some(m => m.sourceKey === 'other'), false);
  assert.equal(result.matches.find(m => m.sourceKey === 'future').ourScore, null);
  return result;
}
async function bannerSummary(officialStats, cacheError = false, browserRecovery = false) {
  const path='app/equipes/[teamId]/page.tsx', source=fs.readFileSync(path,'utf8');
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const names=['useFfbbBannerSummary','normalizeFfbbText','extractFfbbRanking','ffbbScore','ffbbCompetitionKind','formatFfbbNextMatch'];
  const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
  let state, requests=[];
  const test={exports:{},console:{error(){}},useMemo:fn=>fn(),useState:initial=>{state=initial;return [state,v=>state=typeof v==='function'?v(state):v]},useEffect:fn=>{fn()},createClient:()=>({from(table){const result=table==='ffbb_team_connections'?{data:[{id:'connection',source_url:'https://competitions.ffbb.com/ligues/test',is_primary:true,ffbb_team_name:'Notre équipe'}]}:{data:cacheError?null:[{our_score:70,opponent_score:60,match_date:'2026-10-01',competition_kind:'championship'}],error:cacheError?new Error('cache unavailable'):null};const chain={select(){return chain},eq(){return chain},in(){return chain},order(){return chain},then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};return chain}}),AbortSignal,fetch:async(url,options)=>{requests.push({url,options});if(url==='https://api.ffbb.com/items/configuration')return {ok:true,json:async()=>({data:{key_dh:'public-test-token'}})};if(browserRecovery&&!options?.headers?.['x-ffbb-public-token'])return {ok:true,json:async()=>({teamStats:null,warning:'FFBB API configuration 403'})};return {ok:true,json:async()=>({ranking:1,teamStats:officialStats,matches:[]})}}};
  vm.createContext(test);vm.runInContext(compile(code+'\nexports.load=useFfbbBannerSummary;'),test);test.exports.load('team');
  for(let n=0;n<20&&state.loading;n++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.loading,false);if(browserRecovery){assert.equal(requests.length,3);assert.equal(requests[1].url,'https://api.ffbb.com/items/configuration');assert.equal(requests[2].options.headers['x-ffbb-public-token'],'public-test-token');assert.equal(requests.some(r=>r.url.includes('public-test-token')),false);}return state;
}
(async()=>{
  const official=(await apiSummary()).teamStats;
  assert.equal(official.pointsFor,225);assert.equal(official.pointsAgainst,154);assert.equal(official.played,3);
  const partial=(await apiSummary({totalFor:null,totalAgainst:null})).teamStats;
  assert.equal(partial.pointsFor,null);assert.equal(partial.pointsAgainst,null);
  const complete=(await apiSummary({totalFor:null,totalAgainst:null,partial:false})).teamStats;
  assert.equal(complete.pointsFor,225);assert.equal(complete.pointsAgainst,154);
  const banner=await bannerSummary(official,true);
  assert.equal(banner.connected,true);assert.equal(banner.pointsForAverage,75);assert.equal(banner.pointsAgainstAverage,154/3);
  const recovered=await bannerSummary(official,true,true);assert.equal(recovered.pointsForAverage,75);
  const retained=await bannerSummary(partial);
  assert.equal(retained.pointsForAverage,70);assert.equal(retained.pointsAgainstAverage,60);
  console.log('FFBB: official totals, partial calendars, unplayed games, team isolation, cache failures and preserved averages passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
