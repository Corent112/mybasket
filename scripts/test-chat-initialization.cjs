const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText, file);
let authenticated = true, missing = true, broken = false, modelFails = false, calls = 0, cachedResearch = null;
const db = {from(table) {
  let key;
  const q = {
    select(){return q}, insert(){return q}, update(){return q}, eq(field,value){if(field==='query_key')key=value;return q}, gte(){return q},
    async upsert(value){if(table==='ai_basketball_web_research')cachedResearch=value;return {error:null}}, in(){return q}, not(){return q}, order(){return q}, limit(){return q},
    async single(){return missing ? {data:null,error:{code:'PGRST205',message:'public.ai_conversations missing'}} : broken ? {data:null,error:{code:'42501',message:'private database policy detail'}} : {data:{id:table==='ai_conversations'?'conversation':'message'},error:null}},
    async maybeSingle(){return {data:table==='ai_basketball_web_research'&&cachedResearch?.query_key===key?cachedResearch:null,error:null}},
    then(resolve,reject){return Promise.resolve({data:[],count:0,error:missing ? {code:'PGRST205',message:`${table} absent`} : null}).then(resolve,reject)},
  };return q;
}};
const original = Module._load;
Module._load = function(name,parent,main) {
  if(name==='@/lib/ai/knowledge/search')return {searchKnowledge:async()=>({chunks:[]})};
  if(name==='@/lib/ai/config')return {AI_CHAT_MODEL:'configured-model',AI_CHAT_RATE_LIMIT:10,AI_CHAT_RATE_WINDOW_MS:60000,AI_HISTORY_LIMIT:20,isOpenAiConfigured:()=>true};
  if(name==='@/lib/ai/knowledge')return {
    resolveActor:async()=>authenticated?{ok:true,actor:{supabase:db,userId:'owner',clubIds:[]}}:{ok:false,error:'Non connecté',status:401},
    getWriterClient:()=>db,buildScopeContext:()=>({}),logAIUsage:async()=>{},
    buildAIContext:async(_db, options)=>({systemPrompt:'Basket',citations:[],degraded:false,notes:[], terms: (options.lexicalOnly || options.query === 'Propose une séance basket U18') ? [{id:'term',term:'Possession',definition:'Contrôle du ballon.'}] : []}),
  };
  if(name==='@/lib/ai/openai')return {getOpenAI:()=>({responses:{create:async options=>{calls++;if(modelFails)throw Error('private provider detail');
    if(options.tools)return {status:'completed',output:[{type:'web_search_call'},{type:'message',content:[{
      type:'output_text',text:'Une possession dure au plus 24 secondes en FIBA.',annotations:[
        {type:'url_citation',title:'Règlement FIBA',url:'https://www.fiba.basketball/rules',end_index:47},
        {type:'url_citation',title:'Documentation FFBB',url:'https://www.ffbb.com/reglements',end_index:47},
        {type:'url_citation',title:'Lien non autorisé',url:'javascript:alert(1)',end_index:47},
      ],
    }]}]};
    return (async function*(){yield {type:'response.output_text.delta',delta:'Une possession est une séquence de contrôle du ballon.'};yield {type:'response.completed',response:{usage:{input_tokens:2,output_tokens:3}}}})()}}})};
  if(name==='@/lib/ai/http')return {apiError:(error,status=400)=>Response.json({error},{status}),boolOr:(v,f)=>typeof v==='boolean'?v:f,enforceRateLimit:()=>null,isUuid:()=>false,readJson:r=>r.json(),str:(s,n=5000)=>String(s||'').slice(0,n)};
  if(name.startsWith('@/'))name=path.resolve(__dirname,'..',name.slice(2));
  return original.call(this,name,parent,main);
};
const chat = require('../app/api/ai/chat/route.ts');
const {getKnowledgeOverview} = require('../lib/ai/knowledge/overview.ts');
const req=(message='Définis une possession', workspace=false)=>new Request('https://mybasket.test/api/ai/chat',{method:'POST',body:JSON.stringify({message,workspace})});
const errorLog=console.error;console.error=()=>{};
(async()=>{
  authenticated=false;assert.equal((await chat.POST(req())).status,401);authenticated=true;
  let r=await chat.POST(req());assert.equal(r.status,503);let b=await r.json();assert.equal(b.code,'AI_SETUP_REQUIRED');assert(!JSON.stringify(b).includes('ai_conversations'));assert.equal(calls,0);
  let status=await getKnowledgeOverview(db);assert.equal(status.databaseReady,false);assert.equal(status.indexation.status,'error');assert(status.unavailableTables.includes('ai_conversations'));
  missing=false;status=await getKnowledgeOverview(db);assert.equal(status.databaseReady,true);assert.equal(status.documents,0);assert.equal(status.indexation.status,'idle');
  broken=true;r=await chat.POST(req());assert.equal(r.status,500);assert(!(await r.text()).includes('private database'));broken=false;
  r=await chat.POST(req());assert.equal(r.status,200);let stream=await r.text();assert(stream.includes('event: delta'));assert(stream.includes('event: done'));
  assert(stream.includes('Contrôle du ballon.'));assert.equal(calls,0);
  const researched = await chat.POST(req('Cherche les sources de la règle basket des 24 secondes'));
  stream = await researched.text();
  assert(stream.includes('event: done'));
  assert(stream.includes('Règlement FIBA'));
  assert(stream.includes('Documentation FFBB'));
  assert(!stream.includes('javascript:'));
  assert.equal(cachedResearch.user_id,'owner');
  assert.equal(cachedResearch.citations.length,2);
  assert.equal(calls,1);
  const repeat = await chat.POST(req('  cherche les sources de la règle basket des 24 secondes ?'));
  assert((await repeat.text()).includes('Règlement FIBA'));
  assert.equal(calls,1, 'Repeat uses the private research cache');
  const workspace = await chat.POST(req('Propose une séance basket U18', true));
  const workspaceStream = await workspace.text();
  assert(workspaceStream.includes('Une possession est une séquence'), 'The workspace generates answers in documentary mode');
  assert(workspaceStream.includes('event: done'));
  process.env.MYBASKET_COACH_MODE = 'generative';
  modelFails=true;r=await chat.POST(req());stream=await r.text();assert(stream.includes('event: error'));assert(!stream.includes('private provider detail'));
  console.error=errorLog;Module._load=original;
  console.log('Chat initialization passed: missing schema versus empty knowledge base, no provider call before readiness, clear errors without database/provider leakage, authenticated SSE success. No real AI call.');
})().catch(e=>{console.error=errorLog;Module._load=original;console.error(e);process.exitCode=1});
