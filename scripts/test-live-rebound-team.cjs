const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
const source=ts.createSourceFile('live.tsx',fs.readFileSync('components/prise-stats-pro/PriseStatsPro.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['isMyRebound','reboundNext','rebPick','rebWho','changeQ']);const found=new Map();
function visit(n){if(ts.isVariableDeclaration(n)&&names.has(n.name.getText(source)))found.set(n.name.getText(source),'const '+n.getText(source)+';');ts.forEachChild(n,visit);}visit(source);assert.equal(found.size,names.size);
const h=new Function(ts.transpileModule(`let draft,codingMode,q,perQ,committed,stage;const sharedFollowerRef={current:false};const markClipEndNow=()=>{};const commit=d=>committed.push(d);const setDraft=d=>draft=d;const POSS=c=>c==='attaque'?'defense':'attaque';const setQ=n=>q=n;const setPerQ=f=>perQ=f(perQ);const getRawCodingTime=()=>null;const periodDuration=()=>600;const setSecs=()=>{};const setRunning=()=>{};const emptyDraft=()=>({});const setStage=s=>stage=s;${[...found.values()].join('\n')} return {rebPick,rebWho,reboundNext,changeQ,reset:(mode,context)=>{codingMode=mode;draft={context,actionType:'tir',reboundPlayerId:'stale'};committed=[];q=1;perQ={1:{us:20,them:18}};},read:()=>({draft,committed,q,perQ})};`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText)();
for(const mode of ['live','live-individual'])for(const [context,type,next] of [['attaque','off','attaque'],['defense','def','attaque']]){
 h.reset(mode,context);h.rebPick(type);assert.equal(h.read().committed.length,0);assert.equal(h.read().draft.reboundPlayerId,null);assert.equal(h.reboundNext(context,type),next);
 h.rebWho('p1');assert.equal(h.read().committed[0].reboundPlayerId,'p1');
 for(const [touch,next] of [['touche-pour','attaque'],['touche-contre','defense']]){h.reset(mode,context);h.rebPick(type);h.rebPick(touch);assert.equal(h.read().committed.length,1);assert.equal(h.read().committed[0].reboundPlayerId,null);assert.equal(h.reboundNext(context,touch),next);}
 h.reset(mode,context);h.changeQ(1);assert.deepEqual(h.read().perQ,{1:{us:20,them:18},2:{us:0,them:0}});h.changeQ(-1);assert.deepEqual(h.read().perQ[1],{us:20,them:18});
}
console.log('Live individuel et collectif : attribution rebond, touches pour/contre, conservation des scores au changement de QT validées.');
