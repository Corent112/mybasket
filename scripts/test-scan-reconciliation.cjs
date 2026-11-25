const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
const {reconcileScan,scanWithAI}=require('../lib/import/ai-scan-assist.ts');
const player=(key,label,x,y,confidence=.95)=>({key,label,team:'att',x,y,confidence,labelConfident:label!=='?',typeConfidence:confidence});
const empty={detected:false,courtType:'half',players:[],actions:[],objects:[],notes:''};
const reference={url:'data:image/jpeg;base64,reference',play:{x0:.1,y0:.1,x1:.9,y1:.9}};
const local={diagram:empty,referenceFallback:{...empty,courtReference:reference,players:[player('noise','?',.1,.1,.3),player('noise2','?',.5,.2,.3),player('extra','4',.05,.2)],actions:[{action:'screen',fromPlayer:'noise',from:{x:.1,y:.1},to:{x:.11,y:.11},confidence:.2}]},warnings:['Local warning'],confidence:{text:0,diagram:.2}};
const ai={diagram:{...empty,detected:true,players:[player('1','1',.5,.4),player('3','3',.2,.1)],actions:[{action:'screen',fromPlayer:'3',from:{x:.2,y:.1},to:{x:.5,y:.3},confidence:.9},{action:'cut',fromPlayer:'3',from:{x:.5,y:.3},to:{x:.7,y:.2},confidence:.9},{action:'dribble',fromPlayer:'1',from:{x:.5,y:.4},to:{x:.8,y:.3},confidence:.9}]},confidence:{text:0,diagram:.9},warnings:[]};
let result=reconcileScan(local,ai);assert.equal(result.referenceFallback,undefined);assert.equal(result.diagram.players.length,3,'Reliable off-court player preserved');assert.equal(result.diagram.actions.length,3,'False circled-digit screen replaced rather than retained');assert.deepEqual(result.diagram.actions.slice(0,2).map(a=>a.action),['screen','cut']);assert.ok(result.diagram.actions[2].points.length>20);assert.equal(result.diagram.courtReference,reference);assert.deepEqual(local.referenceFallback.actions.length,1,'Original scan unchanged');
const reliableMovement={action:'cut',fromPlayer:'extra',from:{x:.05,y:.2},to:{x:.3,y:.25},confidence:.95};
assert.equal(reconcileScan({...local,referenceFallback:{...local.referenceFallback,actions:[...local.referenceFallback.actions,reliableMovement]}},ai).diagram.actions.length,4,'An independently reliable local movement is kept even if AI misses it');
assert.equal(reconcileScan(local,{...ai,diagram:{...ai.diagram,courtType:'full'}}).diagram,empty,'An incompatible court frame never replaces the calibrated scan');
const duplicate={...ai,diagram:{...ai.diagram,players:[player('1','1',.5,.4),player('x','1',.2,.1)]}};assert.equal(reconcileScan(local,duplicate).diagram,empty,'Duplicate numbered roster never replaces local');
assert.equal(reconcileScan(local,{...ai,diagram:{...ai.diagram,actions:[{...ai.diagram.actions[0],fromPlayer:'invented'}]}}).diagram,empty,'Broken player links never replace local');
assert.equal(reconcileScan({...local,diagrams:[ai.diagram,ai.diagram]},ai).diagram,empty,'Multi-court local diagrams preserved');
const stable={...local,referenceFallback:undefined,diagram:ai.diagram,diagrams:[ai.diagram]};assert.deepEqual(reconcileScan(stable,ai).diagram.actions,ai.diagram.actions,'Reliable geometry not overwritten');
// A visual pass confirmed by the terminal reader replaces the same AI
// displacement rather than appearing as a duplicate action.
const verifiedPass={action:'pass',fromPlayer:'local-1',toPlayer:'local-3',from:{x:.5,y:.4},to:{x:.8,y:.3},confidence:.86,source:'Pointe ou barre vérifiée · encre suivie jusqu’au départ'};
const verifiedBase={...local,referenceFallback:{...local.referenceFallback,players:[player('local-1','1',.5,.4),player('local-3','3',.2,.1)],actions:[verifiedPass]}};
const aiWrong={...ai,diagram:{...ai.diagram,actions:[{...ai.diagram.actions[2],action:'cut'}]}};
const merged=reconcileScan(verifiedBase,aiWrong).diagram.actions;
assert.equal(merged.length,1);assert.equal(merged[0].action,'pass');assert.equal(merged[0].toPlayer,'3');
let auth=true,contextCalls=0,requestArgs,rateOnce=false,providerCalls=0;

