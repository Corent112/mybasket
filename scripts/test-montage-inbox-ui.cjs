// Integration check of the actual studio in a simulated DOM (no production session).
// Run with JSDOM_MODULE_PATH pointing to an external jsdom installation.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require(process.env.JSDOM_MODULE_PATH || 'jsdom');
const dom = new JSDOM('<div id="root"></div>', { url:'https://mybasket.test/montages?teamId=team', pretendToBeVisual:true });
for (const key of ['window','document','HTMLElement','HTMLCanvasElement','HTMLMediaElement','Event','MouseEvent','File','StorageEvent']) global[key] = dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = callback => setTimeout(callback, 10);
global.cancelAnimationFrame = clearTimeout;
window.HTMLMediaElement.prototype.pause = () => {};
window.HTMLMediaElement.prototype.load = () => {};
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
const actions = [
 {id:'a',team_id:'team',match_id:'m1',player_id:'p1',quarter:1,action_type:'tir',shot_result:'made',clip_start:10,clip_end:16},
 {id:'b',team_id:'team',match_id:'m2',player_id:'p2',quarter:2,action_type:'interception',clip_start:40,clip_end:48},
 {id:'c',team_id:'team',match_id:'m1',player_id:'p1',quarter:1,action_type:'passe',clip_start:60,clip_end:65},
];
const matches = [{id:'m1',team_id:'team',opponent:'Nanterre',match_date:'2026-10-01'}, {id:'m2',team_id:'team',opponent:'Monaco',match_date:'2026-10-05'}];
const playlistItems=[];
const tables={teams:[{id:'team',name:'MyBasket'}],match_actions:actions,match_stats:matches,livestat_montages:[],livestat_clip_favorites:[],livestat_clip_themes:[{id:'inbox',name:'Clips reçus',sort_order:0,user_id:'user',team_id:'team',livestat_clip_theme_items:[]}]};
const client={auth:{getUser:async()=>({data:{user:{id:'user'}}})},channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{},from:table=>{
 let filters=[]; let mode='select'; let row;
 const result=()=>({data:mode==='select' ? (tables[table] || []).filter(item=>filters.every(([key,val])=>item[key]===undefined || item[key]===val)) : row,error:null});
 const q={select:()=>q,eq:(key,val)=>{filters.push([key,val]);return q},order:()=>q,limit:()=>q,
  maybeSingle:async()=>{const r=result(); return {...r,data:Array.isArray(r.data)?r.data[0] || null:r.data}},
  single:async()=>({data:row,error:null}),insert:value=>{mode='insert';row={id:'new',...value};return q},
  upsert:async value=>{playlistItems.push(value);return {error:null}},then:resolve=>Promise.resolve(resolve(result()))};return q;
},rpc:async()=>({error:{code:'PGRST202',message:'not installed in test'}})};
const tags={label:key=>key || ''};
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
 const stubs={
  '@/lib/supabase/client':{createClient:()=>client},
  '@/lib/livestat-tags':{useLivestatTags:()=>tags},
  '@/lib/local-match-project':{fingerprintVideo:async()=>({})},
  '@/lib/local-video-registry':{getLocalMatchVideoUrl:()=>null,setLocalMatchVideo:()=>{}},
  '@/hooks/useLocalMatchVideoVersion':{__esModule:true,default:()=>0},
  '@/lib/video/match-video-resolver':{restoreMatchVideoForClip:async()=>({video:null})},
  '@/components/video/LocalMatchVideoButton':{__esModule:true,default:()=>null},
  '@/components/video-editor/ClipThumbnail':{__esModule:true,default:()=>null},
  '@/lib/local-montage-export':{},
 };
 if(stubs[request]) return stubs[request];
 if(request==='@/lib/montage/multi-match-data'){
  const real=originalLoad.call(this,path.resolve(__dirname,'../lib/montage/multi-match-data.ts'),parent,isMain);
  return {...real,loadMontageLibrary:async()=>({actions:actions.map(a=>real.synchronizeMontageAction(a,matches.find(m=>m.id===a.match_id))),matches,players:[{id:'p1',name:'NZAPAKETE'},{id:'p2',name:'ONDZE'}]})};
 }
 if(request.startsWith('@/')) request=path.resolve(__dirname,'..',request.slice(2));
 return originalLoad.call(this,request,parent,isMain);
};
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const React=require('react');
const {act}=React;
const {createRoot}=require('react-dom/client');
const Studio=require('../components/video-editor/MontageStudio.tsx').default;
const queue=require('../lib/montage/incoming-clips.ts');
const root=createRoot(document.getElementById('root'));
const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30))})};
const click=async element=>{assert.ok(element,'Expected visible control');await act(async()=>{element.dispatchEvent(new MouseEvent('click',{bubbles:true}))});await flush()};
const button=text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text);
const count=()=>document.querySelectorAll('.mp-story-card').length;
const drop=async(target,payload)=>{const event=new Event('drop',{bubbles:true,cancelable:true});event.dataTransfer={getData:key=>payload[key] || ''};await act(async()=>target.dispatchEvent(event));await flush()};
(async()=>{
 queue.enqueueIncomingClip('user','team',{actionId:'a',matchId:'m1',clipStart:11,clipEnd:15,title:'NZAPAKETE · 3PTS'});
 queue.enqueueIncomingClip('user','team',{actionId:'b',matchId:'m2',clipStart:41,clipEnd:47,title:'ONDZE · Interception'});
 await act(async()=>{root.render(React.createElement(Studio,{initialTeamId:'team'}))});await flush();await flush();
 assert.equal(count(),0,'Reception must not insert into the film');
 assert.equal(document.querySelectorAll('.mp-match-clip').length,2,'Two matches received in the same playlist');
 assert.equal(playlistItems.length,2,'Existing source references persisted in existing playlist tables');
 const pending=queue.readIncomingClips('user','team');
 assert.equal(await queue.waitForIncomingReceipt('user','team',pending[0].transferId,5),true);
 await click(document.querySelector('.mp-match-clip-open'));
 assert.ok(document.querySelector('.mp-source-preview'),'Preview appears in the central reader');assert.equal(count(),0);
 await click(document.querySelector('.mp-source-card .gold'));assert.equal(count(),1);
 // Changing filters does not discard selection, and the batch insertion uses edited absolute bounds.
 await click(button('Revenir au film'));
 await click(document.querySelector('.mp-match-clip input'));
 const select=document.querySelector('[aria-label="Filtrer par match"]');
 await act(async()=>{select.value='m1';select.dispatchEvent(new Event('change',{bubbles:true}))});await flush();
 assert.ok(document.body.textContent.includes('1 actions sélectionnées'));
 await click([...document.querySelectorAll('button')].find(el=>el.textContent.includes('Ajouter la sélection au montage')));assert.equal(count(),2);
 await click(document.querySelector('.mp-story-card b'));assert.equal(count(),1);
 assert.equal(queue.readIncomingClips('user','team').length,2,'Film deletion never deletes received sources');
 // Repeated send updates its received source but cannot append another film segment.
 queue.enqueueIncomingClip('user','team',{actionId:'a',matchId:'m1',clipStart:12,clipEnd:14,title:'NZAPAKETE · Nouveau trim'});
 await flush();await flush();assert.equal(count(),1);
 assert.ok(document.body.textContent.includes('Nouveau trim'));
 await drop(document.querySelector('.mp-story-card'),{'text/mybasket-action':'a'});
 assert.equal(count(),2,'Dropping onto a film clip inserts exactly once before it');
 assert.ok(document.querySelector('.mp-story-card').textContent.includes('Nouveau trim'));
 await drop(document.querySelector('.mp-story-card'),{'text/mybasket-story-index':'1'});
 assert.equal(count(),2,'Reorder must not duplicate a segment');
 assert.ok(!document.querySelector('.mp-story-card').textContent.includes('Nouveau trim'));
 await drop(document.querySelector('.mp-playlist-card'),{'text/mybasket-action':'c'});
 assert.ok(playlistItems.some(item=>item.action_id==='c'),'Playlist drop saves a reference, not a new statistic');
 await act(async()=>root.unmount());
 await act(async()=>{createRoot(document.getElementById('root')).render(React.createElement(Studio,{initialTeamId:'team'}))});await flush();await flush();
 assert.equal(count(),0,'Reopening an empty film must not import the inbox automatically');assert.equal(document.querySelectorAll('.mp-match-clip').length,2);
 console.log('Montage UI: réception multi-matchs, aperçu, insertion explicite, filtres, sélection et réouverture validés.');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
