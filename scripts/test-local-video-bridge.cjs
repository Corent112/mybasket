const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const channels=new Set();
class Channel{constructor(name){this.name=name;channels.add(this)}postMessage(data){for(const c of channels)if(c!==this&&c.name===this.name)queueMicrotask(()=>c.onmessage?.({data}))}close(){channels.delete(this)}}
const js=ts.transpileModule(fs.readFileSync('lib/video/local-video-bridge.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function tab(){const videos=new Map(),exports={};const context={exports,require:name=>name.includes('registry')?{getLocalMatchVideo:id=>videos.get(id),setLocalMatchVideo:v=>videos.set(v.matchId,v)}:{fingerprintVideo:async file=>({size:file.size}),fingerprintsMatch:(a,b)=>a.size===b.size},BroadcastChannel:Channel,File,URL,crypto,setTimeout,clearTimeout,Map,Promise};vm.runInNewContext(js,context);return{...exports,videos}}
(async()=>{
 const source=tab(),receiver=tab();const closeSource=source.serveLocalMatchVideos('coach'),closeReceiver=receiver.serveLocalMatchVideos('coach');
 source.videos.set('match',{file:new File(['video'],'match.mp4'),fingerprint:{size:5}});
 assert.equal(await receiver.requestVideoFromOpenTabs('other','match'),false);assert.equal(receiver.videos.size,0);
 const a=receiver.requestVideoFromOpenTabs('coach','match'),b=receiver.requestVideoFromOpenTabs('coach','match');assert.equal(a,b);assert.equal(await a,true);assert.equal(receiver.videos.get('match').file.size,5);
 closeSource();closeReceiver();assert.equal(channels.size,0);assert.equal(await receiver.requestVideoFromOpenTabs('coach','match'),false);
 URL.revokeObjectURL(receiver.videos.get('match').url);
 console.log('Local video bridge: same-account transfer, account isolation, request deduplication and channel cleanup passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
