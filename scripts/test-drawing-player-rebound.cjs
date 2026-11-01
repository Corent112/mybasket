const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const helper={exports:{}};vm.runInNewContext(compile(fs.readFileSync('lib/drawing-shooting-machine.ts','utf8')),helper);
const source=fs.readFileSync('app/plaquette/PlaquetteClient.tsx','utf8'),ast=ts.createSourceFile('drawing.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),names=['addOwnerBall','removeOwnerBall','buildBallEvents','initialBallOwners','ownersAtClock','ballsPosAtClock','computePhaseFinalState'],functions={};
function visit(n){if(ts.isVariableDeclaration(n)&&names.includes(n.name.getText(ast)))functions[n.name.getText(ast)]=n.initializer.getText(ast);ts.forEachChild(n,visit)}visit(ast);
const phase={players:[{id:'shooter',label:'1',x:.4,y:.4,ballCount:1,hasBall:true},{id:'rebounder',label:'2',x:.6,y:.2,ballCount:0,hasBall:false}],objects:[],lines:[]};
const point=(id,clock=0)=>{const p=phase.players.find(p=>p.id===id);return p?{x:p.x+clock/10000,y:p.y}:null};
const context={exports:{},...helper.exports,phasesRef:{current:[phase]},ballEventsRef:{current:[]},courtRef:{current:'half'},playerBallCount:p=>p.ballCount||0,phasePlayerPosAt:(_,id,clock)=>point(id,clock),playerPosAtClock:(_,id,clock)=>point(id,clock),lateralBasketPoint:()=>({x:.5,y:.1}),basketFor:()=>({x:.5,y:.1}),offsetBallPoint:p=>p,ease:t=>t,orderedActions:p=>p.lines,buildPhaseActionSched:()=>phase.lines.map(line=>({line,start:0,end:1000,dur:1000})),phaseSpanMs:()=>1000};
vm.createContext(context);vm.runInContext(compile(names.map(n=>`const ${n}=${functions[n]};`).join('\n')+`\nexports.result={${names.join(',')}};`),context);const f=context.exports.result;
function schedule(){return[{idx:0,start:0,span:1000,end:1000,actSched:context.buildPhaseActionSched()}]}
for(const receiver of ['shooter','rebounder']){
 phase.lines=[{id:'shot',action:'shoot',sourcePlayerId:'shooter',target:'basket',targetBasketId:'hoop',to:{x:.5,y:.1},returnPlayerId:receiver}];const sched=schedule(),events=f.buildBallEvents(sched);assert.equal(events[0].returnPlayerId,receiver);assert.equal(events[0].target,receiver);assert.equal(events[0].basketPt.y,.1);
 assert.equal(f.ownersAtClock(sched,events,500).get('shooter'),undefined);assert.equal(f.ownersAtClock(sched,events,1000).get(receiver),1);
 const final=f.computePhaseFinalState(0);assert.equal(final.players.find(p=>p.id===receiver).hasBall,true);assert.equal(final.players.find(p=>p.id===receiver).ballCount,1);assert.equal(final.players.filter(p=>p.hasBall).length,1);
 const ball=f.ballsPosAtClock(sched,events,900)[0],target=point(receiver,900),t=.6;assert(Math.abs(ball.x-(.5+(target.x-.5)*t))<.00001);
 const saved=JSON.parse(JSON.stringify(phase));assert.equal(saved.lines[0].returnPlayerId,receiver);assert.equal(saved.lines[0].target,'basket');assert.equal(saved.lines[0].to.y,.1);
}
phase.lines[0].returnPlayerId=undefined;let evs=f.buildBallEvents(schedule());assert.equal(f.ownersAtClock(schedule(),evs,1000).get('shooter'),undefined);assert.equal(f.ownersAtClock(schedule(),evs,1000).get('rebounder'),undefined);
phase.lines[0].returnPlayerId='deleted';evs=f.buildBallEvents(schedule());assert.equal(evs[0].returnPlayerId,undefined);assert.equal(evs[0].target,null);
assert(source.includes('optgroup label="Joueurs · rebond"'));assert(source.includes("returnPlayerId&&has('player',z.returnPlayerId)"));
console.log('PASS: own/other-player rebound, basket target preserved, moving receiver animation, next-phase ball ownership, saved refs, absent receiver safety and player recovery UI');
