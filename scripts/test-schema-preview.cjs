const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
function transpile(file){return ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText}
const modelContext={exports:{}};vm.createContext(modelContext);vm.runInContext(transpile('lib/library/schema-previews.ts'),modelContext);
const images=modelContext.exports.schemaPreviewImages;
assert.equal(JSON.stringify(images({diagrams:[{imageUrl:'diagram-a'},{imageUrl:'diagram-b'}],schemaImages:['diagram-a','schema-c'],schemaDataList:[{imageData:'phase-d'}],images:['illustration']})),JSON.stringify(['diagram-a','diagram-b','schema-c','phase-d']));
assert.equal(JSON.stringify(images({schema_images:['a','a','b'],schemaImage:'a'})),JSON.stringify(['a','b']));
assert.equal(JSON.stringify(images({images:['photo-a','photo-b']})),JSON.stringify(['photo-a','photo-b']));
assert.equal(images(null).length,0);const cyclic={};cyclic.snapshot=cyclic;assert.equal(images(cyclic).length,0);
assert.equal(JSON.stringify(images({practice_session_exercises:[{situation_image_url:'session-a'},{situation_image_url:'session-b'}]})),JSON.stringify(['session-a','session-b']));
let cursor=0,slots=[],effects=[],queue=[],timers=new Map(),nextTimer=1;
const fakeReact={
 useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value}]},
 useEffect(callback,deps){const index=cursor++,old=effects[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i]))){queue.push(()=>{old?.cleanup?.();effects[index]={deps,cleanup:callback()}})}}
};
const jsx=(type,props)=>({type,props});
const videoContext={exports:{}};vm.createContext(videoContext);vm.runInContext(transpile('lib/library/video-previews.ts'),videoContext);
const context={exports:{},document:{visibilityState:'visible',addEventListener:()=>{},removeEventListener:()=>{}},Image:class{},window:{setInterval(callback,delay){assert.equal(delay,2000);const id=nextTimer++;timers.set(id,callback);return id},clearInterval:id=>timers.delete(id)},require:name=>name==='@/lib/library/video-previews'?videoContext.exports:name==='react'?fakeReact:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:{default:new Proxy({},{get:(_,name)=>String(name)})}};
vm.createContext(context);vm.runInContext(transpile('components/library/SchemaPreview.tsx'),context);const Preview=context.exports.default;
const props={images:['first','second','third'],alt:'Horns'};
function render(value=props){cursor=0;const tree=Preview(value);while(queue.length)queue.shift()();return tree}
function image(tree){return tree.props.children.find(child=>child?.type==='img')?.props.src}
let tree=render();assert.equal(image(tree),'first');assert.equal(timers.size,0);
tree.props.onPointerEnter({pointerType:"mouse"});tree=render();assert.equal(timers.size,1);assert.equal(image(tree),'first','No immediate jump on entering');
for(const tick of timers.values())tick();tree=render();assert.equal(image(tree),'second');
for(const tick of timers.values())tick();tree=render();assert.equal(image(tree),'third');
for(const tick of timers.values())tick();tree=render();assert.equal(image(tree),'first');
tree.props.onPointerLeave();tree=render();assert.equal(timers.size,0);assert.equal(image(tree),'first');
tree.props.onFocus();tree=render();assert.equal(timers.size,1);let prevented=false;tree.props.onKeyDown({key:'ArrowRight',preventDefault(){prevented=true}});tree=render();assert(prevented);assert.equal(image(tree),'second');
tree.props.onBlur({currentTarget:{contains:()=>false},relatedTarget:null});tree=render();assert.equal(timers.size,0);assert.equal(image(tree),'first');
tree.props.onPointerEnter({pointerType:"mouse"});tree=render();assert.equal(timers.size,1);tree=render({images:['only']});assert.equal(timers.size,0);assert.equal(image(tree),'only');
tree=render({images:[]});assert.equal(image(tree),undefined);for(const effect of effects)effect?.cleanup?.();assert.equal(timers.size,0);
console.log('PASS: complete ordered image extraction, duplicates, nested session previews, 2000ms hover progression, wraparound, stop/reset, keyboard focus, single/empty content and timer cleanup.');
