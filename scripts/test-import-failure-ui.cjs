const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {JSDOM}=require('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://mybasket.test'});
for(const key of ['window','document','HTMLElement','HTMLCanvasElement','Event','MouseEvent','Image','File'])global[key]=dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT=true;URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=()=>{};
HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:(_o,key)=>key==='measureText'?()=>({width:10}):()=>{}});
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const local={diagram:{detected:true,courtType:'half',players:[{key:'a',label:'?',x:.2,y:.2,team:'att',labelConfident:false}],actions:[],objects:[],notes:''},warnings:[],confidence:{text:0,diagram:0}};
const actual=Module._load;Module._load=function(request,parent,main){
 if(request==='@/lib/import/local-exercise-scanner')return{scanExerciseLocally:async()=>local};
 if(request==='@/lib/import/free-player-scanner')return{scanPlayersFree:async()=>local};
 if(request==='@/lib/import/ai-scan-assist')return{scanWithAI:async()=>{throw Object.assign(new Error('Le modèle IA configuré est indisponible pour ce compte.'),{status:502,diagnostic:{code:'provider_model',stage:'inventory',reference:'diagnostic-test',retryable:false}})},reconcileScan:x=>x};
 if(request.startsWith('@/'))request=path.resolve(__dirname,'..',request.slice(2));return actual.call(this,request,parent,main);
};
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),Import=require('../components/ai/ExercisePhotoImport.tsx').default;
const root=createRoot(document.getElementById('root'));
(async()=>{
 await act(async()=>root.render(React.createElement(Import,{drawingOnly:true,onImported:()=>{throw Error('Not authorized while unresolved')}})));
 const input=document.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[new File(['x'],'paper.png',{type:'image/png'})]});
 await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setImmediate(resolve))});
 assert.match(document.querySelector('[role=status]').textContent,/diagnostic-test/);assert.match(document.querySelector('[role=status]').textContent,/Brouillon local/);
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='2. Actions').click());
 assert.equal([...document.querySelectorAll('.import-validation button')].at(-1).disabled,true,'Unknown numbers remain blocked after an assistant failure');
 const back=[...document.querySelectorAll('button')].find(b=>b.textContent==='Retour');assert.ok(back);await act(async()=>back.click());
 assert.match(document.body.textContent,/Lecture IA échouée/);assert.ok(document.querySelector('[role=status]'),'Failure remains visible after returning to summary');assert.equal(document.body.textContent.includes('Analyse terminée'),false);
 await act(async()=>root.unmount());console.log('Failed import UI: real fallback notice and diagnostic reference remain visible in review/summary, unknown player blocked and no success heading after failure passed. Local scanner/provider simulated.');
})().catch(error=>{console.error(error);process.exitCode=1});
