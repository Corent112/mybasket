const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
function load(path,mocks={}){
 const context={exports:{},console,URL,FormData,File,Buffer,crypto,Date,Response,require:name=>name in mocks?mocks[name]:require(name)};
 vm.createContext(context);vm.runInContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
 return context.exports;
}
const model=load('lib/home/slider.ts');
const {DEFAULT_SLIDES,SLIDER_SETTINGS_ID,DEFAULT_DESIGN,normalizeDesign,encodeSlideImage,decodeSlideImage,safeSlideUrl}=model;
const marker={id:SLIDER_SETTINGS_ID,title:'Configuration',placement:'global',status:'inactive',sort_order:0};
const visibleRows=db=>db.rows.filter(row=>row.id!==SLIDER_SETTINGS_ID);
const design={...DEFAULT_DESIGN,layout:'image',imageFit:'contain',textX:73,textY:26,zoom:1.25};
const encoded=encodeSlideImage('https://cdn.example.org/image.webp',design);
assert.equal(decodeSlideImage(encoded).source,'https://cdn.example.org/image.webp');
assert.equal(JSON.stringify(decodeSlideImage(encoded).design),JSON.stringify(design));
assert.equal(decodeSlideImage('https://cdn.example.org/legacy.jpg').designed,false);
assert.equal(decodeSlideImage('#mybasket-slide=%broken').design.version,1);
for(const unsafe of ['javascript:alert(1)','//evil.example','/\\evil.example','https://user:password@example.org','data:text/html,test'])assert.equal(safeSlideUrl(unsafe,true),null);
assert.equal(safeSlideUrl('/abonnements',true),'/abonnements');
assert.equal(safeSlideUrl('#contact',true),'#contact');
assert.equal(normalizeDesign({color:'red;display:none',overlay:200,zoom:99,textWidth:-2}).color,'#ffffff');
assert.equal(normalizeDesign({overlay:200}).overlay,90);
assert.equal(new Set(DEFAULT_SLIDES.map(s=>s.id)).size,3);

