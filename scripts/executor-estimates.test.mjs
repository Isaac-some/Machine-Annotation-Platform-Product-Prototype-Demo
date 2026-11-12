import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { streamCostEvidence, estimateStreamPlan, estimateStreamProductsByTime } = require('../src/components/sites/hawk/data/executor-stream-estimates.ts');
const { summarizeRunTime } = require('../src/components/sites/hawk/data/executor-run-time.ts');
const { cloneExecutor } = require('../src/components/sites/hawk/data/executor-runtime.ts');
const { withPhase2Examples } = require('../src/components/sites/hawk/data/phase2-examples.ts');
const { prepareDemoScenario, beginDemoScenario, DEMO_EXECUTOR_ID } = require('../src/components/sites/hawk/data/executor-demo-scenarios.ts');
const { tickStream, estimateConfigurationKey } = require('../src/components/sites/hawk/data/executor-streaming.ts');
const executor = () => { const e = ({ inputCount: 1100, streamPolicy: { observationSize: 100 }, stream: { source: { initialInputCount: 20000 }, admitted: 200, settledInputs: 1000, estimateAtInputCount: 1000, estimateRootIds: Array.from({length:1000},(_,i)=>i+2), estimateMetrics: Object.fromEntries(Array.from({length:1000},(_,i)=>[i+2,{costCents:40,finalOutputs:2}])), settledRootIds: Array.from({length:1000},(_,i)=>i+2), inputMetrics: Object.fromEntries(Array.from({length:1001},(_,i)=>[i+1,{costCents:40,finalOutputs:2}])) } }); e.stream.productionObservation = {version:1,configKey:estimateConfigurationKey(e),roots:e.stream.estimateRootIds,metrics:e.stream.estimateMetrics,activeMs:3600000,segments:[],source:'synthetic-demo',updatedAt:0}; return e; };

