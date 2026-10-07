const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = fs.readFileSync('components/prise-stats-pro/PriseStatsPro.tsx','utf8');
const source = ts.createSourceFile('live.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
// Exercise the real component handlers, isolated from media/session setup.
const wanted=new Set(['isAndOneBasket','ptsOf','themPtsOf','afterFT','afterPD','foulPick','special','courtClick','zonePick','passer','ftSet']);
const handlers=new Map();
function visit(node){
 if(ts.isFunctionDeclaration(node) && wanted.has(node.name?.text)) handlers.set(node.name.text,node.getText(source));
 if(ts.isVariableDeclaration(node) && wanted.has(node.name.getText(source))) handlers.set(node.name.getText(source),`const ${node.getText(source)};`);
 ts.forEachChild(node,visit);
}
visit(source);assert.equal(handlers.size,wanted.size);
const compiled=ts.transpileModule(`
let draft,stage,committed,messages,codingMode,prefs;
const setDraft = next => { draft = next; };
const setStage = next => { stage = next; };
const commit = next => { committed.push(next); draft = next; };
const flash = message => messages.push(message);
const markClipStartBefore = () => {};
const workflowOn = key => prefs[key] === true;
const isPostLikeCodingMode = mode => mode === 'post-match';
${[...handlers.values()].join('\n')}
return {foulPick,special,zonePick,courtClick,passer,ftSet,ptsOf,themPtsOf,
 reset: (value,mode='live',preferences={}) => {draft=value;stage='faute';committed=[];messages=[];codingMode=mode;prefs=preferences;},
 read:()=>({draft,stage,committed,messages})};
`,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText;
const h=new Function(compiled)();
const base=context=>({context,actionType:context==='attaque'?'faute-provoquee':'faute-commise',playerId:'scorer',specialCase:'aucun',ftResults:[],ftAttempts:0,ftMade:0,assist:null,assistPlayerId:null,zone:'old',courtX:.9,courtY:.9});
let cases=0;
for(const mode of ['live','live-individual','post-match','offline']){
 for(const option of ['2plus1','3plus1','us-2plus1','us-3plus1','usc-2plus1','usc-3plus1']){
  for(const context of ['attaque','defense']){
   for(const made of [false,true]){
    h.reset(base(context),mode);h.foulPick(option);
    let state=h.read();assert.equal(state.stage,'zone');assert.equal(state.committed.length,0);assert.equal(state.draft.zone,'');
    assert.equal(state.draft.shotType,option.includes('3plus1')?'3PTS':'2PTS');
    h.zonePick({id:'z2',cx:30,cy:40},{x:31,y:42});state=h.read();
    assert.equal(state.stage,context==='attaque'?'assist':'ft');assert.equal(state.committed.length,0);assert.equal(state.draft.courtX,.31);
    if(context==='attaque'){
     h.passer('scorer');assert.equal(h.read().stage,'assist');assert.equal(h.read().messages.length,1);
     h.passer(made?'passer':'');state=h.read();assert.equal(state.stage,'ft');assert.equal(state.draft.ftAttempts,1);assert.equal(state.draft.ftMade,0);
     assert.equal(state.draft.assist,made);assert.equal(state.draft.assistPlayerId,made?'passer':null);
    }
    h.ftSet(made);state=h.read();assert.equal(state.committed.length,1);assert.equal(state.draft.shotResult,'made');assert.equal(state.draft.ftMade,made?1:0);assert.equal(state.draft.zone,'z2');
    h.ftSet(!made);assert.equal(h.read().committed.length,1,'The bonus FT cannot be entered twice');
    if(option==='2plus1'||option==='3plus1'){
     const score=option==='3plus1'?3:2;
     assert.equal(context==='attaque'?h.ptsOf(state.draft):h.themPtsOf(state.draft),score+(made?1:0));
    }
    cases++;
   }
  }
 }
}
// Missed bonus FT continues to the existing rebound stage and keeps the made basket / assist.
h.reset(base('attaque'),'live',{rebound:true});h.foulPick('2plus1');h.zonePick({id:'z2',cx:20,cy:30});h.passer('passer');h.ftSet(false);
assert.equal(h.read().stage,'rebound');assert.equal(h.read().committed.length,0);assert.equal(h.read().draft.shotResult,'made');assert.equal(h.read().draft.assistPlayerId,'passer');
// The direct result shortcut and legacy chart callback follow the same route.
h.reset(base('attaque'));h.special('3pts1lf');assert.equal(h.read().stage,'zone');
h.courtClick({currentTarget:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})},clientX:25,clientY:50});assert.equal(h.read().stage,'assist');h.passer('');assert.equal(h.read().stage,'ft');
// Ordinary 2/3 FT and technical fouls retain their current routing.
for(const option of ['lf2','lf3']){h.reset(base('attaque'));h.foulPick(option);assert.equal(h.read().stage,'ft');assert.equal(h.read().draft.ftAttempts,option==='lf2'?2:3)}
h.reset(base('attaque'));h.foulPick('technical-for');assert.equal(h.read().stage,'technical-foul-target');
console.log(`LiveStats: ${cases} parcours 2+1 / 3+1, zone, passe, LF et points validés ; LF ordinaires et techniques conservés.`);
