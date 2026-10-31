const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const source = fs.readFileSync("app/api/auth/reset-password/route.ts", "utf8");
function load(scenario = {}) {
  const calls = [];
  const admin = { auth: { admin: {
    listUsers: async ({ page }) => {
      calls.push(["list", page]);
      if (scenario.lookupError) return { error: new Error("lookup") };
      const users = scenario.missing ? [] : scenario.pages && page === 1
        ? Array.from({length:200}, (_,i) => ({ email: i+"@example.org" }))
        : [{id:"existing-id",email:"coach@example.org",email_confirmed_at:scenario.confirmed?"date":null}];
      return { data: { users } };
    },
    generateLink: async (args) => {
      calls.push(["generate", args]);
      return scenario.tokenError ? {error:{code:"failed"}} : {data:{properties:{hashed_token:"test-token",verification_type:scenario.verificationType||args.type}}};
    },
  } } };
  const mocks = {
    "next/server": {NextResponse: {json: (body, options) => ({body,status:options?.status||200})}},
    "@/lib/supabase/admin-server": {createAdminClient: () => scenario.noAdmin ? null : admin},
    "@/lib/server-notifications": {sendTransactionalEmail: async args => {
      calls.push(["email", args]); if(scenario.throwMail) throw Error("mail");
      return {sent:!scenario.mailError};
    }},
    "@/lib/site-url": {getSiteUrl: () => "https://mybasket.fr"},
    "@/lib/security/rate-limit": {getClientIp:()=>"ip",rateLimit:()=>({allowed:!scenario.limited})},
  };
  const module = {exports:{}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {module,exports:module.exports,require:n=>mocks[n],URL,console:{error(){}}});
  return {post:module.exports.POST,calls};
}
(async()=>{
  for (const confirmed of [false,true]) {
    const {post,calls}=load({confirmed,pages:true});
    const r=await post({json:async()=>({email:" COACH@EXAMPLE.ORG "}),headers:new Headers()});
    assert.equal(r.status,200);
    assert.deepEqual(calls.filter(x=>x[0]==="list").map(x=>x[1]),[1,2]);
    const generated=calls.find(x=>x[0]==="generate")[1];
    assert.equal(generated.type,confirmed?"recovery":"magiclink");
    assert.equal(generated.email,"coach@example.org");
    const mail=calls.find(x=>x[0]==="email")[1];
    const link=new URL(mail.text.split("\n\n")[1]);
    assert.equal(link.origin,"https://mybasket.fr");
    assert.equal(link.searchParams.get("next"),"/auth/reset-password");
    assert.equal(link.searchParams.get("type"),generated.type);
    assert.equal(link.searchParams.get("token_hash"),"test-token");
  }
  for (const scenario of [{mailError:true},{throwMail:true},{tokenError:true},{lookupError:true},{noAdmin:true}]) {
    const {post}=load(scenario);
    assert.equal((await post({json:async()=>({email:"coach@example.org"}),headers:new Headers()})).status,503);
  }
  const missing=load({missing:true});
  const converted=load({verificationType:"signup"});
  assert.equal((await converted.post({json:async()=>({email:"coach@example.org"}),headers:new Headers()})).status,200);
  assert.match(converted.calls.find(x=>x[0]==="email")[1].text,/type=signup/);
  assert.equal((await missing.post({json:async()=>({email:"absent@example.org"}),headers:new Headers()})).status,200);
  assert.equal(missing.calls.some(x=>x[0]==="generate"||x[0]==="email"),false);
  assert.equal((await load({limited:true}).post({json:async()=>({email:"coach@example.org"}),headers:new Headers()})).status,429);
  assert.equal((await load().post({json:async()=>({email:"bad"}),headers:new Headers()})).status,400);
  for(const path of ["app/connexion/page.tsx","app/auth/reset-password/page.tsx","app/auth/callback/route.ts", "app/api/auth/reset-password/route.ts"]) {
    const result=ts.transpileModule(fs.readFileSync(path,"utf8"),{fileName:path,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022}});
    assert.equal(result.diagnostics.length,0,path);
  }
  console.log("PASS: confirmed and imported accounts, pagination, cross-device token URL, unknown account, delivery failures, rate limit, validation, TS/TSX syntax.");
})().catch(e=>{console.error(e);process.exitCode=1});