test('paired settled cohorts exclude in-flight cost and use the same base for both directions', () => {
  const e=executor(), budget=estimateStreamPlan(e,{budgetYuan:20}), target=estimateStreamPlan(e,{products:100});
  assert.deepEqual(budget.products,{low:100,base:100,high:100}); assert.deepEqual(target.cost,{low:2000,base:2000,high:2000});
  e.stream.costCents*=10; e.stream.inputMetrics[1].costCents=999999;
  assert.deepEqual(estimateStreamPlan(e,{budgetYuan:20}).products,budget.products);
  assert.equal(streamCostEvidence(e).remainingInputs,900);
});
test('complete zero-output groups retain their costs and the baseline without inventing a finite range', () => {
  const e=executor();for(let i=2;i<=101;i++)e.stream.estimateMetrics[i].finalOutputs=0;
  const evidence=streamCostEvidence(e);assert.equal(evidence.emptyGroups,1);assert.equal(evidence.ready,true);
  assert.equal(evidence.base,40000/1800);assert.equal(evidence.low,undefined);assert.equal(evidence.high,undefined);
  assert.match(evidence.rangeReason,/零产出/);
  assert.deepEqual(estimateStreamPlan(e,{budgetYuan:20}).products,{base:90,low:undefined,high:undefined});
  assert.deepEqual(estimateStreamPlan(e,{products:100}).cost,{base:2223,low:undefined,high:undefined});
});
test('an incomplete zero-output tail affects the baseline but does not invalidate complete-group ranges', () => {
  const e=executor();e.stream.source.initialInputCount=240;e.stream.estimateRootIds=e.stream.estimateRootIds.slice(0,17);e.stream.productionObservation.roots=e.stream.estimateRootIds;
  e.stream.estimateMetrics[e.stream.estimateRootIds.at(-1)].finalOutputs=0;
  const evidence=streamCostEvidence(e);
  assert.equal(evidence.ready,true);assert.equal(evidence.emptyGroups,0);assert.equal(evidence.groups,8);
  assert.equal(evidence.base,680/32);assert.equal(evidence.high,680/32);
  assert.equal(estimateStreamPlan(e,{budgetYuan:20}).products.base,94);
});
test('a wholly zero-output sample still cannot forecast cost or capacity', () => {
  const e=executor();Object.values(e.stream.estimateMetrics).forEach(row=>row.finalOutputs=0);
  assert.equal(streamCostEvidence(e).ready,false);
  assert.equal(estimateStreamPlan(e,{budgetYuan:20}).products,undefined);
  assert.equal(estimateStreamPlan(e,{products:100}).cost,undefined);
});
test('live small-batch forecasts never disappear as failed tail inputs arrive at refresh checkpoints', () => {
  for(const elapsed of [1200,120000]){
    let w=beginDemoScenario(prepareDemoScenario(withPhase2Examples({groups:[],projects:[],executors:[],batches:[]}),'phase2-reservoir','estimate'),DEMO_EXECUTOR_ID),observed=false;
    for(let tick=0;tick<300;tick++){
      const e=w.executors.find(e=>e.id===DEMO_EXECUTOR_ID),evidence=streamCostEvidence(e);
      if(evidence.samples>=12 && evidence.outputs>0){
        observed=true;assert.equal(evidence.ready,true,`forecast disappeared at ${evidence.samples} samples`);
        assert(Number.isFinite(estimateStreamPlan(e,{budgetYuan:1577.54}).products?.base));
      }
      w=tickStream(w,DEMO_EXECUTOR_ID,elapsed);
    }
    assert(observed);
  }
});
test('changing a workflow invalidates the cost baseline as well as its range', () => {
  const e=executor();e.stream.estimateConfigKey=estimateConfigurationKey(e);e.flows=[{id:'changed-workflow'}];
  assert.equal(streamCostEvidence(e).ready,false);
  assert.match(estimateStreamPlan(e,{budgetYuan:20}).reason,/配置已变化/);
});
test('small, missing, invalid and zero-cost samples do not produce Infinity or a fake range', () => {
  for(const mutate of [e=>e.stream.estimateRootIds.pop(),e=>delete e.stream.estimateMetrics[2],e=>e.stream.estimateMetrics[2].costCents=-1,e=>Object.values(e.stream.estimateMetrics).forEach(r=>r.costCents=0)]) {
    const e=executor();mutate(e);assert.equal(streamCostEvidence(e).ready,false);assert.equal(estimateStreamPlan(e,{products:1}).cost,undefined);
  }
  assert.equal(estimateStreamPlan(executor(),{budgetYuan:NaN}).products,undefined);
  assert.equal(estimateStreamPlan(executor(),{products:1.5}).cost,undefined);
  assert.deepEqual(estimateStreamPlan(executor(),{products:0}).cost,{low:0,base:0,high:0});
});
test('retries and one-to-many outputs update forecasts from observed root totals', () => {
  const e=executor();Object.values(e.stream.estimateMetrics).forEach(row=>{row.costCents=80;row.finalOutputs=4;});
  assert.equal(streamCostEvidence(e).base,20);
  Object.values(e.stream.estimateMetrics).forEach(row=>row.costCents+=40);
  assert.equal(streamCostEvidence(e).base,30);
});
test('estimate evidence remains fixed between configured refresh checkpoints', () => {
  const e=executor(), before=streamCostEvidence(e);
  e.stream.inputMetrics[2].costCents=999999; e.stream.inputMetrics[2].finalOutputs=0;
  assert.equal(streamCostEvidence(e).base,before.base);
});
test('time forecast uses a paired time observation and does not cap products by raw input count', () => {
  const e=withPhase2Examples({groups:[],projects:[],executors:[],batches:[]}).executors.find(e=>e.id==='phase2-time-basic');
  const plan=estimateStreamProductsByTime(e,4);
  assert.equal(plan.rate,60);assert.equal(plan.products,240);assert.equal(plan.observedOutputs,1000);assert.equal(plan.observedHours,1000/60);
  e.inputCount=1001;assert.equal(estimateStreamProductsByTime(e,4).products,240);
  assert.equal(estimateStreamProductsByTime(e,-1).products,undefined);
});
test('a legacy accumulated clock cannot be paired with unrelated cost-sample outputs', () => {
  const e=executor();delete e.stream.productionObservation;e.stream.activeRunMs=3600000;
  assert.match(estimateStreamProductsByTime(e,4).reason,/同一批|同一观测/);
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
  const w=withPhase2Examples({groups:[],projects:[],executors:[],batches:[]});const source=w.executors.find(e=>e.id==='phase2-live');source.streamPolicy.unitCostMin=.2;source.streamPolicy.unitCostMax=.4;const before=JSON.stringify(source);
  const cloned=cloneExecutor(w,source.id,{id:'cloned-budget',name:'Clone',includeInput:true,includeConfiguration:true}).executors.at(-1);
  assert.equal(cloned.streamPolicy.costLimitCents,undefined);assert.equal(cloned.streamPolicy.unitCostMin,.2);assert.equal(cloned.streamPolicy.unitCostMax,.4);assert.equal(cloned.stream,undefined);assert.equal(cloned.runtime.started,false);assert.equal(JSON.stringify(source),before);
});

test('an exhausted closed source reports zero additional output rather than unlimited capacity', () => {
  const e=withPhase2Examples({groups:[],projects:[],executors:[],batches:[]}).executors.find(e=>e.id==='phase2-time-basic');
  e.inputCount=e.stream.admitted;e.stream.source={initialInputCount:e.inputCount,totalKnown:true,closed:true,waiting:false,lastActivityAt:0};
  const time=estimateStreamProductsByTime(e,4),budget=estimateStreamPlan(e,{budgetYuan:20});
  assert.equal(time.products,0);assert.equal(time.theoreticalProducts,240);assert.equal(time.supply.status,'exhausted');
  assert.deepEqual(budget.products,{low:0,base:0,high:0});assert.match(time.supplyWarning,/全部处理|结束/);
  assert.equal(estimateStreamPlan(e,{products:100}).cost,undefined);
});
test('open sources with no available work expose their supply assumption without capping one-to-many yield', () => {
  const e=withPhase2Examples({groups:[],projects:[],executors:[],batches:[]}).executors.find(e=>e.id==='phase2-time-basic');
  e.inputCount=e.stream.admitted;e.stream.source={initialInputCount:e.inputCount,totalKnown:true,closed:false,waiting:true,lastActivityAt:0};
  const waiting=estimateStreamProductsByTime(e,4);assert.equal(waiting.products,240);assert.equal(waiting.supply.status,'waiting');assert.match(waiting.supplyWarning,/补充输入|等待新增/);
  e.inputCount++;e.stream.source.waiting=false;
  const ongoing=estimateStreamProductsByTime(e,4);assert.equal(ongoing.products,240);assert.equal(ongoing.supply.status,'unverified');
});
