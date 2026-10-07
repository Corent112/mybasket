const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
const path=require('node:path');
for(const ext of ['.ts','.tsx']) require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const data=require('../lib/player-match-stats.ts');
const matches=[
 {id:'l1',team_id:'team',opponent:'Nanterre',match_date:'2026-10-01',match_category:'championship',project_status:'completed',us_score:70,them_score:60},
 {id:'l2',team_id:'team',opponent:'Monaco',match_date:'2026-10-02',project_state:{matchType:'league'},project_status:'completed',us_score:80,them_score:75},
 {id:'f',team_id:'team',opponent:'Amical',match_date:'2026-10-03',match_category:'friendly',project_status:'completed'},
 {id:'c',team_id:'team',opponent:'Coupe',match_date:'2026-10-04',match_category:'cup',project_status:'completed'},
 {id:'u',team_id:'team',opponent:'Ancien',match_date:'2026-10-05',project_status:'completed'},
 {id:'d',team_id:'team',opponent:'Brouillon',match_date:'2026-10-06',match_category:'championship',project_status:'draft'},
];
const row=(match_id,player_id,pts,present=true)=>({team_id:'team',match_id,player_id,pts,present,p2m:pts===10?2:0,p2a:pts===10?4:0,p3m:0,p3a:0,ftm:pts===10?6:0,fta:pts===10?8:0,reb:2,off_reb:1,def_reb:1,ast:1,minutes_seconds:90});
const rows=[row('l1','p1',10),row('l2','p1',0),row('f','p1',20),row('c','p1',0),row('u','p1',6),row('d','p1',100),row('orphan','p1',500),row('l1','p2',8),row('l2','p2',30,false),row('f','p2',50,false)];
const byId=new Map(matches.map(match=>[match.id,match]));
function mockClient(tables,cap=1000){return {from:table=>{
 let filters=[];let ids=null;let idKey='id';let range=[0,1e9];let orders=[];
 const q={select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q},in:(key,values)=>{ids=values;idKey=key;return q},order:key=>{orders.push(key);return q},range:(start,end)=>{range=[start,end];return q},then:resolve=>{
  let result=(tables[table]||[]).filter(item=>filters.every(([key,value])=>item[key]===value) && (!ids || ids.includes(item[idKey])));
  result.sort((a,b)=>{for(const key of orders){const n=String(a[key]).localeCompare(String(b[key]));if(n)return n}return 0});
  result=result.slice(range[0],Math.min(range[1]+1,range[0]+cap));return Promise.resolve(resolve({data:result,error:null}));
 }};return q;
}}}
(async()=>{
 const league=data.completedPlayerMatchRows(rows,byId,'championship');
 let sums=data.summarizePlayerMatchRows(league);
 assert.equal(sums.p1.games,2,'A zero-action played match counts');assert.equal(sums.p1.pts/2,5);
 assert.equal(sums.p2.games,1,'An absent player must not divide by team match count');assert.equal(sums.p2.pts,8);
 assert.equal(data.completedPlayerMatchRows(rows,byId,'all').length,8,'Draft and orphan references excluded');
 assert.equal(data.summarizePlayerMatchRows(data.completedPlayerMatchRows(rows,byId,'all')).p1.games,5);
 assert.equal(data.playerMatchCategoryOf(matches[1]),'championship');assert.equal(data.playerMatchCategoryOf(matches[4]),'unknown');
 assert.equal(data.summarizePlayerMatchRows([...league,league[0]]).p1.pts,10,'Repeated source references cannot double totals');
 const manyRows=Array.from({length:1607},(_,i)=>row(`m${String(i%600).padStart(4,'0')}`,`p${String(i).padStart(4,'0')}`,i));
 const manyMatches=Array.from({length:600},(_,i)=>({id:`m${String(i).padStart(4,'0')}`,team_id:'team'}));
 const loaded=await data.loadPlayerMatchStats(mockClient({match_player_stats:manyRows,match_stats:manyMatches},37),'team');assert.equal(loaded.rows.length,1607);assert.equal(loaded.matchesById.size,600);
 await assert.rejects(data.loadPlayerMatchStats({from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:()=>q,then:resolve=>Promise.resolve(resolve({error:{message:'denied'}}))};return q}},'team'),/denied/);
 const {JSDOM}=require(process.env.JSDOM_MODULE_PATH || 'jsdom');
 const dom=new JSDOM('<div id="management"></div><div id="player"></div>',{url:'https://mybasket.test'});
 for(const key of ['window','document','HTMLElement','Event','MouseEvent']) global[key]=dom.window[key];global.localStorage=window.localStorage;global.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react');const {act}=React;const {createRoot}=require('react-dom/client');
 const source=ts.createSourceFile('player.tsx',fs.readFileSync('app/equipes/[teamId]/[playerId]/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const wanted=new Set(['PlayerMatchStatsTable','computeLiveStats','statNumber','roundStat','percentStat','statMinutes','liveMatchDateLabel','fmtDate','EMPTY_LIVE_TOTALS','EMPTY_LIVE_AVERAGES','EMPTY_LIVE_STATS']);const parts=[];
 function visit(node){if(ts.isFunctionDeclaration(node)&&wanted.has(node.name?.text))parts.push(node.getText(source));if(ts.isVariableDeclaration(node)&&wanted.has(node.name.getText(source)))parts.push(`const ${node.getText(source)};`);ts.forEachChild(node,visit)}visit(source);assert.equal(parts.length,wanted.size);
 const compiled=ts.transpileModule(`const {useState,useMemo}=React;${parts.join('\n')}return {PlayerMatchStatsTable,computeLiveStats};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const {PlayerMatchStatsTable,computeLiveStats}=new Function('React','playerMatchCategoryOf','require','exports',compiled)(React,data.playerMatchCategoryOf,require,{});
 const individual=computeLiveStats(data.completedPlayerMatchRows(rows,byId).filter(row=>row.player_id==='p1'),byId);
 assert.equal(individual.matches[0].minutes,1.5,'Stored seconds normalized for the per-match table');
 const client=mockClient({teams:[{id:'team',name:'U18'}],players:[{id:'p1',team_id:'team',first_name:'Alex',last_name:'ONDZE'},{id:'p2',team_id:'team',first_name:'Jaylan',last_name:'PORTER'}],match_player_stats:rows,match_stats:matches});
 const originalLoad=Module._load;Module._load=function(request,parent,isMain){if(request==='@/lib/supabase/client')return {createClient:()=>client};if(request==='@/lib/player-match-stats')return data;return originalLoad.call(this,request,parent,isMain)};
 const Management=require('../components/management/StatsJoueursModule.tsx').default;
 const m=createRoot(document.getElementById('management'));const p=createRoot(document.getElementById('player'));
 const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20))})};
 const click=async target=>{await act(async()=>target.dispatchEvent(new MouseEvent('click',{bubbles:true})));await flush()};
 const change=async(target,value)=>{await act(async()=>{target.value=value;target.dispatchEvent(new Event('change',{bubbles:true}))});await flush()};
 await act(async()=>{m.render(React.createElement(Management));p.render(React.createElement(PlayerMatchStatsTable,{matches:individual.matches}))});await flush();await flush();
 await click([...document.querySelectorAll('#management button')].find(button=>button.textContent.trim()==='Moyenne'));
 await change(document.querySelector('#management [aria-label="Type de matchs des statistiques joueurs"]'),'championship');
 const mr=document.querySelectorAll('#management tbody tr');assert.equal(mr[0].children[1].textContent,'2');assert.equal(mr[0].children[2].textContent,'1-2','Shots shown as per-game averages');assert.equal(mr[0].children[16].textContent,'5');assert.equal(mr[1].children[1].textContent,'1');assert.equal(mr[1].children[16].textContent,'8');
 await change(document.querySelector('#player [aria-label="Type de matchs du joueur"]'),'championship');
 assert.equal(document.querySelectorAll('#player tbody tr').length,2,'One row per filtered match');
 const foot=document.querySelectorAll('#player tfoot tr');assert.equal(foot[0].children[3].textContent,'10');assert.equal(foot[1].children[3].textContent,'5');assert.equal(foot[1].children[4].textContent,'1/2');assert.equal(foot[1].children[7].textContent,'50 %','Shooting percentage uses pooled attempts, not an average of percentages');
 // Switching types recalculates both numerators and played-match counts.
 await change(document.querySelector('#management [aria-label="Type de matchs des statistiques joueurs"]'),'friendly');assert.equal(document.querySelector('#management tbody tr').children[16].textContent,'20');assert.equal(document.querySelectorAll('#management tbody tr')[1].children[16].textContent,'—','An absent player has no fictitious average');
 await change(document.querySelector('#player [aria-label="Type de matchs du joueur"]'),'cup');assert.equal(document.querySelectorAll('#player tbody tr').length,1);assert.equal(document.querySelectorAll('#player tfoot tr')[1].children[3].textContent,'0');
 await act(async()=>{m.unmount();p.unmount()});console.log('Stats: pagination exhaustive, catégories, absence, matchs à zéro, moyennes par joueur et tableaux réels validés.');process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
