const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {Storage,transfer}=require('./test-exercise-drawing-open.cjs');
const source=fs.readFileSync('app/plaquette/PlaquetteClient.tsx','utf8');
function capture(fail=-1){
 const phases=[{id:'common'},{id:'option-a'},{id:'option-b'}];let playing=true,rendered=-1,stops=0;
 const c={exports:{},Error,canvasRef:{current:{toDataURL(){assert.equal(playing,false);if(rendered===fail)throw Error('tainted canvas');return `data:image/png;base64,phase-${rendered}`}}},currentRef:{current:2},phasesRef:{current:phases},stopAnim(){playing=false;stops++},render(){rendered=c.currentRef.current}};
 vm.createContext(c);vm.runInContext(ts.transpileModule(source.slice(source.indexOf('const captureAllPhaseImages = async'),source.indexOf('const exportPng ='))+'\nexports.capture=captureAllPhaseImages;',{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,c);return{c,stops:()=>stops};
}
function stalledDb(){return{open(){const req={};setTimeout(()=>{req.result={objectStoreNames:{contains:()=>true},close(){},transaction(){return{objectStore(){return{put(){return{}},get(){return{}},delete(){return{}}}},abort(){}}}};req.onsuccess?.()},0);return req}}}
(async()=>{
 const ok=capture();const images=await ok.c.exports.capture();assert.deepEqual(Array.from(images),[0,1,2].map(i=>`data:image/png;base64,phase-${i}`));assert.equal(ok.c.currentRef.current,2);assert.equal(ok.stops(),1);assert.equal(ok.c.phasesRef.current.length,3);
 const bad=capture(1);await assert.rejects(bad.c.exports.capture(),/Aucun dessin n’a été retiré/);assert.equal(bad.c.currentRef.current,2);assert.equal(bad.c.phasesRef.current.length,3);
 const storage=new Storage(10000),t=transfer(storage,stalledDb(),true);const started=Date.now();await t.setPlaquetteTransfer('result',{phases:['all','three','kept']});assert.deepEqual(JSON.parse(JSON.stringify(await t.getPlaquetteTransfer('result'))),{phases:['all','three','kept']});assert(Date.now()-started<1000);await t.removePlaquetteTransfer('result');assert.equal(await t.getPlaquetteTransfer('result'),null);
 console.log('PASS: actual capture returns every common/option phase during animation, restores selection, rejects partial capture; stalled IDB transactions fall back and remain readable/removable.');
})().catch(e=>{console.error(e);process.exitCode=1});