const actual=Module._load;Module._load=function(request,parent,main){
 if(request==='next/server'){const server=actual.call(this,request,parent,main);return{...server,after:callback=>void Promise.resolve().then(callback)}}
 if(request==='@/lib/ai/knowledge')return{resolveActor:async()=>auth?{ok:true,actor:{userId:'scan-test',clubIds:[],supabase:{}}}:{ok:false,status:401,error:'Connexion requise'},buildScopeContext:()=>({}),buildAIContext:async()=>{contextCalls++;throw Error('Diagram scan must not search documents')},getWriterClient:()=>({}),logAIUsage:async()=>{}};
 if(request==='@/lib/ai/openai')return{getOpenAI:()=>({responses:{create:async args=>{
  providerCalls++;if(rateOnce){rateOnce=false;throw Object.assign(new Error('rate'),{status:429,headers:new Headers({'retry-after':'0'})});}
  requestArgs=args;
  const inventory={court:{type:'half'},players:ai.diagram.players,terminals:ai.diagram.actions.map((a,i)=>({id:'t'+i,kind:a.action==='screen'?'bar':'arrow',...a.to,confidence:.95}))};
  const paths={actions:ai.diagram.actions.map((a,i)=>({...a,terminalId:'t'+i,previousTerminalId:i===1?'t0':null}))};
  return {output_text:JSON.stringify(args.input[0].content[0].text.includes('LECTURE 1')?inventory:paths)};
 }}})};
 if(request.startsWith('@/'))request=path.resolve(__dirname,'..',request.slice(2));return actual.call(this,request,parent,main);
};
const route=require('../app/api/ai/import/exercise/route.ts');
const req=()=>new Request('https://mybasket.test/api/ai/import/exercise',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:'data:image/jpeg;base64,AA==',diagramOnly:true,coordinateSpace:'image',courtType:'half'})});
(async()=>{
 auth=false;assert.equal((await route.POST(req())).status,401);auth=true;rateOnce=true;
 const response=await route.POST(req());assert.equal(response.status,200);result=(await response.json()).exercise;
 assert.equal(contextCalls,0);assert.equal(providerCalls,3,'One short upstream rate limit is retried once');assert.equal(requestArgs.store,false);assert.equal(result.diagram.players[0].y,.2,'Image normalized Y is converted exactly once');assert.equal(result.diagram.actions[0].from.y,.05,'Initial start inferred from player');assert.equal(result.diagram.actions[1].from.y,.15,'Next action starts at screen arrival');assert.match(requestArgs.input[0].content[0].text,/contour fermé/);
 // Browser preparation uses the same play rectangle as review, and releases temporary resources.
 const draws=[];let payload,revoked=0;global.Image=class{naturalWidth=1000;naturalHeight=1000;decode(){return Promise.resolve()}};
 global.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(...args){draws.push(args)}}),toDataURL:()=> 'data:image/jpeg;base64,AA=='})};
 global.fetch=async(_url,options)=>{payload=JSON.parse(options.body);return{ok:true,json:async()=>({exercise:ai})}};
 const originalRevoke=URL.revokeObjectURL;URL.revokeObjectURL=()=>revoked++;
 await scanWithAI(new File(['x'],'paper.jpg',{type:'image/jpeg'}),reference,'half');
 assert.equal(payload.coordinateSpace,'image');assert.equal(payload.courtType,'half');assert.equal(payload.diagramOnly,true);assert.equal(revoked,0,'Reference data URLs are not revoked');
 const draw=draws[0];assert.ok(Math.abs((draw[1]+reference.play.x0*draw[3])/1000-.1387)<1e-8);assert.ok(Math.abs((draw[2]+reference.play.y0*draw[4])/783-.131)<1e-8,'Photo and review have identical top court alignment');URL.revokeObjectURL=originalRevoke;
 console.log('Scan: weak false contours replaced, reliable players retained, screen/continuation/dribble preserved, duplicate and broken rosters guarded, exact calibrated coordinates, no document search, auth and image resource cleanup passed. Provider mocked; recognition quality still needs a real production scan.');
})().catch(error=>{console.error(error);process.exitCode=1});
