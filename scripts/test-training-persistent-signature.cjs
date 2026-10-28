const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,p);
const helpers=require('../lib/institutionnel/training-attendance-signature.ts');
async function call({expiresAt=null,revoked=false,used=false,signed=false,action='inspect',status='present'}={}){
 const token='a'.repeat(64),writes=[],link={hash:crypto.createHash('sha256').update(token).digest('hex'),expiresAt,issuedBy:'manager',...(used?{usedAt:'now'}:{})};
 const metadata={notes:'keep',...(!revoked?{mybasketAttendancePhone:link}:{}),...(signed?{mybasketAttendanceSignature:{image:'data:image/png;base64,YQ==',signedAt:'now',recordedBy:'manager'}}:{})};
 const record={id:'11111111-1111-4111-8111-111111111111',session_id:'session',candidate_id:'candidate',status,notes:JSON.stringify(metadata)};
 const db={from(table){const q={select(){return q},eq(){return q},async maybeSingle(){return{data:table==='training_candidate_attendance'?record:table==='training_attendance_sessions'?{cohort_id:'cohort',title:'Matin',session_date:'2026-10-28'}:{cohort_id:'cohort',first_name:'Alice',last_name:'Test'}}}};return q}};
 const context={exports:{},Buffer,require:n=>n==='next/server'?{NextResponse:{json:(body,o={})=>({body,status:o.status||200})}}:n==='node:crypto'?crypto:n.includes('admin-server')?{createAdminClient:()=>db}:n.includes('training-attendance-signature')?helpers:{normalizeAttendanceSignature:async()=> 'data:image/png;base64,YQ==',updateAttendanceRecord:async(db,r,p)=>writes.push(p)}};
 vm.createContext(context);vm.runInContext(ts.transpileModule(fs.readFileSync('app/api/public/training-signature/[id]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
 return{response:await context.exports.POST({json:async()=>({token,action,signature:'test'})},{params:Promise.resolve({id:record.id})}),writes};
}
(async()=>{
 for(const expiresAt of [null,'2020-01-01T00:00:00Z']){assert.equal((await call({expiresAt})).response.status,200);const r=await call({expiresAt,action:'sign'});assert.equal(r.response.status,200);assert(helpers.attendanceMetadata(r.writes[0].notes).mybasketAttendancePhone.usedAt);}
 assert.equal((await call({revoked:true})).response.status,403);
 for(const flag of ['used','signed']){assert.equal((await call({[flag]:true})).response.body.completed,true);assert.equal((await call({[flag]:true,action:'sign'})).response.status,409);}
 assert.equal((await call({status:'absent',action:'sign'})).response.status,409);
 assert.equal(helpers.attendanceMetadata(JSON.stringify({mybasketAttendanceGroupPhone:{hash:'test'}})).mybasketAttendanceGroupPhone.hash,'test');
 const ui=fs.readFileSync('components/formation/AttendanceSigningDialog.tsx','utf8');assert(ui.includes('aria-label="Fermer la fenêtre de signature" onClick={onClose}'));assert(ui.includes('Désactiver ce lien'));
 console.log('PASS: persistent individual and legacy links, explicit revocation, one-use protection, absent rejection, group metadata preservation, closing leaves link active');
})().catch(e=>{console.error(e);process.exitCode=1});
