import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { streamCostEvidence, estimateStreamPlan } = require('../src/components/sites/hawk/data/executor-stream-estimates.ts');
const { summarizeRunTime } = require('../src/components/sites/hawk/data/executor-run-time.ts');
const { cloneExecutor } = require('../src/components/sites/hawk/data/executor-runtime.ts');
const { withPhase2Examples } = require('../src/components/sites/hawk/data/phase2-examples.ts');
const executor = () => ({ inputCount: 1000, streamPolicy: { observationSize: 100 }, stream: { admitted: 200, costCents: 90000, settledRootIds: Array.from({length:100},(_,i)=>i+1), inputMetrics: Object.fromEntries(Array.from({length:101},(_,i)=>[i+1,{costCents:40,finalOutputs:2}])) } });

test('paired settled cohorts exclude in-flight cost and use the same base for both directions', () => {
  const e=executor(), budget=estimateStreamPlan(e,{budgetYuan:20}), target=estimateStreamPlan(e,{products:100});
  assert.deepEqual(budget.products,{low:100,base:100,high:100}); assert.deepEqual(target.cost,{low:2000,base:2000,high:2000});
  e.stream.costCents*=10; e.stream.inputMetrics[101].costCents=999999;
  assert.deepEqual(estimateStreamPlan(e,{budgetYuan:20}).products,budget.products);
  assert.equal(streamCostEvidence(e).remainingInputs,800);
});
test('zero-output cohorts are retained and block an optimistic forecast', () => {
  const e=executor();for(let i=1;i<=10;i++)e.stream.inputMetrics[i].finalOutputs=0;
  const evidence=streamCostEvidence(e);assert.equal(evidence.emptyGroups,1);assert.equal(evidence.ready,false);assert.equal(estimateStreamPlan(e,{budgetYuan:20}).products,undefined);
});
test('small, missing, invalid and zero-cost samples do not produce Infinity or a fake range', () => {
  for(const mutate of [e=>e.stream.settledRootIds.pop(),e=>delete e.stream.inputMetrics[1],e=>e.stream.inputMetrics[1].costCents=-1,e=>Object.values(e.stream.inputMetrics).forEach(r=>r.costCents=0)]) {
    const e=executor();mutate(e);assert.equal(streamCostEvidence(e).ready,false);assert.equal(estimateStreamPlan(e,{products:1}).cost,undefined);
  }
  assert.equal(estimateStreamPlan(executor(),{budgetYuan:NaN}).products,undefined);
  assert.equal(estimateStreamPlan(executor(),{products:1.5}).cost,undefined);
  assert.deepEqual(estimateStreamPlan(executor(),{products:0}).cost,{low:0,base:0,high:0});
});
test('retries and one-to-many outputs update forecasts from observed root totals', () => {
  const e=executor();Object.values(e.stream.inputMetrics).forEach(row=>{row.costCents=80;row.finalOutputs=4;});
  assert.equal(streamCostEvidence(e).base,20);
  Object.values(e.stream.inputMetrics).forEach(row=>row.costCents+=40);
  assert.equal(streamCostEvidence(e).base,30);
});
const pair=(span,kind,start,end,extra={})=>[
  {id:span+'-start',span,kind,edge:'start',at:1000+start,monotonicMs:start,clock:'worker-A',...extra},
  {id:span+'-end',span,kind,edge:'end',at:1000+end,monotonicMs:end,clock:'worker-A',...extra},
];
const attempt={input:1,stage:0,attempt:0};
test('monotonic active work excludes union of pause/queue/wait; wall includes all waiting', () => {
  const events=[...pair('work','processing',0,10000,attempt),...pair('pause','pause',1000,3000),...pair('wait','resource-wait',2000,4000,attempt),...pair('queue','queue',6000,7000,attempt)];
  const s=summarizeRunTime({startedAt:1000,finishedAt:21000,events},99999);
  assert.equal(s.activeMs,6000);assert.equal(s.wallMs,20000);assert.equal(s.pauseMs,2000);assert.equal(s.waitMs,2000);assert.equal(s.queueMs,1000);
});
test('duplicate/reordered events and overlapping processing segments do not double count; retries count', () => {
  const work=pair('work','processing',0,1000,attempt),events=[...work,...work,...pair('overlap','processing',500,1500,attempt),...pair('retry','processing',2000,3000,{...attempt,attempt:1})].reverse();
  const s=summarizeRunTime({startedAt:0,events},5000);assert.equal(s.activeMs,2500);assert.equal(s.completedAttempts,2);
});
test('restart, negative spans, missing end and uncertain pauses never inflate completed active work', () => {
  const restart=pair('restart','processing',0,10000,attempt);restart[1].clock='worker-B';
  const events=[...restart,...pair('negative','processing',1000,0,attempt),pair('missing','processing',0,10000,attempt)[0]];
  const s=summarizeRunTime({startedAt:0,events},20000);assert.equal(s.activeMs,undefined);assert.equal(s.invalid,2);assert.equal(s.incomplete,1);
  const uncertain=summarizeRunTime({startedAt:0,events:[...pair('work','processing',0,10000,attempt),pair('pause','pause',1000,2000)[0]]},20000);
  assert.equal(uncertain.activeMs,undefined);assert.equal(summarizeRunTime(undefined,0).wallMs,undefined);
});
test('cloning carries actual policy but clears the source budget and every runtime record', () => {
  const w=withPhase2Examples({groups:[],projects:[],executors:[],batches:[]});const source=w.executors.find(e=>e.id==='phase2-live'),before=JSON.stringify(source);
  const cloned=cloneExecutor(w,source.id,{id:'cloned-budget',name:'Clone',includeInput:true,includeConfiguration:true}).executors.at(-1);
  assert.equal(cloned.streamPolicy.costLimitCents,undefined);assert.equal(cloned.streamPolicy.unitCostMin,.2);assert.equal(cloned.stream,undefined);assert.equal(cloned.runtime.started,false);assert.equal(JSON.stringify(source),before);
});
