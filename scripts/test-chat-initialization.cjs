const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText, file);
let authenticated = true, missing = true, broken = false, modelFails = false, quotaFails = false, calls = 0, cachedResearch = null, savedFiles = [], modelInput = [], publicQueries = [], prior = [], coachInstructions = "";
let subscriptionActive = true;
const db = {from(table) {
  let key, columns;
  const q = {
    select(fields){columns=fields;return q}, insert(row){if(row.attachments)savedFiles.push({attachments:row.attachments});return q}, update(){return q}, eq(field,value){if(field==='query_key')key=value;return q}, gte(){return q},
    async upsert(value){if(table==='ai_basketball_web_research')cachedResearch=value;return {error:null}}, neq(){return q}, in(){return q}, not(){return q}, order(){return q}, limit(){return q},
    async single(){return missing ? {data:null,error:{code:'PGRST205',message:'public.ai_conversations missing'}} : broken ? {data:null,error:{code:'42501',message:'private database policy detail'}} : {data:{id:table==='ai_conversations'?'conversation':'message'},error:null}},
    async maybeSingle(){return {data:table==='ai_basketball_web_research'&&cachedResearch?.query_key===key?cachedResearch:null,error:null}},
    then(resolve,reject){return Promise.resolve({data:columns?.startsWith("attachments,")?savedFiles:columns==="role, content, attachments"?prior:[],count:0,error:missing ? {code:'PGRST205',message:`${table} absent`} : null}).then(resolve,reject)},
  };return q;
}};
const original = Module._load;
Module._load = function(name,parent,main) {
  if(name==='@/lib/effective-subscription')return {getEffectiveSubscriptionForUser:async()=>({active:subscriptionActive})};
  if(name==='@/lib/ai/coach-groq')return {GROQ_COACH_MODEL:'openai/gpt-oss-120b',getGroqCoach:()=>({chat:{completions:{create:async options=>{
    modelInput=options.messages;
    return (async function*(){yield {choices:[{delta:{content:'Réponse Groq [W1]'}}]}})();
  }}}})};
  if(name==='@/lib/ai/coach-pilot-quota')return {getCoachPilotRestriction:async()=>process.env.TEST_COACH_QUOTA || null};
  if(name==='@/lib/ai/coach-local')return {getLocalCoach:()=>({model:'gpt-oss:20b',client:{chat:{completions:{create:async options=>{
    assert.equal(options.model,'gpt-oss:20b');
    assert.equal(options.max_tokens,1500);
    modelInput=options.messages;
    return (async function*(){yield {choices:[{delta:{content:'Réponse MyBasket locale [W1]'}}]}})();
  }}}}})};
  if(name==='@/lib/ai/coach-brave')return {searchCoachWeb:async question=>{
    publicQueries.push(question);
    return {answer:'Règlement public',citations:[{kind:'web',id:'fiba',url:'https://www.fiba.basketball/rules',label:'FIBA',endIndex:17}]};
  }};
  if(name==='@/lib/ai/knowledge/extract')return {
    resolveSourceType:()=> 'txt', isIndexableType:()=>true,
    extractDocumentText:async buffer=>({pages:[{text:new TextDecoder().decode(buffer)}]})
  };
  if(name==='@/lib/ai/knowledge/search')return {searchKnowledge:async()=>({chunks:[]})};
  if(name==='@/lib/ai/config')return {AI_CHAT_MODEL:'configured-model',AI_CHAT_RATE_LIMIT:10,AI_CHAT_RATE_WINDOW_MS:60000,AI_HISTORY_LIMIT:20,isOpenAiConfigured:()=>true};
  if(name==='@/lib/ai/knowledge')return {
    resolveActor:async()=>authenticated?{ok:true,actor:{supabase:db,userId:'owner',clubIds:[]}}:{ok:false,error:'Non connecté',status:401},
    getWriterClient:()=>db,buildScopeContext:()=>({}),logAIUsage:async()=>{},
    buildAIContext:async(_db, options)=>({systemPrompt:'Basket',citations:[],chunks:options.query.includes('défense Blitz') ? [{source_id:'kb',heading:'Défense U18',content:'L’aide côté faible doit fermer la ligne de passe.'}] : [],degraded:false,notes:[], terms: (options.lexicalOnly || options.query === 'Propose une séance basket U18') ? [{id:'term',term:'Possession',definition:'Contrôle du ballon.'}] : []}),
  };
  if(name==='@/lib/ai/openai')return {getOpenAI:()=>({responses:{create:async options=>{calls++;modelInput=options.input;if(quotaFails)throw Object.assign(Error("You have no credits remaining."),{code:"credit_balance_exhausted"});if(modelFails)throw Error('private provider detail');
    if(options.tools){publicQueries.push(options.input);return {status:'completed',output:[{type:'web_search_call'},{type:'message',content:[{
      type:'output_text',text:'Une possession dure au plus 24 secondes en FIBA.',annotations:[
        {type:'url_citation',title:'Règlement FIBA',url:'https://www.fiba.basketball/rules',end_index:47},
        {type:'url_citation',title:'Documentation FFBB',url:'https://www.ffbb.com/reglements',end_index:47},
        {type:'url_citation',title:'Lien non autorisé',url:'javascript:alert(1)',end_index:47},
      ],
    }]}]};}
    coachInstructions=options.instructions;
    const hasPublicReferences=options.input.at(-1).content.includes("Recherche publique");
    return (async function*(){yield {type:'response.output_text.delta',delta:'Une possession est une séquence de contrôle du ballon.'+(hasPublicReferences?' [W1]':'')};yield {type:'response.completed',response:{usage:{input_tokens:2,output_tokens:3}}}})()}}})};
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
  subscriptionActive=false;
  assert.equal((await chat.POST(req())).status,403);
  assert.equal(calls,0);
  subscriptionActive=true;
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
  const data = new FormData();
  data.set('chat', JSON.stringify({message:'Analyse mon playbook basket',workspace:true}));
  data.append('resources', new Blob(['La défense Blitz impose une prise à deux.'], {type:'text/plain'}), 'Défense Blitz.txt');
  const upload = await chat.POST(new Request('https://mybasket.test/api/ai/chat',{method:'POST',body:data}));
  assert((await upload.text()).includes('event: done'));
  assert.equal(savedFiles[0].attachments[0].name,'Défense Blitz.txt');
  assert(modelInput.at(-1).content.includes('prise à deux'));
  const reused = await chat.POST(req('Propose un exercice pour travailler la défense Blitz',true));
  assert((await reused.text()).includes('event: done'));
  assert(modelInput.at(-1).content.includes('Défense Blitz.txt'), 'A new conversation reuses a relevant private resource');
  assert(modelInput.at(-1).content.includes('Recherche publique'), 'The synthesis receives public research and private resources');
  assert(!publicQueries.at(-1).includes('prise à deux'), 'Private excerpts never go to the search tool');
  assert(coachInstructions.includes('critère de réussite chiffré'));
  assert(coachInstructions.includes('rotations'));
  assert(coachInstructions.includes('donne le sens dès la première phrase'));
  assert(coachInstructions.includes('donne d’abord l’information demandée'));
  assert.equal(require('../lib/ai/basketball-web-research.ts').shouldResearchCoachingQuestion('C’est quoi le pick and roll ?'), false);
  assert.equal(require('../lib/ai/basketball-web-research.ts').shouldResearchCoachingQuestion('Propose un exercice pour défendre le pick and roll'), true);
  const sections = ['Ce qu’on observe', 'Pourquoi ça peut arriver', 'Quoi corriger', 'Comment le travailler'];
  const positions = sections.map(section => coachInstructions.indexOf(section));
  assert(positions[0] >= 0 && positions.every((position, index) => index === 0 || position > positions[index - 1]));
  assert(coachInstructions.includes('distingue les faits des hypothèses'));
  assert(coachInstructions.includes('permettrait de la confirmer ou de l’écarter'));

  prior = [{role:'user',content:'Défense Blitz sur le pick and roll U18'}];
  const followUp = await chat.POST(req('Adapte à 8 joueurs et 15 minutes',true));
  const adapted = await followUp.text();
  assert(modelInput.some(entry => entry.content === 'Défense Blitz sur le pick and roll U18'));
  assert(modelInput.at(-1).content.includes('Adapte à 8 joueurs et 15 minutes'));
  assert(modelInput.at(-1).content.includes('Défense Blitz.txt'));
  assert(adapted.includes('event: answer') && adapted.includes('https://www.fiba.basketball/rules'));
  prior = [];
  process.env.MYBASKET_COACH_MODE = 'generative';
  modelFails=true;r=await chat.POST(req());stream=await r.text();
  assert(stream.includes('event: done') && stream.includes('Contrôle du ballon.'));
  assert(!stream.includes('private provider detail'));
  quotaFails=true;r=await chat.POST(req('Définis une possession',true));stream=await r.text();
  assert(stream.includes('event: done') && stream.includes('Contrôle du ballon.') && stream.includes('crédits épuisés'));
  assert(!stream.includes('You have no credits remaining'));
  process.env.MYBASKET_COACH_PROVIDER='groq';
  process.env.BRAVE_SEARCH_API_KEY='test-only';
  const beforeFree=calls;
  const free=await chat.POST(req('Propose un exercice pour travailler la défense Blitz',true));
  const freeStream=await free.text();
  assert(modelInput.at(-1).content.includes('L’aide côté faible'), 'Indexed MyBasket documents reach the free model');
  assert(freeStream.includes('Réponse Groq') && freeStream.includes('event: done') && freeStream.includes('https://www.fiba.basketball/rules'));
  assert(modelInput.at(-1).content.includes('Défense Blitz.txt'));
  assert(!publicQueries.at(-1).includes('prise à deux'));
  assert.equal(calls,beforeFree,'Free mode never calls the paid OpenAI provider');
  process.env.MYBASKET_COACH_PROVIDER='local';
  const local=await chat.POST(req('Propose un exercice pour travailler la défense Blitz',true));
  const localStream=await local.text();
  assert(localStream.includes('Réponse MyBasket locale') && localStream.includes('event: done'));
  assert(modelInput.at(-1).content.includes('Défense Blitz.txt'));
  assert.equal(calls,beforeFree,'Self-hosted mode does not call OpenAI');
  process.env.TEST_COACH_QUOTA='Quota quotidien atteint.';
  const beforeLimit=publicQueries.length;
  const limited=await chat.POST(req('Définis une possession avec des sources',true));
  const limitedStream=await limited.text();
  assert(limitedStream.includes('Contrôle du ballon.') && limitedStream.includes('Quota quotidien atteint.'));
  assert(limitedStream.includes('event: done'));
  assert.equal(publicQueries.length,beforeLimit,'Blocked pilot never uses a search request');
  console.error=errorLog;Module._load=original;
  console.log('Chat initialization passed: missing schema versus empty knowledge base, no provider call before readiness, clear errors without database/provider leakage, authenticated SSE success. No real AI call.');
})().catch(e=>{console.error=errorLog;Module._load=original;console.error(e);process.exitCode=1});
