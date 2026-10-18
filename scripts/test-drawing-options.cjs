// Run: NODE_PATH=/tmp/mybasket-drawing-tests/node_modules node scripts/test-drawing-options.cjs
// Uses the actual editor, mocked storage, and real branch/simulation/saving functions.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const Module = require('node:module');
const ts = require('typescript'); const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url:'https://mybasket.test/plaquette', pretendToBeVisual:true });
for (const key of ['window','document','HTMLElement','HTMLCanvasElement','Event','MouseEvent','StorageEvent','CustomEvent','localStorage','sessionStorage']) global[key] = dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = callback => setTimeout(()=>callback(performance.now()), 1); global.cancelAnimationFrame = clearTimeout;
global.Image = class { width=900; height=704; naturalWidth=900; naturalHeight=704; complete=false; };
window.confirm = () => true; global.alert = message => { throw new Error(message); }; window.alert = message => { throw new Error(message); };
window.HTMLCanvasElement.prototype.getContext = function(){return new Proxy({canvas:this,measureText:text=>({width:String(text).length*7}),createLinearGradient:()=>({addColorStop(){}})}, {get:(target,key)=>target[key] ?? (()=>{})});};
window.HTMLCanvasElement.prototype.toDataURL = ()=>'data:image/png;base64,dGVzdA==';
window.HTMLAnchorElement.prototype.click = ()=>{};
let exportedBlob;
URL.createObjectURL = blob => { exportedBlob=blob; return 'blob:test'; }; URL.revokeObjectURL=()=>{};
const player=(id,x,y,hasBall=false)=>({id,x,y,hasBall,ballCount:hasBall?1:0,label:id,team:'att',shape:'circle'});
const phase=(notes='')=>({players:[player('1',.5,.4,true),player('2',.2,.2)],objects:[],lines:[],duration:.1,notes});
const fixture={title:'Test options',current:1,courtType:'half',phases:[phase('Commun 1'),{...phase('Commun 2'),lines:[
 {id:'pass',action:'pass',sourcePlayerId:'1',targetPlayerId:'2',from:{x:.5,y:.4},to:{x:.2,y:.2},order:1},
 {id:'cut',action:'cut',sourcePlayerId:'1',from:{x:.5,y:.4},to:{x:.7,y:.3},order:2,startMode:'withPrevious'},
]},phase('Suite originale')]};
let transfer=structuredClone(fixture); let savedSystem={id:'system',title:'Test options',schemaDataList:[]}; let saves=0;
const supabase={auth:{getUser:async()=>({data:{user:null}})}};
const React=require('react');
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
 const stubs={
  'next/link':({children,...props})=>React.createElement('a',props,children),
  '@/lib/supabase/client':{createClient:()=>supabase},
  '@/lib/exercises':{},
  '@/lib/systems':{getSystem:async()=>savedSystem,updateSystem:async(id,data)=>{assert.equal(id,'system');saves++;savedSystem={...savedSystem,...structuredClone(data)};return savedSystem;}},
  '@/lib/supabase/upload-schema':{uploadSchemaImage:async()=>`https://example.test/schema.png`},
  '@/components/content-navigator/ContentNavigator':props=>React.createElement('button',{onClick:()=>props.onSaveSystem({id:'system'})},'Save fixture'),
  '@/lib/plaquette-transfer':{getPlaquetteTransfer:async()=>transfer ? structuredClone(transfer):null,setPlaquetteTransfer:async()=>{},removePlaquetteTransfer:async()=>{}},
  '@/lib/playbook-series':{listPrivatePlaybooks:async()=>[],listPlaybookSeries:async()=>[],listPersonalSystemTags:async()=>[],ensureDefaultPersonalSystemTags:async()=>[]},
  '@/lib/playbook':{}, '@/lib/drawing-workspace':{listDrawingTeams:async()=>[],ensureDrawingSeasons:async()=>[]},
 };
 if(stubs[request])return stubs[request];
 if(request.startsWith('@/'))request=path.resolve(__dirname,'..',request.slice(2));
 return originalLoad.call(this,request,parent,isMain);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {act}=React; const {createRoot}=require('react-dom/client');
