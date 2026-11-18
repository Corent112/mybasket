const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {diagramDiagnostic}=require('../lib/ai/diagram-assistant/errors.ts');
for(const [error,code] of [[{status:401},'provider_auth'],[{status:403},'provider_auth'],[{status:404},'provider_model'],[{status:429,code:'insufficient_quota'},'provider_quota'],[{status:429},'provider_rate'],[{name:'APIConnectionTimeoutError'},'timeout'],[{name:'APIUserAbortError'},'cancelled'],[{status:503},'provider_unavailable']])assert.equal(diagramDiagnostic(error,'inventory').code,code);
const {parseVisionJson,readScene}=require('../lib/ai/diagram-assistant/model.ts');
assert.throws(()=>parseVisionJson('not-json','paths'),e=>e.code==='invalid_json'&&e.stage==='paths');assert.throws(()=>readScene({players:[]},true),e=>e.code==='no_players');
const inventory={court:{type:'half'},players:[{key:'p1',label:'1',x:.3,y:.7,confidence:.95},{key:'p2',label:'2',x:.7,y:.3,confidence:.95}],terminals:[{id:'t1',kind:'arrow',x:.7,y:.3,confidence:.95}]};
let mode='success',auth=true,calls=0;const entries=[],deferred=[],consoleEntries=[];const actual=Module._load,originalError=console.error,originalWarn=console.warn;console.error=(...args)=>consoleEntries.push(args);console.warn=(...args)=>consoleEntries.push(args);
Module._load=function(request,parent,main){
 if(request==='next/server'){const server=actual.call(this,request,parent,main);return{...server,after:cb=>deferred.push(cb)}};
 if(request==='@/lib/ai/knowledge')return{resolveActor:async()=>auth?{ok:true,actor:{userId:'diagnostics-test',clubIds:[],supabase:{}}}:{ok:false,status:401,error:'Connexion requise'},getWriterClient:()=>({}),logAIUsage:async(_client,row)=>entries.push(row),buildScopeContext:()=>({})};
 if(request==='@/lib/ai/openai')return{getOpenAI:()=>({responses:{create:async args=>{
  calls++;const isInventory=args.input[0].content[0].text.includes('LECTURE 1');
  if(mode==='auth'||mode==='timeout'||mode==='model')throw Object.assign(new Error('PRIVATE_IMAGE_AND_CREDENTIAL_MUST_NOT_LEAK'),mode==='auth'?{status:401,request_id:'req-private-test'}:mode==='model'?{status:404}:{name:'APIConnectionTimeoutError'});
  if(mode==='partial'&&!isInventory)throw Object.assign(new Error('PRIVATE_PROMPT'),{status:429});
  if(mode==='limit')return{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output_text:''};
  if(mode==='json')return{output_text:'invalid'};
  if(mode==='empty')return{output_text:JSON.stringify({court:{type:'half'},players:[],terminals:[]})};
  return{output_text:JSON.stringify(isInventory?inventory:{actions:[{terminalId:'t1',action:'pass',fromPlayer:'p1',toPlayer:'p2',from:{x:.3,y:.7},to:{x:.7,y:.3},confidence:.95}]}),usage:{input_tokens:2,output_tokens:3}};
 }}})};
 if(request.startsWith('@/'))request=path.resolve(__dirname,'..',request.slice(2));return actual.call(this,request,parent,main);
};
const route=require('../app/api/ai/import/exercise/route.ts');
const req=()=>new Request('https://mybasket.test/api/ai/import/exercise',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:'data:image/jpeg;base64,AA==',diagramOnly:true,coordinateSpace:'image',courtType:'half'})});
async function run(){const response=await route.POST(req()),body=await response.json();await Promise.all(deferred.splice(0).map(cb=>cb()));return{response,body}}
(async()=>{
 auth=false;assert.equal((await run()).response.status,401);assert.equal(calls,0);auth=true;
 for(const [scenario,code] of [['auth','provider_auth'],['model','provider_model'],['timeout','timeout'],['json','invalid_json'],['empty','no_players'],['limit','output_limit']]){
  mode=scenario;const {response,body}=await run();assert.equal(response.status,502);assert.equal(body.diagnostic.code,code);assert.equal(body.diagnostic.stage,'inventory');assert.ok(body.diagnostic.reference);assert.equal(entries.at(-1).success,false);assert.equal(entries.at(-1).metadata.reference,body.diagnostic.reference);
 }
 mode='partial';let {response,body}=await run();assert.equal(response.status,200);assert.equal(body.exercise.assistantResult.status,'partial');assert.equal(body.exercise.assistantResult.stage,'paths');assert.equal(body.exercise.diagram.scanAudit.failure.code,'provider_rate');assert.equal(entries.at(-1).success,false);
 mode='success';({response,body}=await run());assert.equal(response.status,200);assert.equal(body.exercise.assistantResult.status,'read');assert.equal(entries.at(-1).success,true);
 assert.equal(JSON.stringify([entries,consoleEntries]).includes('PRIVATE_'),false,'No raw provider text, private prompt or image contents enters logs');assert.equal(JSON.stringify([entries,consoleEntries]).includes('data:image'),false);console.error=originalError;console.warn=originalWarn;
 console.log('Import diagnostics: distinct provider auth/model/quota/rate/timeout/JSON/geometry errors, partial-vs-success outcomes, correlation and private-content-safe failure logs passed. Provider simulated; production cause is not established by this test.');
})().catch(error=>{console.error=originalError;console.warn=originalWarn;console.error(error);process.exitCode=1});
