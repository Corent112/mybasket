const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const context = { exports: {} };
vm.createContext(context);
vm.runInContext(ts.transpileModule(fs.readFileSync('lib/admin/user-directory.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context);
const { buildUserDirectory, formatLastConnection, matchesDirectoryFilters } = context.exports;
const now = Date.parse('2026-11-18T11:00:00Z');
const data = {
 now,
 profiles: [{id:'a', email:'alice@club.fr',display_name:'Alice',last_sign_in_at:'2025-01-01T00:00:00Z'}, {id:'old',email:'old@club.fr'}],
 authUsers: [{id:'a',email:'alice@club.fr',last_sign_in_at:'2026-11-18T10:30:00Z'}, {id:'b',email:'b@club.fr',invited_at:'2026-11-17T12:00:00Z'}, {id:'anon',is_anonymous:true,last_sign_in_at:'2026-11-18T10:00:00Z'}],
 cohorts: [{id:'c1',institution_id:'i',name:'2026',training_programs:{name:'DETB'}}, {id:'c2',institution_id:'i',name:'2027',training_programs:{name:'BF Jeunes'}}, {id:'personal',name:'Individuel'}],
 candidates: [{id:'t1',user_id:'a',email:'ALICE@club.fr ',cohort_id:'c1'}, {id:'t2',email:'alice@club.fr',cohort_id:'c2'}, {id:'t3',email:'sanscompte@club.fr',first_name:'Émilie',last_name:'Durand',cohort_id:'c1'}, {id:'t4',email:'sanscompte@club.fr',cohort_id:'c2'}, {id:'t5',email:'excluded@club.fr',cohort_id:'personal'}],
 invitations: [{id:'i1',email:'new@club.fr',status:'pending',expires_at:'2027-01-01T00:00:00Z'}, {id:'i2',email:'NEW@club.fr',status:'pending'}, {id:'i3',email:'expired@club.fr',status:'pending',expires_at:'2026-11-17T00:00:00Z'}, {id:'i4',email:'accepted@club.fr',status:'accepted'}],
};
const people=buildUserDirectory(data);
assert.equal(people.length,6);
const alice=people.find(p=>p.id==='a');
assert.equal(alice.trainings.length,2);
assert.equal(alice.last_sign_in_at,'2026-11-18T10:30:00Z');
assert.equal(formatLastConnection(alice),'18/11/2026 11:30');
const later=buildUserDirectory({...data,authUsers:data.authUsers.map(a=>a.id==='a'?{...a,last_sign_in_at:'2026-11-18T10:50:00Z'}:a)}).find(p=>p.id==='a');
assert.equal(formatLastConnection(later),'18/11/2026 11:50');
assert.equal(formatLastConnection(people.find(p=>p.id==='b')),'Jamais');
const trainee=people.find(p=>p.email==='sanscompte@club.fr');
assert.equal(trainee.account_id,null);
assert.equal(trainee.trainings.length,2);
assert.equal(formatLastConnection(trainee),'Sans compte');
assert.equal(people.filter(p=>p.guest).length,3);
assert(!people.some(p=>p.email==='expired@club.fr'||p.email==='accepted@club.fr'||p.email==='excluded@club.fr'));
assert.equal(people.find(p=>p.email==='old@club.fr').account_id,null);
assert.equal(formatLastConnection(buildUserDirectory({...data,authUsers:null}).find(p=>p.id==='a')),'Indisponible');
const access={active:false,source:null};
const filters={q:'emilie',role:'all',status:'all',category:'training'};
assert(matchesDirectoryFilters(trainee,access,filters));
assert(!matchesDirectoryFilters(trainee,access,{...filters,category:'never-connected'}));
assert(!matchesDirectoryFilters(alice,{active:true,source:'free'},{...filters,q:'',category:'subscribers'}));
assert(matchesDirectoryFilters(alice,{active:true,source:'subscription'},{...filters,q:'',category:'subscribers'}));
// Stable account IDs win if an institution has edited the contact email.
const conflict=buildUserDirectory({...data,candidates:[{id:'conflict',user_id:'a',email:'b@club.fr',cohort_id:'c1'}]});
assert.equal(conflict.find(p=>p.id==='a').trainings.length,1);
assert.equal(conflict.find(p=>p.id==='b').trainings.length,0);
// A stale profile timestamp must never replace a missing Auth login.
assert.equal(buildUserDirectory({...data,authUsers:[{id:'a',email:'alice@club.fr'}]}).find(p=>p.id==='a').last_sign_in_at,null);
console.log('Directory regression scenarios passed');
