import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {withPhase2Examples}=require('../src/components/sites/hawk/data/phase2-examples.ts');
const {DEMO_SCENARIOS,DEMO_EXECUTOR_ID,prepareDemoScenario}=require('../src/components/sites/hawk/data/executor-demo-scenarios.ts');
const S=require('../src/components/sites/hawk/data/executor-streaming.ts');
const O=require('../src/components/sites/hawk/data/executor-observation.ts');
const fresh=()=>withPhase2Examples({groups:[],projects:[],executors:[],batches:[]});
test('known, unknown and huge observation totals stay bounded',()=>{
 assert.equal(O.observationThreshold(240),12);assert.equal(O.observationThreshold(10000),500);
 assert.equal(O.observationThreshold(2000000),1000);assert.equal(O.observationStep(2000000),400);
 assert.equal(O.observationThreshold(0),500);assert.equal(O.observationStep(0),200);
 assert(O.observationCheckpoints(Number.MAX_SAFE_INTEGER).length<=10000);
 for(const n of [NaN,Infinity,1e15,-1,10001])assert.throws(()=>O.validateDemoCount(n));
});
for(const scenario of DEMO_SCENARIOS)test(`demo reaches expected state within six driver ticks: ${scenario.id}`,()=>{
 let w=prepareDemoScenario(fresh(),'phase2-reservoir',scenario.id);
 for(let i=0;i<6;i++)w=S.tickStream(w,DEMO_EXECUTOR_ID,1200);
 const e=w.executors.find(e=>e.id===DEMO_EXECUTOR_ID),s=e.stream;
 if(['cost','input','time','target','idle'].includes(scenario.id))assert.equal(s.stopReason,scenario.id);
 if(scenario.id==='csv')assert.equal(s.source.totalKnown,true);
 if(scenario.id==='csv-invalid')assert.match(s.source.error,/RowKey/);
 if(scenario.id==='insufficient')assert.equal(s.source.waiting,true);
 if(scenario.id==='end')assert.equal(s.phase,'completed');
 if(scenario.id==='error')assert.equal(s.stopReason,'source-error');
 if(scenario.id==='retry')assert(s.failures.length>0 && e.runtime.state==='paused');
 if(scenario.id==='estimate')assert(s.estimateRootIds.length>0);
 if(scenario.id==='zero')assert.equal(s.stages.at(-1).outputs,0);
});
test('switching scenarios reuses batches and does not run the previous demo in background',()=>{
 let w=prepareDemoScenario(fresh(),'phase2-reservoir','cost');const ids=w.executors.find(e=>e.id===DEMO_EXECUTOR_ID).runtime.batchIds.slice(),count=w.batches.length;
 for(const id of ['zero','csv','input','cost'])w=prepareDemoScenario(w,DEMO_EXECUTOR_ID,id);
 assert.equal(w.batches.length,count);assert.deepEqual(w.executors.find(e=>e.id===DEMO_EXECUTOR_ID).runtime.batchIds,ids);
 assert.equal(w.executors.filter(e=>e.runtime?.state==='running').length,1);
});
