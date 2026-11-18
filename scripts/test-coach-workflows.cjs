const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {supplementScan}=require('../lib/import/ai-scan-assist.ts');
const {teamMessagingContacts}=require('../lib/messaging/team-contacts.ts');
const {montageDraftKey,writeMontageDraft,readMontageDraft,discardMontageDraft}=require('../lib/montage/draft-store.ts');
function dbFor(permission=false){
 const tables={teams:[{id:'t',user_id:'coach',name:'U18'}],team_members:[{user_id:'staff',status:'active',permissions:{players:permission}}],players:[{id:'p',first_name:'Myles',last_name:'Barry',user_id:'coach',metadata:{}},{id:'linked',first_name:'Joueur',metadata:{messagingUserId:'athlete'}}],profiles:[{id:'coach',display_name:'Coach'},{id:'staff',display_name:'Staff'},{id:'athlete',display_name:'Athlète'}]};
 return{from(table){let rows=tables[table];const query={select:()=>query,eq:(key,value)=>{if(key!=='team_id')rows=rows.filter(r=>r[key]===value);return query},in:(key,values)=>{rows=rows.filter(r=>values.includes(r[key]));return query},maybeSingle:async()=>({data:rows[0]||null,error:null}),then:resolve=>Promise.resolve({data:rows,error:null}).then(resolve)};return query}};
}
(async()=>{
 const original={detected:true,courtType:'half',players:[{key:'3',label:'3',team:'attack',x:.2,y:.3}],actions:[{action:'screen',fromPlayer:'3',from:{x:.2,y:.3},to:{x:.5,y:.6},points:[{x:.3,y:.3}]}],objects:[]};
 const local={diagram:original,warnings:[]};
 const ai={diagram:{...original,players:[{...original.players[0],key:'ai3'}],actions:[{...original.actions[0],fromPlayer:'ai3'},{action:'cut',fromPlayer:'ai3',from:{x:.5,y:.6},to:{x:.4,y:.2}},{action:'dribble',fromPlayer:'unknown',to:{x:.8,y:.8}}]},warnings:[]};
 const combined=supplementScan(local,ai);
 assert.equal(combined.diagram.players.length,1);assert.equal(combined.diagram.actions.length,3);
 assert.deepEqual(combined.diagram.actions[0],original.actions[0]);assert.equal(original.actions.length,1);
 assert.equal(combined.diagram.actions[1].fromPlayer,'3');assert.equal(combined.diagram.actions[2].fromPlayer,undefined);assert.ok(combined.diagram.actions[2].confidence<.5);
 assert.equal(supplementScan({...local,diagrams:[original,original]},ai).diagram,original);
 assert.equal(supplementScan(local,{...ai,diagram:{...ai.diagram,courtType:'full'}}).diagram,original);
 const owner=await teamMessagingContacts(dbFor(),'coach','t');
 assert.equal(owner.contacts.find(r=>r.playerId==='p').userId,null);assert.equal(owner.contacts.find(r=>r.playerId==='linked').userId,'athlete');
 assert.equal(owner.contacts.some(r=>r.userId==='coach'),false);
 const staff=await teamMessagingContacts(dbFor(),'staff','t');assert.equal(staff.contacts.some(r=>r.kind==='player'),false);
 assert.ok((await teamMessagingContacts(dbFor(true),'staff','t')).contacts.some(r=>r.kind==='player'));
 await assert.rejects(teamMessagingContacts(dbFor(),'outsider','t'),/Accès/);
 global.indexedDB=require('fake-indexeddb').indexedDB;
 const key=montageDraftKey('coach','t','');assert.notEqual(key,montageDraftKey('other','t',''));
 await writeMontageDraft(key,{version:1,fingerprint:'new',savedAt:1,snapshot:{title:'My film',items:[{clip_start:3,clip_end:8}]}});
 await discardMontageDraft(key,'old');assert.equal((await readMontageDraft(key)).fingerprint,'new');
 assert.equal(await readMontageDraft(montageDraftKey('other','t','')),null);
 await discardMontageDraft(key,'new');assert.equal(await readMontageDraft(key),null);
 console.log('Coach workflows: preserved screen/cut/dribble, contact access isolation and local draft recovery passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
