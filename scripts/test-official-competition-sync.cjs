const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const context={exports:{},URLSearchParams,Date};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/official-competition-sync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
const refresh=context.exports.refreshOfficialConnection;
const connection={id:'c',team_id:'team',ffbb_team_name:'Club Exemple',source_url:'https://competitions.ffbb.com/ligues/idf/comites/75/clubs/exemple/equipes/123',competition_kind:'championship',is_primary:true};
function fixture(){let fail=false;const rows=[{connection_id:'c',team_id:'team',source_match_key:'game',our_score:null,opponent_score:null}],saved={...connection},writes=[];return{rows,saved,writes,fail(){fail=true},from(table){let payload,filters=[];const q={upsert(data){payload=data;return q},update(data){payload=data;return q},eq(k,v){filters.push([k,v]);return q},then(resolve){if(fail){fail=false;return Promise.resolve({error:{message:'write failed'}}).then(resolve)}writes.push(table);if(table==='ffbb_synced_matches'){for(const row of payload){const found=rows.find(x=>x.connection_id===row.connection_id&&x.source_match_key===row.source_match_key);if(found)Object.assign(found,row);else rows.push(row)}}else if(filters.every(([k,v])=>saved[k]===v))Object.assign(saved,payload);return Promise.resolve({error:null}).then(resolve)}};return q}}}
const game={sourceKey:'game',date:'2026-10-25',round:'J5',time:'15:00',homeAway:'home',opponent:'Autre club',ourScore:80,opponentScore:70};
(async()=>{
 const db=fixture();let requested='';const fetcher=async(url,options)=>{requested=url;assert.equal(options.cache,'no-store');return{ok:true,json:async()=>({mode:'team',matches:[game,{...game,sourceKey:'zero',ourScore:0,opponentScore:20}]})}};
 await refresh(db,'team',connection,fetcher);assert.equal(db.rows[0].our_score,80);assert.equal(db.rows[0].opponent_score,70);assert.equal(db.rows.length,2);assert.equal(db.rows[1].our_score,0);assert(new URL('https://mybasket.test'+requested).searchParams.get('team')==='Club Exemple');assert.equal(db.saved.is_primary,true);assert.equal(db.saved.source_url,connection.source_url);assert(db.saved.last_synced_at);
 await refresh(db,'team',connection,fetcher);assert.equal(db.rows.length,2,'Refresh updates the same rows without duplicating matches');
 const count=db.writes.length;await assert.rejects(()=>refresh(db,'unrelated',connection,fetcher));assert.equal(db.writes.length,count);
 for(const response of [{ok:false,json:async()=>({error:'Source indisponible'})},{ok:true,json:async()=>({mode:'choose-team',teams:[]})},{ok:true,json:async()=>({mode:'team',matches:[]})}]){await assert.rejects(()=>refresh(db,'team',connection,async()=>response));assert.equal(db.rows[0].our_score,80);assert.equal(db.writes.length,count)}
 db.fail();await assert.rejects(()=>refresh(db,'team',connection,fetcher),/enregistrement impossible/);assert.equal(db.writes.length,count);
 let serverCalls=0;
 await refresh(db,'team',connection,async()=>{serverCalls++;throw Error('Server unavailable')},async()=>({mode:'team',matches:[{...game,ourScore:95}]}));assert.equal(serverCalls,0);assert.equal(db.rows[0].our_score,95);
 await refresh(db,'team',connection,fetcher,async()=>{throw Error('Direct FFBB unavailable')});assert.equal(db.rows[0].our_score,80);
 console.log('PASS: browser FFBB reader recovers scores when the server calendar is empty, with server fallback when direct reading fails.');
 console.log('PASS: official refresh replaces stale scores, preserves zero and connection identity, avoids duplicates, scopes the team, and retains data on provider/write failure.');
})().catch(e=>{console.error(e);process.exitCode=1});
