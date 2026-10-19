const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict'),vm=require('node:vm');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,p);
const source=fs.readFileSync('components/institutionnel/InstitutionalPlayerWorkflow.tsx','utf8');
const chunk=source.slice(source.indexOf('const selectablePlayers ='),source.indexOf('\n',source.indexOf('});',source.indexOf('const toggleVisiblePlayers =')))+1);
assert(chunk.includes('toggleVisiblePlayers'));
function toggle(filteredPlayers,selected){let result;vm.runInNewContext(chunk+'\ntoggleVisiblePlayers();',{filteredPlayers,selected,setSelected:fn=>result=fn(selected),Set});return Array.from(result)}
assert.deepEqual(toggle([{id:'a'},{id:'b'},{id:'archived',archived:true}],['hidden']),['hidden','a','b']);
assert.deepEqual(toggle([{id:'a'},{id:'b'}],['hidden','a','b']),['hidden']);
assert.deepEqual(toggle([{id:'a'},{id:'b'}],['a']),['a','b']);
(async()=>{const {createTrombinoscopePdf}=require('../lib/institutionnel/trombinoscope-pdf.ts');for(const count of [1,10,11,23]){const doc=await createTrombinoscopePdf(Array.from({length:count},(_,i)=>({first_name:'First '+i,last_name:'Last '+i})),{name:'Test institution'});assert.equal(doc.getNumberOfPages(),Math.ceil(count/10));assert.equal(Math.round(doc.internal.pageSize.getWidth()),297);assert.equal(Math.round(doc.internal.pageSize.getHeight()),210);const bytes=doc.output();assert(bytes.startsWith('%PDF-'));assert(bytes.includes('LAST '+(count-1)));}console.log('Selection: filtered select/deselect, hidden selections preserved, archived excluded. Actual PDF: landscape, pagination and last player retained for 1/10/11/23 players.');})().catch(e=>{console.error(e);process.exitCode=1});
