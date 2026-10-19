const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict'),vm=require('node:vm');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,p);
const source=fs.readFileSync('components/institutionnel/InstitutionalPlayerWorkflow.tsx','utf8');
const chunk=source.slice(source.indexOf('const selectablePlayers ='),source.indexOf('  const currentParts ='));
function selection(filteredPlayers,selected,click=false){let result=selected;const context={filteredPlayers,selected,setSelected:value=>result=typeof value==='function'?value(result):value,useEffect:fn=>fn(),Set};vm.runInNewContext(chunk+(click?'\ntoggleVisiblePlayers();':''),context);return Array.from(result)}
const boys=Array.from({length:37},(_,i)=>({id:'boy-'+i})),girls=Array.from({length:37},(_,i)=>({id:'girl-'+i}));
assert.deepEqual(selection(boys,[...girls,...boys].map(p=>p.id)),boys.map(p=>p.id),'Changing filter removes hidden selections: 74 becomes 37');
assert.deepEqual(selection(boys,girls.map(p=>p.id),true),boys.map(p=>p.id),'Select all replaces the previous group, never accumulates 74');
assert.deepEqual(selection(boys,boys.map(p=>p.id),true),[],'Deselect all empties selection');
assert.deepEqual(selection([{id:'a'},{id:'b'},{id:'archived',archived:true}],['a','hidden'],true),['a','b']);
assert.deepEqual(selection([{id:'a'},{id:'b'}],['a']),['a'],'Manual subset remains a subset');
(async()=>{const {createTrombinoscopePdf}=require('../lib/institutionnel/trombinoscope-pdf.ts');for(const count of [1,10,11,23,37]){const doc=await createTrombinoscopePdf(Array.from({length:count},(_,i)=>({first_name:'First '+i,last_name:'Last '+i})),{name:'Test institution'});assert.equal(doc.getNumberOfPages(),Math.ceil(count/10));assert.equal(Math.round(doc.internal.pageSize.getWidth()),297);assert.equal(Math.round(doc.internal.pageSize.getHeight()),210);const bytes=doc.output();assert(bytes.startsWith('%PDF-'));assert(bytes.includes('LAST '+(count-1)));}console.log('Selection: filtered select/deselect, hidden selections excluded from actions, archived excluded. Actual PDF: landscape, pagination and last player retained for 1/10/11/23/37 players.');})().catch(e=>{console.error(e);process.exitCode=1});
