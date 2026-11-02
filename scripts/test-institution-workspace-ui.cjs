const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://mybasket.test'});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;global.HTMLElement=dom.window.HTMLElement;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{createRoot}=require('react-dom/client'),{act}=React;
let calls=[],failAssignment=false,selectionPublished=false;
const data={canManage:true,structure:{season_label:'2026-2027'},poleTeam:{id:'pole'},players:[{id:'p1',first_name:'Vincent',last_name:'Dupont',birth_date:'2009-03-12',metadata:{sex:'M'},selections:[]},{id:'p2',first_name:'Léa',last_name:'Bernard',birth_date:'2010-05-10',metadata:{sex:'F'},selections:[]}],partners:[{id:'link',team_id:'partner',season_label:'2026-2027',staff:[],team:{id:'partner',name:'Club U18',category:'U18',metadata:{institutionPartnerStaff:[{name:'Coach',email:'coach@example.test',role:'Coach principal'}]}}}],assignments:[]};
const fetchMock=async(url,init={})=>{const body=init.body?JSON.parse(init.body):null;calls.push({url,body,method:init.method||'GET'});if(url.startsWith('/api/institutionnel/sport/selections')){if(body?.action==='publish_team')selectionPublished=true;return{ok:true,json:async()=>({ok:true,selections:[{id:'sel',team_id:'selection-team',name:'Sélection test',category:'U18',season_label:'2026-2027',gender:'M',players:[],staff:[],in_my_teams:selectionPublished}]})};}if(url.startsWith('/api/institutionnel/pole-roster?'))return{ok:true,json:async()=>structuredClone(data)};if(url==='/api/institutionnel/pole-partners'){if(failAssignment)return{ok:false,json:async()=>({error:'Échec simulé'})};data.assignments=[{id:'a',pole_player_id:'p1',partner_team_id:'partner'}];return{ok:true,json:async()=>({ok:true})};}return{ok:true,json:async()=>({ok:true})};};
function load(file){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports:module.exports,fetch:fetchMock,window,document,console,URL,Date,CustomEvent:window.CustomEvent,require:n=>{
 if(n==='next/link')return{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
 if(n==='./InstitutionalPlayerImport')return{__esModule:true,default:props=>props.open?React.createElement('section',{'aria-label':'Import Excel'},'Import Excel'):null};
 if(n==='@/lib/institutionnel/player-category')return{playerAgeCategory:b=>b.startsWith('2009')?'U18':'U17',categoryMatches:()=>true,withPlayerCategory:p=>p};
 if(n==='@/lib/institutionnel/selection-competitions')return{selectionCategory:v=>v};
 if(n.startsWith('@')||n.startsWith('./Institutional'))return{__esModule:true,default:()=>null};
 return require(n);
 }});return module.exports.default;}
const Workspace=load('components/institutionnel/InstitutionalPoleWorkspace.tsx'),root=createRoot(document.getElementById('root'));
const tick=()=>new Promise(r=>setTimeout(r,0));
async function render(view){await act(async()=>{root.render(React.createElement(Workspace,{structureId:'s',view}));await tick()});}
async function click(el){assert(el,'Expected clickable element');await act(async()=>{el.click();await tick()});}
async function value(el,text){assert(el);await act(async()=>{const proto=el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,text);el.dispatchEvent(new window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await tick()});}
(async()=>{
 await render('players');assert(document.body.textContent.includes('Vincent Dupont'));assert(document.body.textContent.includes('Léa Bernard'));
 await value(document.querySelector('select[aria-label="Sexe"]'),'F');assert(!document.querySelector('.roster').textContent.includes('Vincent Dupont'));assert(document.querySelector('.roster').textContent.includes('Léa Bernard'));
 await value(document.querySelector('select[aria-label="Sexe"]'),'');await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Vincent Dupont')));
 let dialog=document.querySelector('[role=dialog]');assert(dialog);assert(dialog.querySelector('button[aria-label="Fermer"]'));
 await value(dialog.querySelector('select'),'partner');failAssignment=true;await click([...dialog.querySelectorAll('button')].find(b=>b.textContent.includes('Enregistrer le rattachement')));assert(dialog.textContent.includes('Échec simulé'));assert.equal(data.assignments.length,0);
 failAssignment=false;await click([...dialog.querySelectorAll('button')].find(b=>b.textContent.includes('Enregistrer le rattachement')));assert.equal(calls.filter(c=>c.url==='/api/institutionnel/pole-partners'&&c.body?.playerId==='p1').length,2);assert(dialog.textContent.includes('Équipe club rattachée'));
 await click(dialog.querySelector('button[aria-label="Fermer"]'));assert(!document.querySelector('[role=dialog]'));
 await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Importer Excel'));assert(document.querySelector('[aria-label="Import Excel"]'));
 await render('partners');assert(document.body.textContent.includes('Club U18'));await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Activer les accès'));assert(calls.some(c=>c.url==='/api/institutionnel/sport/access'&&c.body.scope==='partner'&&c.body.teamId==='partner'));
 await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Créer une équipe partenaire')));dialog=document.querySelector('[role=dialog]');assert(dialog);assert.equal(dialog.querySelectorAll('input[type=email]').length,2);assert(dialog.textContent.includes('Créer et activer les accès'));await click(dialog.querySelector('button[aria-label="Fermer"]'));assert(!document.querySelector('[role=dialog]'));
 const SelectionManager=load('components/institutionnel/InstitutionalSelectionsManager.tsx');
 await act(async()=>{root.render(React.createElement(SelectionManager,{structureId:'s',structureType:'pole',initialSelectionId:'sel'}));await tick()});
 assert(!document.querySelector('a[href="/equipes/selection-team"]'));
 await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Ajouter à Mes équipes'));
 assert(selectionPublished);assert(document.querySelector('a[href="/equipes/selection-team"]'));assert(calls.some(c=>c.body?.action==='publish_team'));
 await act(async()=>root.unmount());console.log('PASS: real React filters, player drawer open/close, assignment error/retry/success, Excel entry point, scoped staff activation and partner form.');
})().catch(e=>{console.error(e);process.exitCode=1});
