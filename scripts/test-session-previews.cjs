const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(path,mocks={}){const c={exports:{},require:name=>mocks[name]};vm.createContext(c);vm.runInContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,c);return c.exports}
const model=load('lib/library/schema-previews.ts');const {withSessionPreviews}=load('lib/library/session-previews.ts',{'./schema-previews':model});
const rows=[{id:'1',session_id:'a',situation_image_url:'a-1'},{id:'2',session_id:'b',situation_image_url:'b-1'},{id:'3',session_id:'a',situation_image_url:'a-2'},{id:'4',session_id:'a',situation_image_url:'a-1'},{id:'5',session_id:'unrelated',situation_image_url:'private-image'}];
let calls=0;
const db={from(table){assert.equal(table,'practice_session_exercises');let ids=[];const q={select(){return q},in(key,value){assert.equal(key,'session_id');ids=value;assert(ids.length<=100);return q},order(){return q},async range(start){calls++;return{data:rows.filter(row=>ids.includes(row.session_id)).slice(start,start+2),error:null}}};return q}};
(async()=>{
 const source=[{id:'a',schemaImages:['cover']},{id:'b'},{id:'c'}];const result=await withSessionPreviews(db,source);
 assert.equal(JSON.stringify(result[0].schemaImages),JSON.stringify(['cover','a-1','a-2']));assert.equal(result[1].schemaImages[0],'b-1');assert.equal(result[2].schemaImages.length,0);assert.equal(source[0].schemaImages.length,1);assert.equal(calls,3,'Pagination follows server caps and stops at the empty page');assert(!JSON.stringify(result).includes('private-image'));
 const fallback=await withSessionPreviews({from(){throw Error('access unavailable')}},source);assert.equal(fallback[0].schemaImages[0],'cover');assert.equal(fallback.length,3);
 calls=0;await withSessionPreviews(db,Array.from({length:201},(_,i)=>({id:'s'+i})));assert.equal(calls,3);const before=calls;assert.equal((await withSessionPreviews(db,[])).length,0);assert.equal(calls,before);
 console.log('PASS: batched session snapshots, complete pagination despite server row caps, deduplication, scope isolation, empty/error fallback and no per-card request.');
})().catch(error=>{console.error(error);process.exitCode=1});
