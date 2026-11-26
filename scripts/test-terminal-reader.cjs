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

const {cleanImportedPath}=require("../lib/import/curve-handle.ts");
const start=at(.2,.2),finish=at(.8,.2);
const jitter=Array.from({length:61},(_,i)=>at(.2+i*.01,.2+(i%2?.004:-.004)));
assert.deepEqual(cleanImportedPath(start,finish,jitter,"cut"),[start,finish]);
assert.deepEqual(cleanImportedPath(start,finish,jitter,"pass"),[start,finish]);
const arcPoints=Array.from({length:41},(_,i)=>at(.2+i*.015,.2+.12*Math.sin(i*Math.PI/40)+(i%2?.003:-.003)));
const cleaned=cleanImportedPath(start,finish,arcPoints,"cut");
assert.deepEqual(cleaned[0],start);
assert.deepEqual(cleaned.at(-1),finish);
assert.ok(Math.max(...cleaned.map(p=>p.y))>.3,"Real curved movement survives smoothing");
const duplicateFixture=fixture("cut");
const verifiedCut=readTerminalRoutes(duplicateFixture.mask,w,h,unit,duplicateFixture.markers);
const full={action:"cut",from:at(60,250),to:at(470,250),fromPlayer:"1",points:[at(60,250),at(270,250),at(470,250)]};
const partial={...full,to:at(320,250),points:[at(60,250),at(190,250),at(320,250)]};
assert.equal(mergeTerminalRoutes([full,partial],verifiedCut,unit,p=>p,p=>p).length,1,"Incomplete duplicate is removed only with verified longer path");
const interrupted=raster();
interrupted.line(at(83,250),at(245,250));
interrupted.line(at(252,250),at(470,250));
interrupted.line(at(470,250),at(458,242));
interrupted.line(at(470,250),at(458,258));
assert.equal(readTerminalRoutes(interrupted.mask,w,h,unit,[{key:"1",center:at(60,250),radius:22}]).length,1,"Small ink gap must not truncate an action");

const {recoverArrivalPasses}=require("../lib/import/terminal-reader.ts");
const relay=raster();
const relayMarkers=[{key:"2",center:at(470,390),radius:20},{key:"4",center:at(180,100),radius:20}];
const relayActions=[
  {action:"dribble",from:at(470,390),to:at(500,320),fromPlayer:"2",confidence:.85},
  {action:"cut",from:at(180,100),to:at(130,320),fromPlayer:"4",confidence:.85},
];
for(let x=145;x<490;x+=22)relay.line(at(x,320),at(x+11,320));
relay.line(at(130,320),at(145,320));
relay.line(at(130,320),at(141,313));relay.line(at(130,320),at(141,327));
relay.line(at(180,120),at(130,320));
const recovered=recoverArrivalPasses(relay.mask,w,h,unit,relayMarkers,relayActions,p=>p,p=>p);
assert.equal(recovered.length,3,"Pass from dribble arrival to overlapping cut tip must survive");
assert.equal(recovered[2].action,"pass");assert.equal(recovered[2].fromPlayer,"2");assert.equal(recovered[2].toPlayer,"4");
assert.equal(recoverArrivalPasses(relay.mask,w,h,unit,relayMarkers,recovered,p=>p,p=>p).length,3,"Recovery is idempotent");

// Raster crop of the reported phase 2, with the two movement arrivals
// supplied independently. This isolates pass recovery from player OCR.
const reportedMask=require("node:zlib").gunzipSync(Buffer.from(fs.readFileSync(require("node:path").join(__dirname,"fixtures/diagram-assistant/arrival-pass-mask.b64"),"utf8"),"base64"));
const reportedMarkers=[{key:"2",center:at(273,337),radius:17},{key:"4",center:at(130,148),radius:17}];
const reportedActions=[
  {action:"dribble",from:at(273,337),to:at(357,313),fromPlayer:"2",confidence:.85},
  {action:"cut",from:at(130,148),to:at(153,328),fromPlayer:"4",confidence:.85},
];
const reported=recoverArrivalPasses(reportedMask,459,420,459,reportedMarkers,reportedActions,p=>p,p=>p);
assert.equal(reported.length,3);
assert.equal(reported[2].action,"pass");
assert.equal(reported[2].fromPlayer,"2");
assert.equal(reported[2].toPlayer,"4");

