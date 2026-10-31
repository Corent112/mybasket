const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(path,mocks){const ctx={exports:{},console,require:n=>mocks[n]};vm.createContext(ctx);vm.runInContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,ctx);return ctx.exports;}
const effective=load('lib/effective-subscription.ts',{'@/lib/supabase/admin-server':{createAdminClient:()=>null}}),{resolveAdminUserSubscription:resolve,readAdminRows,readAllAuthUsers}=load('lib/admin/user-subscriptions.ts',{'@/lib/effective-subscription':effective});
const now=Date.parse('2026-10-31T12:00:00Z'),user={id:'user',email:'USER@example.fr'},plans=[{id:'premium',name:'Premium',slug:'premium',status:'active'},{id:'institution',name:'Institution',slug:'institution',status:'active'},{id:'old',name:'Ancienne offre',status:'inactive'}];
const active={id:'a',user_id:'user',plan_id:'institution',status:'active',created_at:'2026-10-20'},cancelled={id:'b',user_id:'user',plan_id:'premium',status:'canceled',created_at:'2026-10-30'};
const grant={id:'g',user_email:' user@EXAMPLE.fr ',plan_slug:'premium',status:'active',created_at:'2026-10-25'};
for(const rows of [[active,cancelled],[cancelled,active]])assert.equal(resolve(user,rows,[],plans,now).plan.id,'institution');
assert.equal(resolve(user,[],[grant],plans,now).source,'free');assert.equal(resolve(user,[active],[grant],plans,now).source,'free');
assert.equal(resolve(user,[{...active,current_period_end:'2026-01-01'}],[grant],plans,now).source,'free');
assert.equal(resolve(user,[],[{...grant,ends_at:'2026-01-01'}],plans,now).active,false);
assert.equal(resolve(user,[{...active,plan_id:'old'}],[],plans,now).plan.name,'Ancienne offre');
assert.equal(resolve(user,[{...active,user_id:'other'}],[],plans,now).active,false);
assert.equal(resolve(user,[{...active,status:'trialing'}],[],plans,now).active,true);
(async()=>{const calls=[],db={from(){return{select(){return this},order(){return this},async range(a,b){calls.push([a,b]);return{data:a===0?Array.from({length:1000},(_,id)=>({id})): [{id:1000}]}}}}};assert.equal((await readAdminRows(db,'subscriptions')).length,1001);assert.equal(calls.length,2);await assert.rejects(()=>readAdminRows({from:()=>({select(){return this},order(){return this},range:async()=>({error:{message:'unavailable'}})})},'subscriptions'),/unavailable/);const pages=[];const auth=await readAllAuthUsers({auth:{admin:{listUsers:async({page})=>{pages.push(page);return {data:{users:page<3?Array.from({length:50},(_,i)=>({id:String(page*50+i)})):[]}}}}}});assert.equal(auth.length,100);assert.equal(pages.length,3); console.log('PASS: current active plan regardless row order, offered access, precedence, expiry, archived offers, trial, isolation, pagination and explicit read errors');})().catch(e=>{console.error(e);process.exitCode=1});