function database(initial=[]){
 const db={rows:initial.map(r=>({...r})),writes:[],uploads:[],removals:[],failSave:false,failRead:false};
 db.from=()=>{
  let operation='read',payload,filters=[],head=false,single=false;
  const q={select(_columns,opts){head=!!opts?.head;return q},in(key,values){filters.push(row=>values.includes(row[key]));return q},eq(key,value){filters.push(row=>row[key]===value);return q},neq(key,value){filters.push(row=>row[key]!==value);return q},limit(){return q},order(){return q},
   delete(){operation='delete';return q},insert(value){operation='insert';payload=value;return q},update(value){operation='update';payload=value;return q},upsert(value){operation='upsert';payload=value;return q},maybeSingle(){single=true;return q},single(){single=true;return q},
   then(resolve,reject){
    let rows=db.rows.filter(row=>filters.every(filter=>filter(row)));
    if(db.failRead&&operation==='read')return Promise.resolve({data:null,error:{message:'failed'}}).then(resolve,reject);
    if(db.failSave&&operation!=='read'&&operation!=='upsert')return Promise.resolve({data:null,error:{message:'failed'}}).then(resolve,reject);
    if(operation!=='read')db.writes.push(operation);
    if(operation==='insert'){const row={...payload,id:'new-slide'};db.rows.push(row);rows=[row]}
    if(operation==='update'){rows.forEach(row=>Object.assign(row,payload))}
    if(operation==='delete'){db.rows=db.rows.filter(row=>!rows.includes(row))}
    if(operation==='upsert'){for(const row of (Array.isArray(payload)?payload:[payload]))if(!db.rows.some(r=>r.id===row.id))db.rows.push({...row})}
    return Promise.resolve({data:head?null:single?rows[0]||null:rows,error:null,count:rows.length}).then(resolve,reject);
   },
  };return q;
 };
 db.storage={from:()=>({upload:async(path)=>{db.uploads.push(path);return{error:null}},getPublicUrl:path=>({data:{publicUrl:'https://cdn.example.org/'+path}}),remove:async paths=>{db.removals.push(...paths);return{error:null}}})};
 return db;
}
function actionSet(db,allowed=true){return load('app/admin/slider/actions.ts',{
 'next/cache':{revalidatePath:()=>{}},sharp:()=>({rotate(){return this},resize(){return this},webp(){return this},toBuffer:async()=>Buffer.from('webp')}),
 '@/lib/admin/guard':{requireAdmin:async()=>{if(!allowed)throw Error('Unauthorized');return{supabase:db}}},'@/lib/home/slider':model,
});}
const action=(db,allowed=true)=>actionSet(db,allowed).saveSlide;
function form(patch={}){const f=new FormData();for(const [key,value]of Object.entries({title:'Stage MyBasket',subtitle:'Inscris-toi',source_image:'https://cdn.example.org/photo.jpg',design:JSON.stringify(design),mode:'add',sort_order:'3',published:'on',button_href:'/abonnements',button_label:'Découvrir',...patch}))f.set(key,value);return f}
(async()=>{
 const initialized=database();assert((await actionSet(initialized).initializeDefaultSlides()).ok);assert.equal(visibleRows(initialized).length,3);
 const written=initialized.writes.length;await actionSet(initialized).initializeDefaultSlides();assert.equal(initialized.writes.length,written,'Default initialization happens once');
 for(const slide of DEFAULT_SLIDES){const data=new FormData();data.set('id',slide.id);await actionSet(initialized).deleteSlide(data)}
 assert.equal(visibleRows(initialized).length,0);await actionSet(initialized).initializeDefaultSlides();assert.equal(visibleRows(initialized).length,0,'Deleting all defaults is permanent');
 const protectedForm=new FormData();protectedForm.set('id',SLIDER_SETTINGS_ID);await actionSet(initialized).deleteSlide(protectedForm);assert(initialized.rows.some(row=>row.id===SLIDER_SETTINGS_ID));
 const db=database();let result=await action(db)({},form());assert(result.ok);assert.equal(visibleRows(db).length,4,'Appending first custom slide preserves all three visible defaults');
 assert.equal(db.rows.find(r=>r.id==='new-slide').status,'active');
 result=await action(db)({},form({mode:'replace',target_id:DEFAULT_SLIDES[1].id,title:'Nouvelle slide'}));assert(result.ok);assert.equal(visibleRows(db).length,4,'Replacing updates the chosen row, never appends');assert.equal(db.rows.find(r=>r.id===DEFAULT_SLIDES[1].id).title,'Nouvelle slide');
 const empty=database();result=await action(empty)({},form({mode:'replace',target_id:DEFAULT_SLIDES[0].id}));assert(result.ok);assert.equal(visibleRows(empty).length,3,'First replacement preserves the other defaults');
 const bad=database([...DEFAULT_SLIDES,marker]);for(const patch of [{button_href:'javascript:alert(1)'},{design:'bad-json'},{mode:'replace',target_id:'missing'},{sort_order:'NaN'},{source_image:'',design:JSON.stringify(design)}])assert.equal((await action(bad)({},form(patch))).ok,false);
 assert.equal(bad.writes.length,0,'Invalid inputs do not modify slides');
 await assert.rejects(()=>action(bad,false)({},form()),/Unauthorized/);assert.equal(bad.writes.length,0);
 const uploadDb=database([...DEFAULT_SLIDES,marker]);uploadDb.failSave=true;
 const imageForm=form();imageForm.set('image_file',new File([Buffer.from('image')],'photo.webp',{type:'image/webp'}));
 result=await action(uploadDb)({},imageForm);assert.equal(result.ok,false);assert.equal(uploadDb.uploads.length,1);assert.equal(uploadDb.removals[0],uploadDb.uploads[0],'Failed persistence removes the new upload');
 const draftDb=database([...DEFAULT_SLIDES,marker]);result=await action(draftDb)({},form({published:''}));assert(result.ok);assert.equal(draftDb.rows.find(r=>r.id==='new-slide').status,'inactive');
 const savedMarker=db.rows.find(row=>row.id===SLIDER_SETTINGS_ID);assert(savedMarker);db.rows=[savedMarker];await action(db)({},form());assert.equal(visibleRows(db).length,1,'Creating a slide after all deletions never resurrects defaults');
 const apiDb=database([{...DEFAULT_SLIDES[0],status:'inactive'}]);
 const api=load('app/api/home/slider/route.ts',{'next/server':{NextResponse:{json:(body,opts)=>Response.json(body,opts)}},'@/lib/supabase/admin-server':{createAdminClient:()=>apiDb},'@/lib/supabase/server':{createClient:async()=>apiDb}});
 let response=await api.GET();let json=await response.json();assert.equal(json.configured,true);assert.equal(json.slides.length,0,'Hiding all slides never resurrects defaults');
 apiDb.rows=[{...DEFAULT_SLIDES[0],status:'active'},{...DEFAULT_SLIDES[1],status:'inactive'}];json=await(await api.GET()).json();assert.equal(json.slides.length,1);assert.equal(json.slides[0].id,DEFAULT_SLIDES[0].id);
 apiDb.rows=[marker];json=await(await api.GET()).json();assert.equal(json.configured,true);assert.equal(json.slides.length,0);
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const Visual=load('components/home/HomeSlideVisual.tsx',{'@/lib/home/slider':model,'./HomeSlideVisual.module.css':{__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})}}).default;
 const row={...DEFAULT_SLIDES[0],title:'Internal name',image_url:encoded,button_href:'/contact'};
 let html=renderToStaticMarkup(React.createElement(Visual,{slide:row}));assert(!html.includes('<h2>'));assert(html.includes('alt="Internal name"'));assert(html.includes('href="/contact"'));assert(!html.includes('mybasket-slide='),'Encoded settings must not enter the image request');
 html=renderToStaticMarkup(React.createElement(Visual,{slide:{...row,image_url:encodeSlideImage('https://cdn.example.org/image.webp',DEFAULT_DESIGN)}}));assert(html.includes('<h2>Internal name</h2>'));
 console.log('PASS: design round trip, legacy slides, safe links, add/replace/default preservation, authorization, errors/upload cleanup, drafts, hidden-slider behavior and shared public renderer.');
})().catch(error=>{console.error(error);process.exitCode=1});