const {auditLocalInk,rejectCrossingScreens}=require("../lib/import/terminal-reader.ts");
const straightCross=raster();
straightCross.line(at(83,250),at(470,250));
straightCross.line(at(470,250),at(458,242));straightCross.line(at(470,250),at(458,258));
straightCross.line(at(270,190),at(270,310));
const fake={action:"screen",from:at(60,250),to:at(270,250),fromPlayer:"1",points:[at(60,250),at(190,250),at(270,250)],confidence:.95};
const checked=rejectCrossingScreens(straightCross.mask,w,h,unit,[{...fake}],p=>p);
assert.equal(checked[0].action,"cut","A continuing shaft cannot terminate in a screen even before the full route is recovered");
assert.ok(checked[0].confidence<.5);
const all=auditLocalInk(straightCross.mask,w,h,unit,[{key:"1",center:at(60,250),radius:22}],[fake],p=>p,p=>p);
assert.ok(all.actions.some(action=>action.action==="cut"&&Math.hypot(action.to.x-470,action.to.y-250)<5));
assert.ok(!all.actions.some(action=>action.action==="screen"));
const actualScreen=fixture("screen");
const screenAudit=auditLocalInk(actualScreen.mask,w,h,unit,actualScreen.markers,[],p=>p,p=>p);
assert.equal(screenAudit.actions[0].action,"screen");
assert.ok(screenAudit.scanAudit.terminals.some(terminal=>terminal.kind==="bar"));
const unknown=fixture("cut");
const unowned=auditLocalInk(unknown.mask,w,h,unit,[{key:"other",center:at(80,80),radius:22}],[],p=>p,p=>p);
assert.ok(unowned.actions.some(action=>!action.fromPlayer&&action.confidence<.5),"A visible arrow with an unknown owner remains reviewable");
const {unresolvedScanTerminals}=require("../lib/import/scan-audit.ts");
const auditDiagram={scanAudit:{terminals:[{id:"p",kind:"arrow",strokeStyle:"dashed",styleConfidence:.9,x:.6,y:.2},{id:"c",kind:"arrow",x:.602,y:.2}]},actions:[{action:"cut",to:{x:.6,y:.2}}]};
assert.deepEqual(unresolvedScanTerminals(auditDiagram).map(t=>t.id),["p"]);
auditDiagram.actions.push({action:"pass",to:{x:.6,y:.2}});
assert.equal(unresolvedScanTerminals(auditDiagram).length,0);

const {reconcileDigitalRoutes,orderDigitalActions}=require("../lib/import/digital-stroke-graph.ts");
const sharedTip=at(300,240);
const sharedRoutes=[{key:"a",from:at(150,240),inward:at(-1,0)},{key:"b",from:at(300,100),inward:at(0,-1)}].map(({key,from,inward})=>({
  action:"cut",fromPlayer:key,points:[from,sharedTip],terminal:{...sharedTip,kind:"arrow",inward,size:7,score:.95},confidence:.9,
}));
const separate=reconcileDigitalRoutes([],sharedRoutes,unit,p=>p,p=>p);
assert.deepEqual(separate.map(a=>a.fromPlayer),["a","b"],"Two observed paths sharing one tip remain distinct");
const chain=[
  {action:"pass",fromPlayer:"a",toPlayer:"b",from:at(300,300),to:at(500,280)},
  {action:"dribble",fromPlayer:"a",from:at(200,200),to:at(300,300)},
  {action:"cut",fromPlayer:"a",from:at(100,100),to:at(200,200)},
];
assert.deepEqual(orderDigitalActions(chain,unit,p=>p).map(a=>a.action),["cut","dribble","pass"]);
