const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const sharp = require("sharp");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
// CI can isolate the geometry from OCR downloads. With MYBASKET_TEST_OCR=1,
// run the same glyph crops through the installed Tesseract executable.
const realOcr=process.env.MYBASKET_TEST_OCR==="1";
const ocr=require.resolve("../lib/import/ocr.ts");
require.cache[ocr]={id:ocr,filename:ocr,loaded:true,exports:{ocrLandmarkGlyph:async(canvas,single)=>{
  if(!realOcr)return null;
  const png=await sharp(canvas.pixels,{raw:{width:canvas.width,height:canvas.height,channels:1}}).png().toBuffer();
  const result=require("node:child_process").spawnSync("tesseract",["stdin","stdout","--psm",single?"10":"8","-c","tessedit_char_whitelist=0123456789","tsv"],{input:png,encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  const row=result.stdout.trim().split("\n").at(-1).split("\t");
  return /^\d{1,2}$/.test(row[11])?{text:row[11],confidence:Number(row[10])/100}:null;
}}};
global.document={createElement:()=>{
  const canvas={width:0,height:0};
  const context={fillStyle:"#fff",drawImage(source){canvas.data=source.data;},getImageData(){return{data:canvas.data};},
    fillRect(x,y,width,height){
      if(!realOcr)return;
      if(!canvas.pixels||canvas.pixels.length!==canvas.width*canvas.height)canvas.pixels=Buffer.alloc(canvas.width*canvas.height,255);
      const gray=this.fillStyle==="#fff"?255:this.fillStyle==="#000"?0:Number(this.fillStyle.match(/\d+/)?.[0]||0);
      for(let j=Math.max(0,Math.floor(y));j<Math.min(canvas.height,Math.ceil(y+height));j++)
        for(let i=Math.max(0,Math.floor(x));i<Math.min(canvas.width,Math.ceil(x+width));i++)canvas.pixels[j*canvas.width+i]=gray;
    }};
  canvas.getContext=()=>context;
  return canvas;
}};
const {readColoredCourtDiagram}=require("../lib/import/colored-court-diagram.ts");
const {courtToCanonical}=require("../lib/import/court-geometry.ts");
const {unresolvedScanTerminals}=require("../lib/import/scan-audit.ts");
const {importToPlaquetteSchema}=require("../lib/import/plaquette-converter.ts");
const phases=[
  {players:[[1,523,375],[2,101,149],[3,558,127],[4,251,243],[5,363,387]],
   actions:[["pass",1,387,389,5],["cut",1,375,169],["cut",2,286,363],["screen",3,455,258],["screen",4,219,199],["dribble",5,291,353]]},
  {players:[[1,380,174],[2,383,395],[3,458,261],[4,222,216],[5,296,360]],
   actions:[["cut",1,246,387],["dribble",2,478,372],["pass",2,246,389,1],["cut",3,100,126],["screen",4,259,180],["screen",5,247,302]]},
  {players:[[1,247,388],[2,475,374],[3,103,124],[4,297,191],[5,247,302]],
   actions:[["dribble",1,150,274],["cut",2,555,172],["screen",4,479,280],["screen",5,208,349],["cut",5,309,240]]},
];
(async()=>{
  const diagrams=[];
  for(let phase=0;phase<phases.length;phase++){
    const fixture=phases[phase];
    const {data,info}=await sharp(path.join(__dirname,"fixtures/diagram-assistant/original-phases",`phase-${phase+1}.png`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const diagram=await readColoredCourtDiagram({width:info.width,height:info.height,data});
    assert.ok(diagram);
    assert.equal(diagram.players.length,5);
    const a=courtToCanonical({x:0,y:0},"half"),b=courtToCanonical({x:1,y:1},"half");
    const pix=p=>[diagram.play.x0+(p.x-a.x)/(b.x-a.x)*(diagram.play.x1-diagram.play.x0),diagram.play.y0+(p.y-a.y)/(b.y-a.y)*(diagram.play.y1-diagram.play.y0)];
    const labels=new Map();
    for(const player of diagram.players){
      const [x,y]=pix(player);
      const entry=fixture.players.find(([,px,py])=>Math.hypot(px-x,py-y)<8);
      assert.ok(entry,"Marker centres must be detected independently");
      if(realOcr)assert.equal(player.label,String(entry[0]),"OCR must read the actual jersey number");
      labels.set(player.key,entry[0]);
    }
    assert.equal(diagram.actions.length,fixture.actions.length,`Phase ${phase+1}: every action, no duplicates`);
    for(const [kind,owner,x,y,target] of fixture.actions){
      const action=diagram.actions.find(action=>action.action===kind&&labels.get(action.fromPlayer)===owner&&Math.hypot(pix(action.to)[0]-x,pix(action.to)[1]-y)<12);
      assert.ok(action,`Phase ${phase+1}: ${kind} from player ${owner}`);
      if(target)assert.equal(labels.get(action.toPlayer),target);
    }
    assert.equal(unresolvedScanTerminals(diagram).length,0);
    const index=(kind,owner)=>diagram.actions.findIndex(action=>action.action===kind&&labels.get(action.fromPlayer)===owner);
    if(phase===0){
      assert.ok(index("pass",1)<index("dribble",5));
      const cut=diagram.actions[index("cut",2)];
      assert.ok(cut.points.some(p=>Math.hypot(pix(p)[0]-212,pix(p)[1]-200)<14),"Player 2 continues through the screen crossing");
    }
    if(phase===1){
      assert.ok(index("dribble",2)<index("pass",2)&&index("cut",1)<index("pass",2));
      const cut=diagram.actions[index("cut",1)];
      assert.ok(cut.points.some(p=>Math.hypot(pix(p)[0]-209,pix(p)[1]-235)<16),"Player 1 follows the line behind the other marker");
    }
    if(phase===2){
      assert.ok(index("screen",5)<index("cut",5));
      const cut=diagram.actions[index("cut",5)],screen=diagram.actions[index("screen",5)];
      assert.ok(Math.hypot(pix(cut.from)[0]-pix(screen.to)[0],pix(cut.from)[1]-pix(screen.to)[1])<8);
    }
    diagrams.push({...diagram,detected:true,courtType:"half",notes:""});
    console.log(`Original phase ${phase+1}: 5 markers, ${diagram.actions.length} actions, owners, endpoints, ordering and coverage passed.`);
  }
  if(realOcr){
    const native=importToPlaquetteSchema({title:"Regression",diagram:diagrams[0],diagrams});
    assert.deepEqual(native.phases.map(phase=>phase.lines.length),[6,6,5]);
    assert.ok(native.phases.every(phase=>phase.lines.every(line=>line.sourcePlayerId)));
    console.log("Native drawing conversion: all 17 actions retained.");
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
