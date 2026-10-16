// Exercise the actual local renderer with a silent title card, without external video files.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
let now=0,loads=0,stops=0,draws=[],fills=0;
Object.defineProperty(global,'performance',{value:{now:()=>{now+=25;return now}},configurable:true});
const ctx={font:'96px Arial',textAlign:'center',globalAlpha:1,save(){},restore(){},translate(){},rotate(){},fillRect(){fills++},measureText(text){return {width:text.length*Number(this.font.match(/([\d.]+)px/)[1])*.5}},fillText(text,x,y,maxWidth){draws.push({text,x,y,maxWidth,font:this.font})}};
const stream={getTracks:()=>[{stop:()=>stops++}]};
const canvas={getContext:()=>ctx,captureStream:()=>stream};
const video={pause(){},load(){loads++},removeAttribute(){}};
global.document={createElement:type=>type==='canvas'?canvas:video};
global.MediaRecorder=class {static isTypeSupported(){return true}constructor(_stream,{mimeType}){this.mimeType=mimeType}start(){}stop(){this.ondataavailable({data:new Blob(['rendered-frame'])});this.onstop()}};
(async()=>{
 const {exportTimelineLocally}=require('../lib/local-montage-export.ts');
 const card={type:'title',timelineStart:0,duration:.2,text:'ATTAQUE\nPick & roll',width:70,fontSize:48};
 const result=await exportTimelineLocally([{type:'card',url:'',start:0,end:0,duration:.2,card}],[],'titre-test');
 assert.ok(result.blob.size>0);assert.equal(result.extension,'mp4');assert.equal(loads,1,'Only final cleanup loads the video: title cards never wait for video metadata');
 assert.equal(stops,1);assert.ok(fills>0);assert.ok(draws.some(row=>row.text==='ATTAQUE'));assert.ok(draws.some(row=>row.text==='Pick & roll'));
 assert.ok(new Set(draws.map(row=>row.y)).size>1,'Multiline title is rendered on separate lines');
 draws=[];now=0;
 await exportTimelineLocally([{type:'card',url:'',start:0,end:0,duration:.2}], [{...card,text:'Titre superposé'}]);
 assert.ok(draws.some(row=>row.text==='Titre superposé'),'Trailing black frames still render the overlay at its scheduled time');
 console.log('Montage export: carton autonome sans fichier vidéo, texte multiligne, overlays sur fond noir et nettoyage du flux validés.');
})().catch(error=>{console.error(error);process.exitCode=1});
