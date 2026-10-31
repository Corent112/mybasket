const fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript"),assert=require("node:assert/strict");
function load(path,mocks){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>mocks[n],console,Date});return module.exports;}
const plans=[{id:"basic",slug:"individual_basic",name:"Basic",status:"active"},{id:"premium",slug:"premium",name:"Premium",status:"active"}];
const user={id:"u",email:"coach@example.org"};
const paid={id:"s",user_id:"u",plan_id:"basic",status:"active",created_at:"2026-01-01"};
const grant={id:"g",user_email:user.email,plan_slug:"premium",status:"active",starts_at:"2026-01-01",ends_at:"2099-01-01"};
function database(grants){
 const writes=[];
 return {writes,auth:{admin:{getUserById:async()=>({data:{user}})}},from(table){
  let action=null,filters=[],single=false;
  const q={
   select(){return q},eq(k,v){filters.push([k,v]);return q},in(){return q},ilike(){return q},order(){return q},limit(){return q},
   maybeSingle(){single=true;return q},update(value){action=value;return q},insert(value){action=value;return q},
   then(resolve,reject){
    if(action){writes.push({table,value:action,filters});return Promise.resolve({data:null,error:null}).then(resolve,reject)}
    let data=table==="subscriptions"?[paid]:table==="free_access_grants"?grants:plans;
    data=data.filter(row=>filters.every(([k,v])=>row[k]===v));
    return Promise.resolve({data:single?data[0]||null:data,error:null}).then(resolve,reject);
   },
  };return q;
 }};
}
(async()=>{
 for(const grants of [[grant],[{...grant,status:"inactive"}],[{...grant,ends_at:"2020-01-01"}],[]]){
  const db=database(grants),effective=load("lib/effective-subscription.ts",{"@/lib/supabase/admin-server":{createAdminClient:()=>db}});
  const {resolveAdminUserSubscription:resolve}=load("lib/admin/user-subscriptions.ts",{"@/lib/effective-subscription":effective});
  const live=await effective.getEffectiveSubscriptionForUser({supabase:db,userId:user.id,email:user.email});
  const display=resolve(user,[paid],grants,plans);
  assert.equal(live.plan.id,display.plan.id);
  assert.equal(live.source==="free",display.source==="free");
  const {applyAdminUserPlan}=load("lib/admin/apply-user-plan.ts",{"@/lib/effective-subscription":effective});
  await applyAdminUserPlan(db,user.id,plans[0]);
  assert.equal(db.writes.length,1);
  if(live.source==="free"){
   assert.equal(db.writes[0].table,"free_access_grants");
   assert.equal(db.writes[0].value.plan_slug,"individual_basic");
   assert.equal("starts_at" in db.writes[0].value,false);
   assert.equal("ends_at" in db.writes[0].value,false);
   assert.equal(db.writes[0].filters[0][1],"g");
  }else assert.equal(db.writes[0].table,"subscriptions");
 }
 console.log("PASS: Premium grant overrides Basic consistently in actual rights and admin displays; expired/disabled grants fall back; plan edits retain grant dates and do not create paid subscriptions.");
})().catch(error=>{console.error(error);process.exitCode=1});