const Editor=require('../app/plaquette/PlaquetteClient.tsx').default;
const helpers=require('../lib/drawing-options.ts');
const button=text=>[...document.querySelectorAll('button')].find(element=>element.textContent.trim()===text);
const flush=async(ms=15)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms))});
const click=async element=>{assert(element,'Expected control');await act(async()=>element.dispatchEvent(new MouseEvent('click',{bubbles:true})));await flush();};
const fill=async(element,value)=>{assert(element);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});};
const exportJson=async()=>{await click([...document.querySelectorAll('.ed-tool')].find(element=>element.textContent.includes('Exporter')));await click(button('📋 JSON'));assert(exportedBlob);return JSON.parse(await exportedBlob.text());};
(async()=>{
 // Helper invariants: no source mutation, old systems unchanged, refs survive serialization.
 assert.deepEqual(helpers.drawingPath(fixture.phases),[0,1,2]);
 let serial=0;const source=JSON.stringify(fixture.phases);
 const test=helpers.addDrawingOption(fixture.phases,1,phase(),'Backdoor',()=>`id${++serial}`);
 assert.equal(JSON.stringify(fixture.phases),source);
 assert.equal(helpers.drawingOptions(test.phases).length,2);
 assert.deepEqual(helpers.drawingPath(test.phases,test.optionId),[0,1,3]);
 assert.deepEqual(helpers.drawingPath(test.phases,test.phases[2].option.id),[0,1,2]);
 assert.equal(helpers.drawingOptions(helpers.removeDrawingOption(test.phases,test.optionId))[0].name,'Option 1');
 // Exercise the actual animation planner, including simultaneous actions, on each branch.
 const sourceFile=ts.createSourceFile('editor.tsx',fs.readFileSync(path.join(__dirname,'../app/plaquette/PlaquetteClient.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const names=['orderedActions','phaseDuration','phaseStartMode','actionDurationMs','buildPhaseActionSched','phaseSpanMs','buildSchedule'];const declarations={};
 const visit=node=>{if(ts.isVariableDeclaration(node)&&names.includes(node.name.getText(sourceFile)))declarations[node.name.getText(sourceFile)]=node.initializer.getText(sourceFile);ts.forEachChild(node,visit);};visit(sourceFile);
 const code=ts.transpileModule('const ACTION_KINDS=["cut","dribble","screen","pass","shoot"]; const ANIM_DEFAULT_SEC=1.5;'+names.map(name=>'const '+name+'='+declarations[name]+';').join(''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const plan=new Function('phasesRef','activeOptionRef','drawingPath','drawingOptions','indices',code+'return buildSchedule(0, indices);');
 for(const option of helpers.drawingOptions(test.phases)){
  const schedule=plan({current:test.phases},{current:option.id},helpers.drawingPath,helpers.drawingOptions);
  assert.deepEqual(schedule.map(item=>item.idx),helpers.drawingPath(test.phases,option.id));
  assert.equal(schedule[1].actSched[0].start,schedule[1].actSched[1].start,'Parallel actions stay parallel');
 }
 assert.deepEqual(plan({current:test.phases},{current:'option-from-another-system'},helpers.drawingPath,helpers.drawingOptions).map(item=>item.idx), helpers.drawingPath(test.phases,helpers.drawingOptions(test.phases)[0].id));
 const groups=helpers.drawingPlaybackGroups(test.phases); assert.deepEqual(groups,[[0,1],[2],[3]]);
 assert.deepEqual(helpers.drawingPlaybackGroups(fixture.phases),[[0,1,2]]);
 assert.deepEqual(plan({current:test.phases},{current:test.optionId},helpers.drawingPath,helpers.drawingOptions,[3]).map(item=>item.idx),[3],'Option-only playback excludes the common beginning');
 let root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(React.createElement(Editor)));await flush(80);
 assert.equal(document.querySelectorAll('.ph-thumb').length,3,'Old linear system must load');
 assert.equal(document.querySelector('.ed-layout').classList.contains('drawing-library-collapsed'),false,'Library/Playbook must be visible by default');
 await click(document.getElementById('phClone'));
 assert.equal(document.querySelectorAll('.ph-thumb').length,4);
 assert.equal(helpers.drawingOptions((await exportJson()).phases).length,0,'Cloning an old system must not create an option');
 await click(document.getElementById('edUndoBtn'));

 await click(button('+ Créer des options ici'));await fill(document.querySelector('.option-create-form input'),'Backdoor');
 await act(async()=>document.querySelector('.option-create-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await flush();
 assert.equal(document.querySelectorAll('.drawing-options-list button').length,2);
 let json=await exportJson();const branches=helpers.drawingOptions(json.phases);const backdoor=branches.find(option=>option.name==='Backdoor');
 assert(backdoor);assert.equal(json.phases[2].notes,'Suite originale');
 let branch=json.phases.find(item=>item.option?.id===backdoor.id);
 assert.equal(branch.players.find(p=>p.id==='1').x,.7,'New branch must inherit final movement');
 assert.equal(branch.players.find(p=>p.id==='1').ballCount,0);assert.equal(branch.players.find(p=>p.id==='2').ballCount,1,'Pass receiver carries ball in next phase');
 await click(document.getElementById('phNext'));
 json=await exportJson();assert.equal(json.phases.filter(item=>item.option?.id===backdoor.id).length,2);
 assert.equal(json.phases.filter(item=>item.option?.name==='Option 1').length,1,'Next must not extend another branch');
 await click(document.querySelector('.drawing-options-list button'));
 assert.equal(document.querySelectorAll('.ph-thumb').length,3,'Other branch displays common + own continuation');
 await click([...document.querySelectorAll('.drawing-options-list button')].find(element=>element.textContent.includes('Backdoor')));
 // Rename through the real blur handler.
 await fill(document.querySelector('.option-settings input'),'Coupe au cercle');
 await act(async()=>document.querySelector('.option-settings input').dispatchEvent(new window.FocusEvent('focusout',{bubbles:true})));await flush();
 json=await exportJson();assert.equal(json.phases.filter(item=>item.option?.name==='Coupe au cercle').length,2);
 // Next at the common fork enters the selected option; it must not create a hidden phase.
 await click(document.querySelectorAll('.ph-thumb')[1]);
 const beforeNext=(await exportJson()).phases.length;
 await click(document.getElementById('phNext'));
 assert.equal((await exportJson()).phases.length,beforeNext);
 // A cloned common fork moves the branch anchor to the clone and remains visible.
 await click(document.querySelectorAll('.ph-thumb')[1]);
 await click(document.getElementById('phClone'));
 let cloned=await exportJson();assert.equal(helpers.drawingPath(cloned.phases).length,3);
 assert.equal(document.querySelectorAll('.ph-thumb').length,5);
 await click(document.getElementById('edUndoBtn'));
 // Separate buttons: option reader starts at the branch, top Animation starts at common.
 await click(button('▶ Lire cette option'));
 assert(document.querySelector('.ph-thumb.active').getAttribute('aria-label').includes('Coupe au cercle'));
 await click(document.getElementById('edAnimateBtn'));
 assert(document.querySelector('.ph-thumb.active').getAttribute('aria-label').includes('Début commun'));
 const visited=new Set();
 for(let frame=0;frame<85;frame++){await flush(50);visited.add(document.querySelector('.ph-thumb.active')?.getAttribute('aria-label') || '');}
 assert([...visited].some(label=>label.includes('Option 1')),'Global playback must advance through the first option');
 assert([...visited].some(label=>label.includes('Coupe au cercle')),'Global playback must advance through the other option');
 await click(button('■ Arrêter'));
 // Actual official save path must preserve all branches, source actions, and positions.
 await click(button('Save fixture'));await flush(150);
 assert.equal(saves,1);const stored=savedSystem.schemaDataList[0];assert(stored);
 assert.equal(helpers.drawingOptions(stored.phases).length,2);assert.equal(stored.phases[1].lines[1].startMode,'withPrevious');
 assert.equal(stored.phases.filter(item=>item.option?.id===backdoor.id).length,2);
 // Reopen exactly what the official save persisted.
 transfer=structuredClone(stored);await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(React.createElement(Editor)));await flush(80);
 assert.equal(document.querySelectorAll('.drawing-options-list button').length,2);
 await click([...document.querySelectorAll('.drawing-options-list button')].find(element=>element.textContent.includes('Coupe au cercle')));
 assert.equal(document.querySelectorAll('.ph-thumb').length,4);
 await click(button('Supprimer cette option'));assert.equal(document.querySelectorAll('.drawing-options-list button').length,1);
 await click(document.getElementById('edUndoBtn'));assert.equal(document.querySelectorAll('.drawing-options-list button').length,2,'Undo restores branch and its phases');
 await act(async()=>root.unmount());
 console.log('Drawing options: legacy load, final positions/possession, independent branches, rename, official save/reopen, simultaneous actions, delete and undo passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
