const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText, file);
let authenticated = true, missing = true, broken = false, modelFails = false, calls = 0;
const db = {from(table) {
  const q = {
    select(){return q}, insert(){return q}, update(){return q}, eq(){return q}, in(){return q}, not(){return q}, order(){return q}, limit(){return q},
    async single(){return missing ? {data:null,error:{code:'PGRST205',message:'public.ai_conversations missing'}} : broken ? {data:null,error:{code:'42501',message:'private database policy detail'}} : {data:{id:table==='ai_conversations'?'conversation':'message'},error:null}},
    async maybeSingle(){return {data:null,error:null}},
    then(resolve,reject){return Promise.resolve({data:[],count:0,error:missing ? {code:'PGRST205',message:`${table} absent`} : null}).then(resolve,reject)},
  };return q;
}};
const original = Module._load;
Module._load = function(name,parent,main) {
  if(name==='@/lib/ai/config')return {AI_CHAT_MODEL:'configured-model',AI_CHAT_RATE_LIMIT:10,AI_CHAT_RATE_WINDOW_MS:60000,AI_HISTORY_LIMIT:20,isOpenAiConfigured:()=>true};
  if(name==='@/lib/ai/knowledge')return {
    resolveActor:async()=>authenticated?{ok:true,actor:{supabase:db,userId:'owner',clubIds:[]}}:{ok:false,error:'Non connecté',status:401},
    getWriterClient:()=>db,buildScopeContext:()=>({}),logAIUsage:async()=>{},
    buildAIContext:async(_db, options)=>({systemPrompt:'Basket',citations:[],degraded:false,notes:[], terms: options.lexicalOnly ? [{id:'term',term:'Possession',definition:'Contrôle du ballon.'}] : []}),
  };
  if(name==='@/lib/ai/openai')return {getOpenAI:()=>({responses:{create:async()=>{calls++;if(modelFails)throw Error('private provider detail');return (async function*(){yield {type:'response.output_text.delta',delta:'Une possession est une séquence de contrôle du ballon.'};yield {type:'response.completed',response:{usage:{input_tokens:2,output_tokens:3}}}})()}}})};
  if(name==='@/lib/ai/http')return {apiError:(error,status=400)=>Response.json({error},{status}),boolOr:(v,f)=>typeof v==='boolean'?v:f,enforceRateLimit:()=>null,isUuid:()=>false,readJson:r=>r.json(),str:(s,n=5000)=>String(s||'').slice(0,n)};
  if(name.startsWith('@/'))name=path.resolve(__dirname,'..',name.slice(2));
  return original.call(this,name,parent,main);
};
const chat = require('../app/api/ai/chat/route.ts');
const {getKnowledgeOverview} = require('../lib/ai/knowledge/overview.ts');
const req=()=>new Request('https://mybasket.test/api/ai/chat',{method:'POST',body:JSON.stringify({message:'Définis une possession'})});
const errorLog=console.error;console.error=()=>{};
(async()=>{
  authenticated=false;assert.equal((await chat.POST(req())).status,401);authenticated=true;
  let r=await chat.POST(req());assert.equal(r.status,503);let b=await r.json();assert.equal(b.code,'AI_SETUP_REQUIRED');assert(!JSON.stringify(b).includes('ai_conversations'));assert.equal(calls,0);
  let status=await getKnowledgeOverview(db);assert.equal(status.databaseReady,false);assert.equal(status.indexation.status,'error');assert(status.unavailableTables.includes('ai_conversations'));
  missing=false;status=await getKnowledgeOverview(db);assert.equal(status.databaseReady,true);assert.equal(status.documents,0);assert.equal(status.indexation.status,'idle');
  broken=true;r=await chat.POST(req());assert.equal(r.status,500);assert(!(await r.text()).includes('private database'));broken=false;
  r=await chat.POST(req());assert.equal(r.status,200);let stream=await r.text();assert(stream.includes('event: delta'));assert(stream.includes('event: done'));
  assert(stream.includes('Contrôle du ballon.'));assert.equal(calls,0);
  process.env.MYBASKET_COACH_MODE = 'generative';
  modelFails=true;r=await chat.POST(req());stream=await r.text();assert(stream.includes('event: error'));assert(!stream.includes('private provider detail'));
  console.error=errorLog;Module._load=original;
  console.log('Chat initialization passed: missing schema versus empty knowledge base, no provider call before readiness, clear errors without database/provider leakage, authenticated SSE success. No real AI call.');
})().catch(e=>{console.error=errorLog;Module._load=original;console.error(e);process.exitCode=1});
