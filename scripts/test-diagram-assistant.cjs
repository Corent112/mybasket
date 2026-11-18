const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),path=require('node:path');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
const {readScene,assembleDiagram,coverage,parseVisionJson,previousPhaseHints}=require('../lib/ai/diagram-assistant/model.ts');
const {analyzeMyBasketDiagram}=require('../lib/ai/diagram-assistant/engine.ts');
const {unresolvedScanTerminals}=require('../lib/import/scan-audit.ts');
const {traceGuidedInk,refineDiagramInk}=require('../lib/import/guided-ink.ts');
const {importToPlaquetteSchema}=require('../lib/import/plaquette-converter.ts');
const sharp=require('sharp');
const inventory={court:{type:'half'},players:[{key:'a',label:'9',team:'att',x:.25,y:.3,confidence:.95},{key:'b',label:'7',team:'att',x:.6,y:.7,confidence:.95}],terminals:[{id:'bar',kind:'bar',x:.5,y:.6,confidence:.95},{id:'arrow',kind:'arrow',x:.7,y:.4,confidence:.95}]};
const screen={terminalId:'bar',action:'cut',fromPlayer:'a',from:{x:.25,y:.3},to:{x:.5,y:.6},points:[],confidence:.95};
const cut={terminalId:'arrow',previousTerminalId:'bar',action:'cut',fromPlayer:'a',from:{x:.5,y:.6},to:{x:.7,y:.4},points:[],confidence:.95};
assert.deepEqual(unresolvedScanTerminals(undefined),[],'Empty imports can still display the manual fallback');
const scene=readScene(inventory,true,'half');
let diagram=assembleDiagram(scene,{actions:[cut,screen]},2);assert.deepEqual(diagram.actions.map(a=>a.action),['screen','cut'],'Terminal bar defines a screen and dependencies are topologically ordered');assert.deepEqual(diagram.actions[1].from,diagram.actions[0].to);assert.equal(coverage(diagram).missing.length,0);
assert.equal(unresolvedScanTerminals({...diagram,actions:diagram.actions.slice(0,1)}).length,1,'Deleting a movement immediately restores the missing-trace warning');assert.equal(unresolvedScanTerminals({...diagram,actions:[],scanAudit:{...diagram.scanAudit,dismissed:['bar']}}).length,1);
const extra=assembleDiagram(scene,{actions:[screen,{...cut,terminalId:'new-tip'}]},2);assert.equal(extra.actions.length,2,'An extra proposed action is retained even if it was absent from the first inventory');assert.ok(extra.actions[1].confidence<.5,'Uninventoried action must be manually verified');
const inferred=assembleDiagram(scene,{actions:[screen,{...cut,previousTerminalId:null}]},2);assert.deepEqual(inferred.actions[1].from,inferred.actions[0].to,'A unique, spatially connected continuation is recognized even when its link is absent');
const bad=assembleDiagram(scene,{actions:[screen,{...cut,fromPlayer:'unknown',previousTerminalId:null}]},2);assert.equal(bad.actions[1].fromPlayer,undefined);assert.ok(bad.actions[1].confidence<.5,'Ambiguous ownership remains explicit');
assert.equal(coverage(assembleDiagram(scene,{actions:[{...screen,to:{x:.1,y:.1}}]},2)).missing.length,2,'A claimed terminal with a mismatched arrival is not considered covered');
assert.equal(readScene({...inventory,players:inventory.players.map(p=>({...p,label:'9'}))},true).players[1].label,'?','Duplicate numbers do not invent duplicate identities');
assert.throws(()=>readScene(inventory,false),/coins/,'No uncalibrated guessed positions');assert.equal(parseVisionJson('```json\n{"ok":true}\n```').ok,true);
const perspective=readScene({...inventory,court:{type:'half',corners:[{x:.1,y:.2},{x:.8,y:.1},{x:.9,y:.9},{x:.2,y:.8}],confidence:.95}},false);const p=perspective.map({x:.1,y:.2});assert.ok(Math.abs(p.x-.1387)<1e-7&&Math.abs(p.y-.0655)<1e-7);
const hints=previousPhaseHints(diagram);assert.deepEqual({x:hints[0].x,y:hints[0].y},diagram.actions.at(-1).to);assert.equal(previousPhaseHints({players:[{key:'x',label:'?',x:.2,y:.2}]}).length,0);
(async()=>{
 const calls=[];diagram=await analyzeMyBasketDiagram({calibrated:true,courtType:'half',read:async(_prompt,stage)=>{calls.push(stage);return JSON.stringify(stage==='inventory'?inventory:stage==='paths'?{actions:[screen]}:{actions:[cut]})}});assert.deepEqual(calls,['inventory','paths','repair']);assert.equal(coverage(diagram).missing.length,0);assert.equal(diagram.scanAudit.passes,3);
 calls.length=0;const partial=await analyzeMyBasketDiagram({calibrated:true,read:async(_p,stage)=>{calls.push(stage);if(stage==='paths')throw Error('timeout');return JSON.stringify(inventory)}});assert.deepEqual(calls,['inventory','paths']);assert.equal(coverage(partial).missing.length,2,'Provider failure keeps all visual terminals for review');
 let time=0;calls.length=0;const budgeted=await analyzeMyBasketDiagram({calibrated:true,now:()=>time,read:async(_p,stage)=>{calls.push(stage);time+=50000;return JSON.stringify(stage==='inventory'?inventory:{actions:[screen]})}});assert.deepEqual(calls,['inventory','paths']);assert.equal(coverage(budgeted).missing.length,1,'No unbounded retry after budget');
 const photoCases=[['feutre.jpg',[[1160,520],[990,396],[750,250],[450,147],[120,138]]],['crayon.png',[[134,132],[136,178],[144,210],[159,235]]],['feutre.jpg',[[745,770],[825,710],[908,645],[986,577],[1074,532]]],['crayon.png',[[345,334],[374,312],[400,298],[430,280]]]];
 for(const [file,anchors] of photoCases){
  const {data,info}=await sharp(path.join(__dirname,'fixtures/diagram-assistant',file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const guide=anchors.map(([x,y])=>({x:x/info.width,y:y/info.height})),pixels={width:info.width,height:info.height,data:new Uint8ClampedArray(data)};
  const traced=traceGuidedInk(pixels,guide);assert.ok(traced&&traced.support>.8,`Actual ${file} ink can be followed inside the supplied route corridor`);assert.deepEqual(traced.points[0],guide[0]);assert.deepEqual(traced.points.at(-1),guide.at(-1));
  const line={action:'cut',fromPlayer:'a',from:{x:guide[0].x,y:guide[0].y*.5},to:{x:guide.at(-1).x,y:guide.at(-1).y*.5},points:guide.map(p=>({x:p.x,y:p.y*.5})),confidence:1};
  const fitted=refineDiagramInk({...diagram,players:[{key:'a',label:'9',team:'att',...line.from}],actions:[line]},pixels);assert.equal(fitted.actions[0].geometry,'traced');
  const schema=importToPlaquetteSchema({title:'Reference photo',diagram:fitted});assert.ok(schema.phases[0].lines[0].points.length>2,'Dense geometry survives native drawing conversion without extra blue handles');
 }
 const empty={width:100,height:100,data:new Uint8ClampedArray(40000).fill(255)};assert.equal(traceGuidedInk(empty,[{x:.1,y:.1},{x:.9,y:.9}]),null,'Blank paper cannot become a confirmed vector path');
 console.log('Dedicated assistant: inventory/path audit/recovery, screen continuation, ambiguous ownership, duplicate labels, perspective, previous-phase hints, bounded failures and actual pen/pencil photo ink tracing passed. Human-provided corridors test geometry, not end-to-end AI recognition.');
})().catch(error=>{console.error(error);process.exitCode=1});
