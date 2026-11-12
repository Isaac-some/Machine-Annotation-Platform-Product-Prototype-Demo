import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const T = require('../src/components/sites/hawk/data/executor-time-estimates.ts');
const O = require('../src/components/sites/hawk/data/executor-production-observation.ts');
const S = require('../src/components/sites/hawk/data/executor-streaming.ts');
const R = require('../src/components/sites/hawk/data/executor-runtime.ts');
const { normalizeExecutorTarget } = require('../src/components/sites/hawk/data/executor-target.ts');
const { resumeProductionForecast } = require('../src/components/sites/hawk/data/executor-resume-forecast.ts');
const { withPhase2Examples } = require('../src/components/sites/hawk/data/phase2-examples.ts');
const { streamCostEvidence } = require('../src/components/sites/hawk/data/executor-stream-estimates.ts');
const fixture = () => withPhase2Examples({ groups: [], projects: [], executors: [], batches: [] });
const item = w => w.executors.find(e => e.id === 'phase2-time-basic');

test('same 1000 products / 1000 minutes estimates 500, 200 and 700 additional minutes', () => {
 const e=item(fixture()), before=JSON.stringify(e), f=T.estimateStreamTimeAddition(e,500,200);
 assert.equal(Math.round(f.current.hours.base*60),500);assert.equal(Math.round(f.incremental.base*60),200);assert.equal(Math.round(f.combined.hours.base*60),700);assert.equal(JSON.stringify(e),before);
 assert.equal(streamCostEvidence(e).outputs,f.current.evidence.observedOutputs);
});
test('cost and time both wait for a common completed sample and valid timing',()=>{
 for(const change of [e=>delete e.stream.productionObservation,e=>e.stream.productionObservation.activeMs=undefined,e=>e.stream.productionObservation.roots=[1],e=>e.stream.productionObservation.metrics[1].costCents=-1]){
  const e=item(fixture());change(e);assert.equal(streamCostEvidence(e).ready,false);assert.equal(T.streamTimeEvidence(e).ready,false);
 }
});
test('zero output work stays in sample cost and time; no output gives no estimate',()=>{
 const e=item(fixture()),o=e.stream.productionObservation;o.segments=[0,0,100,100,100].map(outputs=>({activeMs:60000,outputs}));
 assert.equal(T.streamTimeEvidence(e).slowRate,0);assert.equal(T.estimateStreamTimeByProducts(e,100).hours.high,undefined);
 Object.values(o.metrics).forEach(row=>row.finalOutputs=0);assert.equal(T.streamTimeEvidence(e).ready,false);assert.equal(streamCostEvidence(e).ready,false);
});
test('workflow and speed-affecting changes invalidate both estimates; upper limits do not',()=>{
 for(const change of [e=>e.flows[0].version++,e=>e.concurrency=9,e=>e.streamPolicy.maxRetries++]){const e=item(fixture());change(e);assert.equal(streamCostEvidence(e).ready,false);assert.equal(T.streamTimeEvidence(e).ready,false);}
 const e=item(fixture());e.streamPolicy.costLimitCents=999999;assert.equal(T.streamTimeEvidence(e).ready,true);
});
test('parallel intervals count once and in-flight 2 yuan is excluded from 12 yuan / 70 products',()=>{
 assert.equal(O.intervalDuration([[0,100],[50,200],[300,400]]),300);
 const e=item(fixture()),s=e.stream;s.source={initialInputCount:100,totalKnown:true};s.inputMetrics={1:{costCents:1000,finalOutputs:70},2:{costCents:200,finalOutputs:0}};s.costCents=1200;s.admitted=2;
 s.queues=[[{root:2}],[],[]];s.productionSampling={configKey:O.productionConfigurationKey(e),afterRoot:0,lastStep:-1};s.processingIntervals={1:[[0,120000]],2:[[100000,140000]]};O.freezeProductionObservation(e,true);
 // Use a 1-input baseline so one settled input meets the sampling threshold.
 s.source.initialInputCount=1;assert.equal(streamCostEvidence(e).base,1000/70);assert.equal(T.streamTimeEvidence(e).observedOutputs,70);assert.equal(T.streamTimeEvidence(e).observedHours,120000/3600000);
});
test('real tick checkpoints freeze cost and time together and no later clock legitimizes unmeasured work',()=>{
 let w=fixture();const id='phase2-demo';w=S.startStream(w,id);const e=w.executors.find(e=>e.id===id);e.stream.source.totalKnown=true;
 for(let i=0;i<45;i++)w=S.tickStream(w,id,1000);
 const live=w.executors.find(e=>e.id===id);assert.equal(streamCostEvidence(live).ready,true);assert.equal(T.streamTimeEvidence(live).ready,true);assert.equal(streamCostEvidence(live).outputs,T.streamTimeEvidence(live).observedOutputs);
 live.stream.incompleteTimingRoots={...Object.fromEntries(Object.keys(live.stream.inputMetrics).map(k=>[k,true]))};O.freezeProductionObservation(live,true);assert.equal(T.streamTimeEvidence(live).ready,false);assert.equal(streamCostEvidence(live).ready,false);
});
test('legacy percentage migrates from original baseline and missing baseline requires confirmation',()=>{
 const e=item(fixture());e.stream.source={initialInputCount:35};e.streamPolicy.targetOutputPercent=50;normalizeExecutorTarget(e);assert.equal(e.streamPolicy.targetOutputCount,18);assert.equal(e.streamPolicy.targetOutputPercent,undefined);
 const bad=item(fixture());delete bad.stream.source;bad.streamPolicy.targetOutputPercent=50;normalizeExecutorTarget(bad);assert.equal(bad.streamPolicy.legacyTargetUnresolved,true);assert.match(S.streamRunBlockReason(bad),/重新确认/);
});
test('a stage resumed within the measured interval contributes only its active portion',()=>{
 let w=fixture(),e=item(w),id=e.id;e.runtime.state='running';e.stream.phase='production';e.stream.admitted=1002;e.stream.activeRunMs=0;e.stream.observationRunMs=0;e.stream.clockBoundaryAt=1000;e.stream.stageClockBoundaryAt=[1000,1900,1000];e.stream.queues=[[{key:'1001',root:1001,stage:0,attempt:0}],[{key:'1002',root:1002,stage:1,attempt:0}],[]];
 w=S.tickStream(w,id,1000,2000);e=item(w);assert.equal(e.stream.activeRunMs,1000);assert.equal(O.intervalDuration(e.stream.processingIntervals[1001]),1000);assert.equal(O.intervalDuration(e.stream.processingIntervals[1002]),100);
});
test('legacy missing cumulative timing starts fresh measured samples without inventing past runtime',()=>{
 let w=fixture();const id='phase2-demo';w=S.startStream(w,id);let e=w.executors.find(e=>e.id===id);delete e.stream.activeRunMs;delete e.stream.timeObservation;
 for(let i=0;i<45;i++)w=S.tickStream(w,id,1000);
 e=w.executors.find(e=>e.id===id);assert.equal(e.stream.activeRunMs,undefined);assert.equal(streamCostEvidence(e).ready,true);assert.equal(T.streamTimeEvidence(e).ready,true);assert(e.stream.productionObservation.activeMs>0);
});
test('target can change after start, stays cumulative, and all simultaneous limits must clear',()=>{
 let w=fixture(),e=item(w),id=e.id;e.streamPolicy={maxRetries:0,costLimitCents:e.stream.costCents,inputLimit:e.stream.admitted,targetOutputCount:1000};
 assert.equal(R.canExecutorAction(w,e,'resume'),false);
 w=S.setStreamLimits(w,id,{...e.streamPolicy,targetOutputCount:2000});e=item(w);assert.equal(e.runtime.state,'paused');assert.equal(R.canExecutorAction(w,e,'resume'),false);
 w=S.setStreamLimits(w,id,{costLimitCents:50000,inputLimit:2000,targetOutputCount:2000});e=item(w);assert.equal(R.canExecutorAction(w,e,'resume'),true);assert.equal(e.stream.costCents,40000);assert.throws(()=>S.setStreamLimits(w,id,{targetOutputCount:500}),/当前累计成品/);
});
test('resume forecast uses the shortest remaining constraint and does not write an input ceiling',()=>{
 const e=item(fixture());e.streamPolicy={maxRetries:0,costLimitCents:44000,runtimeLimitMs:e.stream.activeRunMs+200*60000,targetOutputCount:1500};const before=JSON.stringify(e);const f=resumeProductionForecast(e);assert.equal(f.base,100);assert.equal(f.low,100);assert.equal(f.high,100);assert.equal(JSON.stringify(e),before);assert.equal(e.streamPolicy.inputLimit,undefined);
 delete e.stream.productionObservation;assert.match(resumeProductionForecast(e).reason,/不足/);
});
test('confirmation rechecks batch blockers created after the dialog opened',()=>{
 const w=fixture(),e=item(w);assert.equal(R.canExecutorAction(w,e,'resume'),true);
 w.batches.find(b=>b.id===e.runtime.batchIds[0]).batchIssues=[{code:'unavailable',title:'资源不可用',message:'请重新检查'}];
 assert.equal(R.canExecutorAction(w,e,'resume'),false);assert.throws(()=>S.resumeStream(w,e.id),/阻断故障/);assert.equal(e.runtime.state,'paused');
});
test('ending is permanent while existing queues drain and batch results remain exportable',()=>{
 let w=fixture(),e=item(w),id=e.id;e.stream.queues[0]=[{key:'1001',root:1001,stage:0,attempt:0}];e.stream.admitted=1001;
 w=R.changeExecutorState(w,id,'end');const admitted=item(w).stream.admitted;
 for(let i=0;i<25;i++)w=S.tickStream(w,id,1000);
 e=item(w);assert.equal(e.runtime.state,'ended');assert.equal(e.stream.phase,'completed');assert.equal(e.stream.admitted,admitted);assert.equal(R.canExecutorAction(w,e,'resume'),false);assert.throws(()=>S.resumeStream(w,id));assert.throws(()=>S.recordStreamSourceEvent(w,id,{kind:'data',count:10}));
 assert(w.batches.filter(b=>e.runtime.batchIds.includes(b.id)).some(b=>b.results.length>0));assert.equal(R.canExecutorAction(JSON.parse(JSON.stringify(w)),e,'start'),false);
});
test('a paused batch can finish after executor intake ends without reopening the source',()=>{
 let w=fixture(),e=item(w),id=e.id;e.stream.queues[0]=[{key:'1001',root:1001,stage:0,attempt:0}];e.stream.admitted=1001;e.stream.pausedStages=[0];e.stream.source={initialInputCount:e.inputCount,lastActivityAt:Date.now(),closed:false,waiting:false};
 w=R.changeExecutorState(w,id,'end');w=S.tickStream(w,id,1000);assert.equal(item(w).stream.queues[0].length,1);
 w=S.toggleStreamStage(w,id,0);for(let i=0;i<25;i++)w=S.tickStream(w,id,1000);
 e=item(w);assert.equal(e.runtime.state,'ended');assert.equal(e.stream.phase,'completed');assert.equal(e.stream.admitted,1001);assert.equal(e.stream.source.closed,true);
});
