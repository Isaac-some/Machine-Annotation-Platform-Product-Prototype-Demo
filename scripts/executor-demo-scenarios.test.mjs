import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {withPhase2Examples}=require('../src/components/sites/hawk/data/phase2-examples.ts');
const {DEMO_SCENARIOS,DEMO_BOUNDARY_CIDS,DEMO_EXECUTOR_ID,prepareDemoScenario}=require('../src/components/sites/hawk/data/executor-demo-scenarios.ts');
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
 if(DEMO_BOUNDARY_CIDS[scenario.id])assert.equal(e.input,DEMO_BOUNDARY_CIDS[scenario.id]);
 if(['cost','input','time','target','idle'].includes(scenario.id))assert.equal(s.stopReason,scenario.id);
 if(scenario.id==='csv')assert.equal(s.source.totalKnown,true);
 if(scenario.id==='csv-invalid')assert.match(s.source.error,/RowKey/);
 if(scenario.id==='insufficient')assert.equal(s.source.waiting,true);
 if(scenario.id==='end')assert.equal(s.phase,'completed');
 if(scenario.id==='error')assert.equal(s.stopReason,'source-error');
 if(scenario.id==='retry'){
  assert(s.failures.length>0 && e.runtime.state==='paused');
  for(const id of e.runtime.batchIds)assert.equal(w.batches.find(b=>b.id===id).status,'已暂停');
 }
 if(scenario.id==='estimate')assert(s.estimateRootIds.length>0);
 if(scenario.id==='zero')assert.equal(s.stages.at(-1).outputs,0);
});
test('switching scenarios reuses batches and does not run the previous demo in background',()=>{
 let w=prepareDemoScenario(fresh(),'phase2-reservoir','cost');const ids=w.executors.find(e=>e.id===DEMO_EXECUTOR_ID).runtime.batchIds.slice(),count=w.batches.length;
 for(const id of ['zero','csv','input','cost'])w=prepareDemoScenario(w,DEMO_EXECUTOR_ID,id);
 assert.equal(w.batches.length,count);assert.deepEqual(w.executors.find(e=>e.id===DEMO_EXECUTOR_ID).runtime.batchIds,ids);
 assert.equal(w.executors.filter(e=>e.runtime?.state==='running').length,1);
});
test('demo batch identities never collide with other executors and legacy collisions are repaired',()=>{
 let w=fresh();
 const original=new Map(w.batches.map(b=>[b.id,JSON.stringify(b)]));
 for(const scenario of ['cost','retry','input']){
  w=prepareDemoScenario(w,'phase2-reservoir',scenario);
  assert.equal(new Set(w.batches.map(b=>b.id)).size,w.batches.length);
  const e=w.executors.find(e=>e.id===DEMO_EXECUTOR_ID);
  e.runtime.batchIds.forEach((id,index)=>{
   const batch=w.batches.find(b=>b.id===id);
   assert.equal(batch.executorId,DEMO_EXECUTOR_ID);
   assert.equal(batch.failed,e.stream.stages[index].failed);
   assert.equal(batch.success,e.stream.stages[index].processed-e.stream.stages[index].failed);
   if(index)assert.equal(batch.inputFromBatchId,e.runtime.batchIds[index-1]);
  });
  for(const [id,snapshot]of original)assert.equal(JSON.stringify(w.batches.find(b=>b.id===id)),snapshot);
  if(scenario==='retry')assert(e.stream.failures.some(t=>t.stage===1),'the retry demo must include a second-stage failure');
 }
 const e=w.executors.find(e=>e.id===DEMO_EXECUTOR_ID);
 e.runtime.batchIds[0]=w.batches.find(b=>b.executorId!==DEMO_EXECUTOR_ID).id;
 w=prepareDemoScenario(w,DEMO_EXECUTOR_ID,'retry');
 assert.equal(new Set(w.batches.map(b=>b.id)).size,w.batches.length);
});
test('retry fixture exposes failed rows and clears only the stage being recovered',()=>{
 let w=prepareDemoScenario(fresh(),'phase2-reservoir','retry');
 const e=w.executors.find(e=>e.id===DEMO_EXECUTOR_ID),ids=e.runtime.batchIds;
 const first=w.batches.find(b=>b.id===ids[0]).failureDetails;
 const second=w.batches.find(b=>b.id===ids[1]);
 assert.equal(second.failureDetails.length,2);
 assert.equal(second.failureDetails.length,second.failed);
 assert(second.failureDetails.every(row=>row.nodeSeq===-1),'synthetic failures must not invent an operator location');
 w=S.retryStreamStage(w,DEMO_EXECUTOR_ID,1);
 assert.deepEqual(w.batches.find(b=>b.id===ids[1]).failureDetails,[]);
 assert.deepEqual(w.batches.find(b=>b.id===ids[0]).failureDetails,first);
});
