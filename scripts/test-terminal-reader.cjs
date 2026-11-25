const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {readTerminalRoutes,mergeTerminalRoutes}=require("../lib/import/terminal-reader.ts");
const {readScene,assembleDiagram}=require("../lib/ai/diagram-assistant/model.ts");

const w=600,h=500,unit=550;
const at=(x,y)=>({x,y});
function raster(){
  const mask=new Uint8Array(w*h);
  function line(a,b,thickness=1){
    const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));
    for(let i=0;i<=steps;i++){
      const x=Math.round(a.x+(b.x-a.x)*i/steps),y=Math.round(a.y+(b.y-a.y)*i/steps);
      for(let dx=-thickness;dx<=thickness;dx++)for(let dy=-thickness;dy<=thickness;dy++){
        if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)mask[(y+dy)*w+x+dx]=1;
      }
    }
  }
  return {mask,line};
}
function fixture(kind){
  const {mask,line}=raster();
  const markers=[{key:"1",center:at(60,250),radius:22}],end=at(470,250);
  if(kind==="pass"){
    for(let x=83;x<450;x+=24)line(at(x,250),at(x+12,250));
    line(at(450,250),end);
    markers.push({key:"2",center:at(495,250),radius:22});
  }else if(kind==="dribble"){
    let previous=at(83,250);
    for(let x=84;x<=447;x++){
      const point=at(x,250+7*Math.sin((x-83)*Math.PI*2/28));
      line(previous,point);previous=point;
    }
    line(previous,end);
  }else line(at(83,250),end);
  if(kind==="screen")line(at(470,240),at(470,260));
  else{line(end,at(458,242));line(end,at(458,258));}
  return {mask,markers,end};
}
for(const kind of ["cut","dribble","pass","screen"]){
  const {mask,markers,end}=fixture(kind);
  const routes=readTerminalRoutes(mask,w,h,unit,markers);
  assert.equal(routes.length,1,`One visible ${kind}, without invented actions`);
  assert.equal(routes[0].action,kind);
  assert.equal(routes[0].fromPlayer,"1");
  assert.ok(Math.hypot(routes[0].terminal.x-end.x,routes[0].terminal.y-end.y)<5);
  if(kind==="pass")assert.equal(routes[0].toPlayer,"2");
}

const {mask,line}=raster();
const markers=[{key:"a",center:at(70,70),radius:25},{key:"b",center:at(530,70),radius:25}];
line(at(90,90),at(435,350));line(at(435,350),at(424,348));line(at(435,350),at(430,339));
line(at(510,90),at(165,350));line(at(165,350),at(176,348));line(at(165,350),at(170,339));
const crossing=readTerminalRoutes(mask,w,h,unit,markers);
assert.equal(crossing.length,2,"Two crossing arrows yield two actions");
assert.ok(crossing.every(route=>route.action==="cut"));
assert.equal(crossing.find(route=>route.terminal.x>300).fromPlayer,"a");
assert.equal(crossing.find(route=>route.terminal.x<300).fromPlayer,"b");
const falseScreen={action:"screen",from:at(70,70),to:at(300,248),fromPlayer:"a",confidence:.84};
const merged=mergeTerminalRoutes([falseScreen],crossing,unit,p=>p,p=>p);
assert.deepEqual(merged.map(action=>action.action),["cut","cut"],"A confirmed crossing cannot generate an additional screen");
const obscured=raster();
const obscuredMarkers=[{key:"start",center:at(60,250),radius:22},{key:"middle",center:at(270,250),radius:22}];
obscured.line(at(83,250),at(247,250));obscured.line(at(293,250),at(470,250));
obscured.line(at(470,250),at(458,242));obscured.line(at(470,250),at(458,258));
const throughMarker=readTerminalRoutes(obscured.mask,w,h,unit,obscuredMarkers);
assert.equal(throughMarker.length,1,"A shaft interrupted by a marker stays one route");
assert.equal(throughMarker[0].fromPlayer,"start","Aligned ink beyond the marker is the continuation");
const pass=fixture("pass");
const verified=readTerminalRoutes(pass.mask,w,h,unit,pass.markers);
const corrected=mergeTerminalRoutes([{action:"cut",from:at(60,250),to:at(470,250),fromPlayer:"1",confidence:.8}],verified,unit,p=>p,p=>p);
assert.equal(corrected.length,1);
assert.equal(corrected[0].action,"pass");
assert.equal(corrected[0].toPlayer,"2");

const scene=readScene({court:{type:"half"},players:[{key:"p1",label:"1",x:.1,y:.5,team:"att",confidence:.95},{key:"p2",label:"2",x:.7,y:.5,team:"att",confidence:.95}],terminals:[{id:"arrow",kind:"arrow",x:.7,y:.5,confidence:.95,strokeStyle:"dashed",styleConfidence:.95}]},true,"half");
const diagram=assembleDiagram(scene,{actions:[{terminalId:"arrow",action:"cut",fromPlayer:"p1",toPlayer:"p2",from:{x:.1,y:.5},to:{x:.7,y:.5},confidence:.95}]},2);
assert.equal(diagram.actions[0].action,"pass","Visual terminal style is an independent check on the AI action");
assert.ok(diagram.actions[0].confidence<.5,"Disagreements remain visible for review");

console.log("Independent terminal recognition: cuts, dribbles, passes, screens, crossed shafts, false-screen rejection and AI style cross-check passed.");
