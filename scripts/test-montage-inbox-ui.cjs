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
global.requestAnimationFrame = callback => setTimeout(()=>callback(performance.now()), 10);
global.cancelAnimationFrame = clearTimeout;
window.HTMLMediaElement.prototype.pause = () => {};
window.HTMLMediaElement.prototype.play = async () => {};
window.HTMLMediaElement.prototype.load = () => {};
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
const actions = [
 {id:'a',team_id:'team',match_id:'m1',player_id:'p1',quarter:1,action_type:'tir',shot_type:'3PTS',shot_result:'made',clip_start:10,clip_end:16},
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
  upsert:async value=>{playlistItems.push(value);const theme=tables.livestat_clip_themes.find(row=>row.id===value.theme_id);if(theme && !theme.livestat_clip_theme_items.some(row=>row.action_id===value.action_id)) theme.livestat_clip_theme_items.push({action_id:value.action_id});return {error:null}},then:resolve=>Promise.resolve(resolve(result()))};return q;
},rpc:async()=>({error:{code:'PGRST202',message:'not installed in test'}})};
let exportPlan=null;
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
  '@/components/video/LocalMatchVideoButton':{__esModule:true,default:()=>React.createElement('button',{'data-connect-video':true},'Reconnecter la vidéo')},
  '@/components/video-editor/ClipThumbnail':{__esModule:true,default:()=>null},
  '@/lib/local-montage-export':{exportTimelineLocally:async(sources,overlays)=>{exportPlan={sources,overlays};return {extension:'mp4'}},downloadLocalExport:()=>{}},
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
const drop=async(target,payload,clientX=0)=>{const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'clientX',{value:clientX});event.dataTransfer={getData:key=>payload[key] || ''};await act(async()=>target.dispatchEvent(event));await flush()};
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
 assert.equal(document.querySelector('.mp-source-preview'),null,'Insertion closes preview and exposes the film');
 await click(document.querySelector('.mp-match-clip input'));
 const playlistSelect=document.querySelector('[aria-label="Ajouter la sélection à une playlist"]');
 assert.ok(playlistSelect,'Selection can be filed into a playlist without dragging across hidden tabs');
 await act(async()=>{playlistSelect.value='inbox';playlistSelect.dispatchEvent(new Event('change',{bubbles:true}))});await flush();
 assert.equal(playlistItems.length,3,'Playlist picker saves an existing source reference');
 const select=document.querySelector('[aria-label="Filtrer par match"]');
 await act(async()=>{select.value='m1';select.dispatchEvent(new Event('change',{bubbles:true}))});await flush();
 assert.ok(document.body.textContent.includes('1 actions sélectionnées'));
 await click([...document.querySelectorAll('button')].find(el=>el.textContent.includes('Ajouter la sélection au montage')));assert.equal(count(),2);
 // Actual visible editing controls, not only the keyboard shortcuts.
 assert.equal(document.querySelector('.mp-stage canvas'),null,'Drawing overlay cannot cover the reconnect button');
 assert.ok(document.querySelector('[data-connect-video]'));
 await click(document.querySelector('[aria-label="Annuler la dernière modification"]'));assert.equal(count(),1);
 assert.ok(document.querySelector('.mp-story-card.selected'),'Undo must leave the remaining clip selected');
 await click(document.querySelector('[aria-label="Rétablir la modification"]'));assert.equal(count(),2);
 await click(document.querySelector('[aria-label="Élément précédent"]'));
 assert.ok(document.querySelector('.mp-story-card').classList.contains('selected'));
 await click(document.querySelector('[aria-label="Élément suivant"]'));
 assert.ok(document.querySelectorAll('.mp-story-card')[1].classList.contains('selected'));
 await click([...document.querySelectorAll('button')].find(el=>el.textContent.includes('Exporter')));
 assert.ok(document.querySelector('.mp-toast').textContent.includes('Vidéo locale manquante'),'Missing-video export returns visible feedback, never an unhandled rejection');
 assert.equal([...document.querySelectorAll('button')].find(el=>el.textContent.includes('Exporter')).disabled,false,'Export unlocks after failed preflight');
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
 let reopenedRoot;await act(async()=>{reopenedRoot=createRoot(document.getElementById('root'));reopenedRoot.render(React.createElement(Studio,{initialTeamId:'team'}))});await flush();await flush();
 assert.equal(count(),0,'Reopening an empty film must not import the inbox automatically');assert.equal(document.querySelectorAll('.mp-match-clip').length,3);
 // A remote or local URL can exist yet fail to decode: never leave a broken player.
 matches[0].video_url='https://example.test/unavailable.mp4';
 await click(document.querySelector('.mp-match-clip-open'));
 const broken=document.querySelector('.mp-source-card video');assert.ok(broken);
 await act(async()=>broken.dispatchEvent(new Event('error')));await flush();
 assert.equal(document.querySelector('.mp-source-card video'),null);
 assert.ok(document.querySelector('.mp-source-card').textContent.includes('Vidéo indisponible'));
 assert.ok(document.querySelector('.mp-source-card').textContent.includes('Remplacer le fichier vidéo'));
 const tab=new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});
 await act(async()=>document.body.dispatchEvent(tab));
 assert.equal(tab.defaultPrevented,false,'Tab must remain usable to reach every control');
 // Compact tabs preserve the same clip collection and isolate the active panel.
 await click(button('Fermer l’aperçu') || document.querySelector('[aria-label="Fermer l’aperçu"]'));
 assert.equal(document.querySelector('#mp-panel-clips').hidden,false);
 assert.equal(document.querySelector('#mp-panel-settings').hidden,true);
 await click(button('Playlists'));assert.equal(document.querySelector('#mp-panel-playlists').hidden,false);
 await click(button('Clips'));assert.equal(document.querySelectorAll('.mp-match-clip').length,3);
 await click(button('Titres'));
 await act(async()=>document.querySelector('.mp-title-composer').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await flush();
 assert.equal(count(),1,'Title insertion works without a native prompt');
 assert.ok(document.querySelector('.mp-story-card').textContent.includes('Nouveau titre'));
 assert.equal(document.querySelector('#mp-panel-settings').hidden,false);
 await click(button('Montage'));
 await click(document.querySelector('[aria-label="Annuler la dernière modification"]'));assert.equal(count(),0);
 // Draw only after choosing the drawing tab, with an available source video.
 matches[0].video_url='https://example.test/valid.mp4';
 await click(button('Clips'));
 await click(document.querySelector('.mp-mini-add'));assert.equal(count(),1);
 assert.equal(document.querySelector('.mp-stage canvas').style.pointerEvents,'none');
 await click(button('Dessiner'));
 const canvas=document.querySelector('.mp-stage canvas');assert.equal(canvas.style.pointerEvents,'auto');
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:960,height:540});
 await click(button('Cercle'));
 await act(async()=>{
  canvas.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:100,clientY:100}));
  canvas.dispatchEvent(new MouseEvent('pointerup',{bubbles:true,clientX:150,clientY:150}));
 });await flush();
 assert.equal(button('Effacer le dernier').disabled,false,'Pointer drawing creates a saved montage annotation');
 await click(button('Effacer le dernier'));assert.equal(button('Effacer le dernier').disabled,true);
 await click(button('Transitions'));
 const transition=document.querySelector('[aria-label="Transition du clip"]');
 await act(async()=>{transition.value='fade';transition.dispatchEvent(new Event('change',{bubbles:true}))});await flush();
 assert.equal(transition.value,'fade');
 assert.ok(document.querySelector('.mp-tools').textContent.includes('0,25 s'));
 // Separate tracks use a shared time scale. An overlay keeps the source video visible.
 await click(button('Titres'));
 await act(async()=>document.querySelector('.mp-title-composer').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await flush();
 assert.equal(document.querySelectorAll('[data-track="overlay"] .mp-story-card').length,1);
 assert.equal(document.querySelectorAll('[data-track="video"] .mp-story-card').length,1);
 assert.ok(document.querySelector('.mp-stage video'),'An overlay title does not replace its source with a black card');
 assert.ok(document.querySelector('.mp-live-overlay'),'Overlay is rendered above the source video');
 await act(async()=>document.querySelector('.mp-stage video').dispatchEvent(new Event('loadedmetadata')));
 assert.equal(document.querySelector('.mp-stage video').currentTime,12,'A title overlay seeks to its underlying clip, never the start of the source match');
 let overlay=document.querySelector('[data-track="overlay"] .mp-story-card');
 await drop(document.querySelector('[data-track="overlay"]'),{'text/mybasket-story-index':overlay.dataset.itemIndex},240);
 overlay=document.querySelector('[data-track="overlay"] .mp-story-card');assert.equal(overlay.style.left,'240px','Overlay can be placed at 15 seconds independently');
 await click(button('Titres'));
 const placement=document.querySelector('[aria-label="Placement du nouveau titre"]');
 await act(async()=>{placement.value='video';placement.dispatchEvent(new Event('change',{bubbles:true}))});await flush();
 await act(async()=>document.querySelector('.mp-title-composer').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await flush();
 assert.equal(document.querySelectorAll('[data-track="video"] .mp-story-card').length,2);
 let card=document.querySelector('[data-track="video"] .type-title');
 assert.equal(card.style.left,'0px');assert.equal(document.querySelector('[data-track="video"] .type-clip').style.left,'64px','A four-second card pushes the source clip to 4 seconds');
 assert.ok(document.querySelector('.mp-design-preview'),'Standalone title is previewed on its own black frame');
 await click(document.querySelector('[aria-label="Lire le montage"]'));
 assert.ok(document.querySelector('[aria-label="Mettre en pause le montage"]'),'A standalone title plays without asking for a video file');
 await click(document.querySelector('[aria-label="Mettre en pause le montage"]'));
 await drop(document.querySelector('[data-track="overlay"]'),{'text/mybasket-story-index':card.dataset.itemIndex},32);
 assert.equal(document.querySelectorAll('[data-track="video"] .mp-story-card').length,1);
 card=[...document.querySelectorAll('[data-track="overlay"] .mp-story-card')].find(el=>el.style.left==='32px');assert.ok(card,'Title moves from card to overlay without duplication');
 const clip=document.querySelector('[data-track="video"] .type-clip');
 await drop(clip,{'text/mybasket-story-index':card.dataset.itemIndex});
 assert.equal(document.querySelectorAll('[data-track="video"] .mp-story-card').length,2);
 // Save/reopen the actual component through the existing atomic payload.
 let saved;
 client.rpc=async(_name,args)=>{
  saved=args;
  tables.livestat_montages=[{...args.p_montage,id:args.p_montage_id,updated_at:'2026-10-16T12:00:00Z'}];
  tables.livestat_montage_items=args.p_rows.map((row,index)=>({...row,id:'item-'+index,montage_id:args.p_montage_id}));
  return {data:{id:args.p_montage_id,updated_at:'2026-10-16T12:00:00Z'},error:null};
 };
 await click(button('Enregistrer'));
 assert.ok(saved);assert.equal(saved.p_rows.filter(row=>row.item_type==='title'&&row.track==='video').length,1);
 assert.equal(saved.p_rows.find(row=>row.item_type==='title'&&row.track==='overlay').timeline_start,15);
 await act(async()=>reopenedRoot.unmount());
 let restoredRoot;await act(async()=>{restoredRoot=createRoot(document.getElementById('root'));restoredRoot.render(React.createElement(Studio,{initialTeamId:'team',initialMontageId:saved.p_montage_id}))});await flush();await flush();
 assert.equal(document.querySelectorAll('[data-track="video"] .mp-story-card').length,2,'Card and clip survive reopening');
 assert.equal(document.querySelector('[data-track="overlay"] .mp-story-card').style.left,'240px','Overlay position survives reopening');
 // Collection tabs and broader search metadata.
 await click(document.querySelector('.mp-clip-collections [role="tab"]'));
 assert.equal(document.querySelectorAll('.mp-match-clip').length,3,'All clips is independent of received sources');
 const search=document.querySelector('.mp-clips-search');
 const setSearch=async(value)=>{await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(search,value);search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await flush();};
 await setSearch('NZAPAKETE 3PTS');assert.equal(document.querySelectorAll('.mp-match-clip').length,1,'Search finds player and shot type together');
 await setSearch('ONDZÉ');assert.equal(document.querySelectorAll('.mp-match-clip').length,1,'Search ignores accents');
 await setSearch('');
 await click([...document.querySelectorAll('.mp-clip-collections [role="tab"]')][1]);
 assert.equal(document.querySelectorAll('.mp-match-clip').length,3,'Manually filed clips remain available');
 // Cards export without a video URL and overlays after the last clip keep their time slot.
 await click(document.querySelector('[data-track="video"] .type-clip b'));
 await click([...document.querySelectorAll('button')].find(el=>el.textContent.includes('Exporter')));
 assert.ok(exportPlan);assert.ok(exportPlan.sources.every(source=>source.type==='card'));
 assert.equal(exportPlan.sources[0].duration,4);assert.equal(exportPlan.sources[1].duration,15);
 assert.equal(exportPlan.overlays.length,1,'A standalone card is not duplicated as an overlay');
 await act(async()=>restoredRoot.unmount());
 const Modal=require('../components/prise-stats-pro/ActionClipsModal.tsx').default;
 let added=0;await act(async()=>{createRoot(document.getElementById('root')).render(React.createElement(Modal,{open:true,actions:[{id:'a',matchId:'m1',q:1,clipStart:10,clipEnd:16}],title:'Clip',videoUrl:'https://example.test/valid.mp4',onClose:()=>{},onAddToMontage:()=>added++}))});await flush();
 assert.equal(document.querySelectorAll('.acm-details').length,3);
 assert.ok([...document.querySelectorAll('.acm-details')].every(el=>!el.open),'Clip details, trim and note start collapsed');
 await click([...document.querySelectorAll('button')].find(el=>el.textContent.includes('Ajouter au montage')));assert.equal(added,1);
 console.log('Montage: pistes séparées, titres superposés/cartons, déplacement inter-pistes, sauvegarde/réouverture, collections et aperçu allégé validés.');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
