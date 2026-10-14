const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const path='app/api/institutionnel/players/route.ts',source=fs.readFileSync(path,'utf8'),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const post=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='POST');
async function run({authorized=true,eventExists=true,participantExists=true,deleteError=null,body={structureId:'institution-a',action:'remove_detection_participant',eventId:'event-a',participantId:'participant-a'}}={}){
 const queries=[];
 const admin={from(table){const query={table,filters:[],deleted:false};queries.push(query);return {select(){return this},eq(key,value){query.filters.push([key,value]);return this},delete(){query.deleted=true;return this},async maybeSingle(){return table==='institutional_detection_events'?{data:eventExists?{id:'event-a'}:null,error:null}:{data:participantExists?{id:'participant-a'}:null,error:deleteError}}};}};
 const context={exports:{},NextResponse:{json:(body,options={})=>({body,status:options.status||200})},actor:async()=>authorized?{admin,user:{id:'user-a'}}:{error:{status:403}}};vm.createContext(context);
 vm.runInContext(ts.transpileModule(post.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
 return {result:await context.exports.POST({json:async()=>body}),queries};
}
(async()=>{
 let x=await run();assert.equal(x.result.status,200);assert.equal(x.queries[0].table,'institutional_detection_events');assert.deepEqual(x.queries[0].filters,[['id','event-a'],['structure_id','institution-a']]);assert.equal(x.queries[1].table,'institutional_detection_participants');assert.equal(x.queries[1].deleted,true);assert.deepEqual(x.queries[1].filters,[['id','participant-a'],['event_id','event-a']]);assert.equal(x.queries.some(q=>q.table==='institutional_players'),false);
 x=await run({authorized:false});assert.equal(x.result.status,403);assert.equal(x.queries.length,0);
 x=await run({eventExists:false});assert.equal(x.result.status,404);assert.equal(x.queries.some(q=>q.deleted),false);
 x=await run({participantExists:false});assert.equal(x.result.status,404);
 x=await run({deleteError:{message:'Deletion refused'}});assert.equal(x.result.status,400);assert.equal(x.result.body.error,'Deletion refused');
 console.log('Event participant removal: institution authorization, event scope, participant scope, preserved player sheet and errors passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
