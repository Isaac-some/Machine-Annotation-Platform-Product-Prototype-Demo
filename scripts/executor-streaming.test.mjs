import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const S = require('../src/components/sites/hawk/data/executor-streaming.ts');
const R = require('../src/components/sites/hawk/data/executor-runtime.ts');
const D = require('../src/components/sites/hawk/data/delivery.ts');
const { withPhase2Examples } = require('../src/components/sites/hawk/data/phase2-examples.ts');
const fresh = () => withPhase2Examples({ groups: [], projects: [], executors: [], batches: [] });
const get = (w, id = 'phase2-demo') => w.executors.find(e => e.id === id);
const tick = (w, n = 1, id = 'phase2-demo') => { for (let i = 0; i < n; i++) w = S.tickStream(JSON.parse(JSON.stringify(w)), id); return w; };
const sampled = (id = 'phase2-demo') => tick(S.startStream(fresh(), id), 30, id);

test('sample output arrives downstream before upstream is exhausted and is retained for production', () => {
  let w = S.startStream(fresh(), 'phase2-demo'); w = tick(w, 4);
  const s = get(w).stream; assert(s.stages[1].processed > 0); assert(s.admitted < 24);
  w = tick(w, 30); const e = get(w), sampleCost = e.stream.costCents;
  assert.equal(e.stream.phase, 'budget'); assert.equal(e.stream.sampleOutputs, 6); assert.equal(e.stream.predicted, 36);
  const firstKeys = w.batches.find(b => b.id === e.runtime.batchIds[0]).results.map(r => r.id);
  w = S.confirmStreamBudget(w, e.id, 36, 0.8); w = tick(w, 200);
  const completed = get(w); assert.equal(completed.stream.admitted, 24); assert(completed.stream.costCents > sampleCost);
  assert.equal(completed.stream.retryRound, 1); assert.equal(completed.stream.phase, 'completed');
  const keys = w.batches.find(b => b.id === e.runtime.batchIds[0]).results.map(r => r.id);
  assert.equal(new Set(keys).size, keys.length); assert(firstKeys.every(k => keys.includes(k)));
  assert(completed.stream.stages.at(-1).outputs > 24); // one-to-many product price uses final units
});
test('a changed forecast does not silently change the effective formula budget', () => {
  let w = S.confirmStreamBudget(sampled(), 'phase2-demo', 36, 0.8); const before = get(w).stream.budget;
  w = tick(w, 16); assert.deepEqual(get(w).stream.budget, before);
  w = S.confirmStreamBudget(w, 'phase2-demo', 40, 0.9); assert.equal(get(w).stream.budget.cents, 3600); assert.equal(get(w).stream.budgetHistory.length, 2);
});
test('budget stops admission and new retries while downstream draining can exceed the trigger cost', () => {
  let w = sampled('phase2-cost'); const e = get(w, 'phase2-cost');
  w = S.confirmStreamBudget(w, e.id, 36, 0.12);
  for (let i = 0; i < 100 && get(w, e.id).stream.triggerCostCents === undefined; i++) w = tick(w, 1, e.id);
  const trigger = get(w, e.id).stream, admitted = trigger.admitted; assert(trigger.triggerCostCents >= 432); assert(trigger.reminded);
  w = tick(w, 100, e.id); const s = get(w, e.id).stream;
  assert.equal(s.admitted, admitted); assert(admitted < 24); assert.equal(s.retryRound, 0); assert(s.costCents > s.triggerCostCents); assert.equal(s.phase, 'review');
});
test('zero output cannot confirm a budget; incomplete samples have no forecast confirmation', () => {
  let w = S.startStream(fresh(), 'phase2-demo'); assert.throws(() => S.confirmStreamBudget(w, 'phase2-demo', 24, 1), /未跑通/);
  get(w).stream.demoOutcome = 'zero'; w = tick(w, 40); assert.equal(get(w).stream.sampleOutputs, 0); assert.throws(() => S.confirmStreamBudget(w, 'phase2-demo', 24, 1), /零成品/);
});
test('retry is finite, follows the entire first round, and 0 disables automatic retry', () => {
  let w = fresh(); get(w).streamPolicy.maxRetries = 0; w = tick(S.startStream(w, 'phase2-demo'), 40);
  w = S.confirmStreamBudget(w, 'phase2-demo', 36, 1); w = tick(w, 200);
  const e = get(w); assert.equal(e.stream.retryRound, 0); assert(e.stream.failures.length > 0);
  const events = e.stream.events.map(x => x.text); assert(!events.some(x => x.includes('启动第')));
});
test('manual recovery keeps executor, batches, output identities and successful results', () => {
  let w = sampled('phase2-cost'); w = S.confirmStreamBudget(w, 'phase2-cost', 36, 0.12); w = tick(w, 150, 'phase2-cost');
  const before = get(w, 'phase2-cost'), batchIds = [...before.runtime.batchIds];
  w = S.takeOverStream(w, before.id); w = tick(w, 40, before.id); assert(get(w, before.id).stream.failures.length);
  const results = w.batches.filter(b => batchIds.includes(b.id)).flatMap(b => b.results.map(r => r.id));
  const cost = get(w, before.id).stream.costCents;
  w = S.prepareStreamRecovery(w, before.id); w = tick(w, 100, before.id);
  assert.equal(get(w, before.id).stream.failures.length, 0); assert.deepEqual(get(w, before.id).runtime.batchIds, batchIds); assert(get(w, before.id).stream.costCents > cost);
  const after = w.batches.filter(b => batchIds.includes(b.id)).flatMap(b => b.results.map(r => r.id)); assert(results.every(k => after.includes(k))); assert.equal(new Set(after).size, after.length);
});
test('clone excludes all live state and can omit input without changing the source', () => {
  let w = sampled(); const original = JSON.stringify(get(w)); w = R.cloneExecutor(w, 'phase2-demo', { id: 'new', name: 'New', includeInput: false, includeConfiguration: true });
  const clone = get(w, 'new'); assert.equal(JSON.stringify(get(w)), original); assert.equal(clone.stream, undefined); assert.equal(clone.input, undefined); assert.equal(clone.runtime.started, false);
  assert(clone.runtime.batchIds.every(id => !get(w).runtime.batchIds.includes(id))); assert(w.batches.filter(b => clone.runtime.batchIds.includes(b.id)).every(b => !b.results.length && b.cost === '¥ 0.00'));
  assert.throws(() => R.cloneExecutor(w, 'phase2-demo', { name: 'No snapshot', includeInput: true, includeConfiguration: false }), /发布版本/);
});
test('legacy mode defaults to batch; stream export is independent and does not dispatch downstream', () => {
  let w = sampled(); const e = get(w); const id = e.runtime.batchIds[0];
  w = D.setDeliveryMode(w, id, 'none'); assert.equal(w.batches.find(b => b.id === id).deliveryMode, 'none');
  const state = JSON.stringify(get(w).stream); w = D.createExportJob(w, { requestId: 'sample', batchId: id, range: { kind: 'all' }, sorted: true });
  assert.equal(JSON.stringify(get(w).stream), state); assert(w.exportJobs[0].members.length > 0);
  const old = get(w, 'delivery-demo'); assert.equal(old.runMode, undefined); assert(R.canExecutorAction(w, old, 'resume'));
});
const C = require('../src/components/sites/hawk/data/batch-common.ts');
test('alarm window sends only the highest tier, does not reset its timer and never repeats lower tiers', () => {
  let s = C.evaluateAlarm(C.newAlarm(), 20, true, 0); assert.equal(s.windowUntil, 60000);
  s = C.evaluateAlarm(s, 80, true, 30000); assert.equal(s.windowUntil, 60000); assert.equal(s.sent.length, 0);
  s = C.evaluateAlarm(s, 80, true, 60000); assert.deepEqual(s.sent.map(x => x.level), [80]);
  s = C.evaluateAlarm(s, 50, true, 100000); s = C.evaluateAlarm(s, 80, true, 200000); assert.equal(s.sent.length, 1);
  assert.equal(C.evaluateAlarm(C.newAlarm(), 80, false, 0).windowUntil, undefined);
});
test('ordinary paused retry prepares inputs, recovers failed rows first and preserves good/filter counts', () => {
  let b = { id: 1, status: '已暂停', failed: 7, success: 5, filtered: 2, total: 30, nodes: [{ seq: 1, name: 'URL', status: '已完成' }, { seq: 2, name: 'Processor', status: '失败' }] };
  b = C.prepareBatchRetry(b, 1); assert.equal(b.retryTask.phase, 'preparing');
  for (let i = 0; i < 20; i++) C.tickBatchRetry(b);
  assert.equal(b.success, 12); assert.equal(b.failed, 0); assert.equal(b.filtered, 2); assert.equal(b.status, '已暂停'); assert.equal(b.retryTask.recovered, 7);
});
test('a paused stream stage blocks upstream admission and resumes without duplicate output', () => {
  let w = S.startStream(fresh(), 'phase2-demo'); w = tick(w, 3); w = S.toggleStreamStage(w, 'phase2-demo', 1); w = tick(w, 4);
  const admitted = get(w).stream.admitted; w = tick(w, 8); assert.equal(get(w).stream.admitted, admitted);
  w = S.toggleStreamStage(w, 'phase2-demo', 1); w = tick(w, 50); assert.equal(get(w).stream.phase, 'budget'); assert.equal(get(w).stream.sampleOutputs, 6);
});
test('manual continuation explicitly admits remaining fixed input without resetting cumulative cost', () => {
  let w = sampled('phase2-cost'); w = S.confirmStreamBudget(w, 'phase2-cost', 36, 0.12); w = tick(w, 150, 'phase2-cost'); w = S.takeOverStream(w, 'phase2-cost'); w = tick(w, 20, 'phase2-cost');
  const cost=get(w,'phase2-cost').stream.costCents; w=S.continueStreamManually(w,'phase2-cost');w=tick(w,200,'phase2-cost');
  assert.equal(get(w,'phase2-cost').stream.admitted,24);assert(get(w,'phase2-cost').stream.costCents>cost);assert.equal(get(w,'phase2-cost').stream.retryRound,0);
});
test('unknown downstream totals stay unknown and original drain charges are frozen before manual continuation', () => {
 let w=S.startStream(fresh(),'phase2-cost');w=tick(w,4,'phase2-cost');const ids=get(w,'phase2-cost').runtime.batchIds;
 assert.equal(w.batches.find(b=>b.id===ids[1]).total,-1);
 w=tick(w,40,'phase2-cost');w=S.confirmStreamBudget(w,'phase2-cost',36,0.12);w=tick(w,100,'phase2-cost');
 const final=get(w,'phase2-cost').stream.drainFinalCents;assert(final>get(w,'phase2-cost').stream.triggerCostCents);
 w=S.takeOverStream(w,'phase2-cost');w=tick(w,1,'phase2-cost');w=S.continueStreamManually(w,'phase2-cost');w=tick(w,100,'phase2-cost');assert.equal(get(w,'phase2-cost').stream.drainFinalCents,final);assert(get(w,'phase2-cost').stream.costCents>final);
});
