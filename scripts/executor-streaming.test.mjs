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
// These finite-source regression cases explicitly announce that no further data will arrive.
const finiteStart = (w, id) => { const next = S.recordStreamSourceEvent(S.startStream(w, id), id, { kind: 'end' }); get(next, id).stream.source.totalKnown = true; return next; };
const started = (id = 'phase2-demo') => finiteStart(fresh(), id);
const sampled = (id = 'phase2-demo') => tick(started(id), 30, id);

test('streaming starts immediately and completes a source that explicitly ended without a sample gate', () => {
  let w = started(); assert.equal(get(w).stream.phase, 'production'); assert.equal(get(w).stream.admitted, 0);
  w = tick(w, 200); const completed = get(w);
  assert.equal(completed.stream.admitted, 24); assert.equal(completed.stream.phase, 'completed');
  assert.equal(completed.stream.retryRound, 1); assert(completed.stream.settledInputs >= 24);
  assert(completed.stream.stages[1].processed > 0); assert(completed.stream.stages.at(-1).outputs > 24);
  assert.equal(Object.values(completed.stream.inputMetrics).reduce((sum, row) => sum + row.costCents, 0), completed.stream.costCents);
  assert.equal(Object.values(completed.stream.inputMetrics).reduce((sum, row) => sum + row.finalOutputs, 0), completed.stream.stages.at(-1).outputs);
  const keys = w.batches.find(b => b.id === completed.runtime.batchIds[0]).results.map(r => r.id);
  assert.equal(new Set(keys).size, keys.length);
});
test('10,000-input demo fixture loads ready without pre-running production ticks', () => {
  const e = get(fresh(), 'phase2-live');
  assert.equal(e.inputCount, 10000);
  assert.equal(e.runtime.state, 'ready');
  assert.equal(e.runtime.started, false);
  assert.equal(e.stream, undefined);
  assert.equal(e.streamPolicy.observationSize, 1000);
});
test('workflow revision change restarts the time forecast sample window at the configured step', () => {
  let w = started(); const e = get(w); e.inputCount = 5000; e.stream.source.initialInputCount = 5000; e.streamPolicy.observationSize = 100;
  e.stream.admitted = 500; e.stream.settledInputs = 500; e.stream.activeRunMs = 4 * 3600000;
  e.stream.inputMetrics = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [i + 1, { costCents: 30, finalOutputs: 2 }]));
  e.stream.settledRootIds = Array.from({ length: 500 }, (_, i) => i + 1); e.stream.estimateRootIds = e.stream.settledRootIds.slice();
  e.stream.estimateMetrics = Object.fromEntries(e.stream.settledRootIds.map(root => [root, { costCents: 30, finalOutputs: 2 }]));
  e.stream.estimateConfigKey = JSON.stringify(e.flows.map(flow => ({ ...flow, version: 0 })));
  e.runtime.state = 'running'; e.flows[0].version = (e.flows[0].version ?? 1) + 1;
  w = S.tickStream(w, e.id, 3600000);
  assert.equal(get(w).stream.timeEstimateRootIds.length, 0);
  assert.equal(get(w).stream.estimateWindowReady, true);
  for (let i = 0; i < 800; i++) w = S.tickStream(w, e.id, 1000);
  const updated = get(w).stream;
  assert.equal(updated.timeEstimateRootIds.length, 100);
  assert(updated.timeEstimateRootIds.every(root => root > 500));
  assert(updated.estimateWindowActiveRunMs > 0);
});
test('optional cost ceiling stops new admission, drains in-flight work and leaves room to adjust the cap', () => {
  let w = fresh(); get(w).streamPolicy.costLimitCents = 432; get(w).streamPolicy.reminderRatio = 60;
  w = finiteStart(w, 'phase2-demo');
  for (let i = 0; i < 100 && get(w).stream.phase !== 'review'; i++) w = tick(w, 1);
  const s = get(w).stream, admitted = s.admitted;
  assert.equal(s.phase, 'review'); assert(admitted < 24); assert(s.triggerCostCents >= 432); assert(s.drainFinalCents > s.triggerCostCents); assert.equal(s.reminded, false);
  w = S.setStreamCostLimit(w, 'phase2-demo', 10000); assert.equal(get(w).stream.costLimitCents, 10000);
  w = S.continueStreamManually(w, 'phase2-demo'); w = tick(w, 200);
  assert.equal(get(w).stream.admitted, 24); assert.equal(get(w).stream.phase, 'completed');
});
test('legacy continue-on-cap becomes a hard stop while retaining reminder strength', () => {
  let w = fresh(); const e = get(w);
  e.streamPolicy.costLimitCents = 432; e.streamPolicy.costLimitAction = 'continue'; e.streamPolicy.reminderRatio = 60;
  e.notification = { baseline: 3, reminder: 2, stop: 1, recipients: '创建人' };
  w = tick(finiteStart(w, e.id), 200);
  const result = get(w), prompt = result.stream.costPrompts.find(item => item.text.includes('达到成本上限'));
  assert.equal(result.stream.triggerCostAction, 'drain');
  assert.equal(prompt.notificationLevel, 3);
  assert.equal(result.stream.phase, 'review');
  assert(result.stream.admitted < 24); assert.equal(result.stream.retryRound, 0);
  assert(result.stream.costCents > result.stream.triggerCostCents);
  assert.equal(result.stream.drainFinalCents, result.stream.costCents);
});
test('legacy continue-on-cap cannot bypass the ceiling through manual recovery', () => {
  let w = fresh(); const e = get(w);
  e.streamPolicy.costLimitCents = 432; e.streamPolicy.costLimitAction = 'continue'; e.streamPolicy.maxRetries = 0;
  w = tick(finiteStart(w, e.id), 200);
  const before = get(w), failed = before.stream.failures[0];
  assert(failed); assert.equal(before.stream.phase, 'review');
  assert.throws(() => S.retryStreamStage(w, e.id, failed.stage), /输入及执行器配置/);
});
test('manual takeover still records a cap notification when admitted work crosses the limit while draining', () => {
  let w = fresh(); const e = get(w);
  e.streamPolicy.costLimitCents = 50; e.streamPolicy.costLimitAction = 'drain';
  e.notification = { baseline: 1, reminder: 1, stop: 4, recipients: '创建人' };
  w = finiteStart(w, e.id); w = tick(w, 2); w = S.takeOverStream(w, e.id);
  for (let i = 0; i < 50 && get(w).stream.triggerCostCents === undefined; i++) w = tick(w);
  const prompt = get(w).stream.costPrompts.find(item => item.text.includes('达到成本上限'));
  assert(prompt); assert.equal(prompt.notificationLevel, 4);
  assert.equal(get(w).stream.phase, 'draining');
});
test('no cost ceiling is valid and zero deliverables never create a unit-cost estimate', () => {
  let w = started(); assert.equal(get(w).stream.costLimitCents, undefined);
  get(w).stream.demoOutcome = 'zero'; get(w).streamPolicy.maxRetries = 0; w = tick(w, 200);
  const s = get(w).stream; assert.equal(s.phase, 'completed'); assert.equal(s.stages.at(-1).outputs, 0); assert.equal(s.predicted, undefined);
});
test('legacy per-output cost bounds are ignored and cannot block stream startup', () => {
  const w = fresh(), policy = get(w).streamPolicy;
  assert.equal(get(w, 'phase2-live').streamPolicy.unitCostMin, undefined);
  policy.unitCostMin = 0; policy.unitCostMax = -1;
  assert.doesNotThrow(() => S.validateStreamPolicy(policy, 24));
  assert.equal(get(finiteStart(w, 'phase2-demo')).stream.phase, 'production');
});
test('automatic retry is fixed once per failed item and ignores legacy configurable counts', () => {
  for (const maxRetries of [0, 1, 10]) {
    let w = fresh(); get(w).streamPolicy.maxRetries = maxRetries; w = tick(finiteStart(w, 'phase2-demo'), 200);
    const e = get(w); assert.equal(e.stream.retryRound, 1); assert.equal(e.stream.failures.length, 0);
    assert(Object.values(e.stream.automaticRetries).every(Boolean)); assert.equal(e.stream.phase, 'completed');
  }
});
test('manual stage retry skips upstream work and sends recovered outputs downstream', () => {
  let w = tick(finiteStart(fresh(), 'phase2-demo'), 18); w = R.changeExecutorState(w, 'phase2-demo', 'pause');
  const before = get(w), stage = 1, token = before.stream.failures.find(item => item.stage === stage);
  assert(token); const upstreamProcessed = before.stream.stages[0].processed;
  w = S.retryStreamStage(w, before.id, stage);
  assert.equal(get(w).stream.control, 'manual'); assert.equal(get(w).stream.failures.some(item => item.stage === stage), false);
  w = tick(w, 20);
  assert.equal(get(w).stream.stages[0].processed, upstreamProcessed);
  assert(get(w).stream.stages[stage + 1].processed > 0);
  assert.equal(get(w).runtime.state, 'paused');
});
test('manual recovery keeps executor, batches, output identities and successful results', () => {
  let w = started('phase2-cost'); w = tick(w, 8, 'phase2-cost'); w = S.takeOverStream(w, 'phase2-cost'); w = tick(w, 100, 'phase2-cost');
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
  let w = finiteStart(fresh(), 'phase2-demo'); w = tick(w, 3); w = S.toggleStreamStage(w, 'phase2-demo', 1); w = tick(w, 4);
  const admitted = get(w).stream.admitted; w = tick(w, 8); assert.equal(get(w).stream.admitted, admitted);
  w = S.toggleStreamStage(w, 'phase2-demo', 1); w = tick(w, 100); assert.equal(get(w).stream.phase, 'completed');
});
test('manual continuation requires a higher or removed cap and retains cumulative cost', () => {
  let w = fresh(); get(w, 'phase2-cost').streamPolicy.costLimitCents = 250; w = finiteStart(w, 'phase2-cost');
  for (let i = 0; i < 100 && get(w, 'phase2-cost').stream.phase !== 'review'; i++) w = tick(w, 1, 'phase2-cost');
  const cost = get(w, 'phase2-cost').stream.costCents;
  assert.throws(() => S.continueStreamManually(w, 'phase2-cost'), /提高或取消/);
  w = S.setStreamCostLimit(w, 'phase2-cost', 10000); w = S.continueStreamManually(w, 'phase2-cost'); w = tick(w, 100, 'phase2-cost');
  assert.equal(get(w, 'phase2-cost').stream.admitted, 24); assert(get(w, 'phase2-cost').stream.costCents > cost);
});
test('unknown downstream totals stay unknown until their upstream inputs arrive', () => {
 let w=finiteStart(fresh(),'phase2-cost');w=tick(w,4,'phase2-cost');const ids=get(w,'phase2-cost').runtime.batchIds;
 assert.equal(w.batches.find(b=>b.id===ids[1]).total,-1);
});

test('demo fixture renames update only unchanged sample labels and retain unrelated workspace data', () => {
  const w = fresh();
  const delivery = get(w, 'delivery-demo'), phase2 = get(w);
  delivery.name = '导出体验 · 三环节串联示例';
  delivery.flows.forEach((flow, index) => { flow.name = ['A · 数据整理', 'B · 标注处理', 'C · 结果复核'][index]; });
  w.batches.find(batch => batch.id === 5889).name = '时间范围导出 · 示例批次';
  phase2.name = '流式生产 · 实绩成本估算';
  phase2.flows.forEach((flow, index) => { flow.name = ['A · 数据整理', 'B · 标注处理', 'C · 结果复核'][index]; });
  const phaseBatch = w.batches.find(batch => batch.id === phase2.runtime.batchIds[0]);
  phaseBatch.name = 'A · 数据整理';
  w.executors.push({ id: 'user-custom', name: '用户自定义', description: '', source: 'selection', flowIds: [], flows: [], runMode: 'batch' });
  w.batches.push({ ...w.batches[0], id: 9999, name: 'A · 数据整理', executorId: 'user-custom' });

  const migrated = withPhase2Examples(w);
  assert.equal(migrated.executors.find(item => item.id === 'delivery-demo').name, '桃园结义 · 三环节串联示例');
  assert.equal(migrated.executors.find(item => item.id === 'phase2-demo').name, '草船借箭 · 流式生产与成本估算');
  assert.equal(migrated.executors.find(item => item.id === 'phase2-demo').flows[0].name, '桃园结义 · 数据整理');
  assert.equal(migrated.batches.find(batch => batch.id === 9999).name, 'A · 数据整理');
  assert.equal(migrated.executors.find(item => item.id === 'user-custom').name, '用户自定义');
  assert.equal(w.executors.find(item => item.id === 'phase2-demo').name, '流式生产 · 实绩成本估算');
});

test('paused stage retry isolates normal queues and restores them after downstream recovery', () => {
  let w = tick(started(), 18);
  w = R.changeExecutorState(w, 'phase2-demo', 'pause');
  const before = structuredClone(get(w)), stage = 1;
  assert(before.stream.failures.some(t => t.stage === stage));
  assert(before.stream.queues.flat().length > 0);
  w = S.retryStreamStage(w, before.id, stage);
  assert.equal(get(w).stream.stageRecovery.preparation, 0);
  assert.deepEqual(get(w).stream.stageRecovery.queues, before.stream.queues);
  assert.throws(() => S.retryStreamStage(w, before.id, stage), /正在重试/);
  for (let i = 0; i < 100 && get(w).stream.stageRecovery; i++) w = tick(w);
  const after = get(w);
  assert.equal(after.runtime.state, 'paused');
  assert.equal(after.stream.stages[0].processed, before.stream.stages[0].processed);
  assert.equal(after.stream.admitted, before.stream.admitted);
  assert.deepEqual(after.stream.queues, before.stream.queues);
  assert(after.stream.stages[2].processed > before.stream.stages[2].processed);
  assert(after.stream.costCents > before.stream.costCents);
  const results = w.batches.flatMap(b => b.results ?? []).map(r => r.id);
  assert.equal(new Set(results).size, results.length);
  w = R.changeExecutorState(w, before.id, 'resume'); w = tick(w, 200);
  assert.equal(get(w).stream.phase, 'completed');
  assert.equal(get(w).stream.stages.at(-1).outputs, 36);
});

test('stage retry rejects running, empty and exhausted budget without mutating input', () => {
  let w = tick(started(), 18), before = JSON.stringify(w);
  assert.throws(() => S.retryStreamStage(w, 'phase2-demo', 1), /暂停/);
  assert.equal(JSON.stringify(w), before);
  w = R.changeExecutorState(w, 'phase2-demo', 'pause');
  assert.throws(() => S.retryStreamStage(w, 'phase2-demo', 2), /没有失败/);
  get(w).stream.costLimitCents = get(w).stream.costCents;
  before = JSON.stringify(w);
  assert.throws(() => S.retryStreamStage(w, 'phase2-demo', 1), /成本上限/);
  assert.equal(JSON.stringify(w), before);
});

test('measured execution time counts concurrent stages once, excludes pause, blocked queues and preparation, survives reload', () => {
  let w = started();
  w = S.tickStream(w, 'phase2-demo', 930); // Admission only; no active stage yet.
  assert.equal(get(w).stream.activeRunMs, 0);
  w = S.tickStream(w, 'phase2-demo', 740);
  assert.equal(get(w).stream.activeRunMs, 740);
  w = S.tickStream(w, 'phase2-demo', 510); // A and B overlap.
  assert.equal(get(w).stream.activeRunMs, 1250);
  assert.equal(get(w).stream.stageActiveMs[0], 1250);
  assert.equal(get(w).stream.stageActiveMs[1], 510);
  w = R.changeExecutorState(w, 'phase2-demo', 'pause');
  w = S.tickStream(JSON.parse(JSON.stringify(w)), 'phase2-demo', 60000);
  assert.equal(get(w).stream.activeRunMs, 1250);
  w = R.changeExecutorState(w, 'phase2-demo', 'resume');
  w = S.tickStream(w, 'phase2-demo', 250);
  assert.equal(get(w).stream.activeRunMs, 1500);
  get(w).stream.pausedStages = [0, 1, 2];
  w = S.tickStream(w, 'phase2-demo', 5000);
  assert.equal(get(w).stream.activeRunMs, 1500);
  get(w).stream.pausedStages = []; get(w).stream.preparation = 0;
  w = S.tickStream(w, 'phase2-demo', 9000);
  assert.equal(get(w).stream.activeRunMs, 1500);
  delete get(w).stream.activeRunMs; delete get(w).stream.stageActiveMs;
  w = S.tickStream(w, 'phase2-demo', 1000);
  assert.equal(get(w).stream.activeRunMs, undefined); // Legacy history is never fabricated.
});

test('input limit stops exactly at admitted count, drains downstream and requires a changed limit before continuation', () => {
  let w = fresh(); get(w).streamPolicy.inputLimit = 3;
  w = tick(finiteStart(w, 'phase2-demo'), 100);
  assert.equal(get(w).stream.admitted, 3); assert.equal(get(w).stream.stopReason, 'input');
  assert.equal(get(w).stream.phase, 'review'); assert(get(w).stream.stages[2].outputs > 0);
  assert.equal(get(w).stream.retryRound, 0);
  assert.throws(() => S.continueStreamManually(w, 'phase2-demo'), /上限/);
  w = S.setStreamLimits(w, 'phase2-demo', { inputLimit: 6 });
  w = tick(S.continueStreamManually(w, 'phase2-demo'), 100);
  assert.equal(get(w).stream.admitted, 6);
});

test('legacy runtime limit never stops admission and actual processing time remains measured', () => {
  let w = fresh(); get(w).streamPolicy.runtimeLimitMs = 1; w = finiteStart(w, 'phase2-demo');
  for (let i = 0; i < 200; i++) w = S.tickStream(w, 'phase2-demo', 1000);
  assert.equal(get(w).stream.admitted, 24); assert.equal(get(w).stream.phase, 'completed');
  assert(get(w).stream.activeRunMs > 1); assert.equal(get(w).stream.stopReason, undefined);
});

test('output goal stops new admission; supplemental-input contract contains evidence without calculating or dispatching inputs/retries', () => {
  let w = fresh(); get(w).streamPolicy.targetOutputCount = 2; get(w).streamPolicy.maxRetries = 0;
  w = tick(finiteStart(w, 'phase2-demo'), 100);
  const e = get(w); assert.equal(e.stream.stopReason, 'target'); assert(e.stream.admitted < 24);
  assert(e.stream.stages.at(-1).outputs >= 2); assert.equal(e.stream.retryRound, 0);
  const before = JSON.stringify(w), request = S.buildUpstreamInputRequest(e);
  assert.equal(request.targetOutputCount, 2); assert.equal(request.estimateStatus, 'awaiting-upstream');
  assert.equal(request.retryPolicy.manualRetryRequiresUserAction, true);
  assert.equal(request.requiredAdditionalInputCount, undefined); assert.equal(JSON.stringify(w), before);
  for (const policy of [{ inputLimit: -1 }, { waitingUrgentMinutes: 10, waitingNormalMinutes: 30 }, { targetOutputCount: 1.5 }]) {
    assert.throws(() => S.validateStreamPolicy({ maxRetries: 0, ...policy }, 24));
  }
});

test('percentage output goal uses the fixed input snapshot and converts upward to whole products', () => {
  const policy = { maxRetries: 0, targetOutputMode: 'percent', targetOutputPercent: 8.4 };
  assert.equal(S.effectiveTargetOutputCount(policy, 24), 3);
  assert.equal(S.effectiveTargetOutputCount({ maxRetries: 0, targetOutputMode: 'count', targetOutputCount: 5 }, 24), 5);
  assert.throws(() => S.validateStreamPolicy({ ...policy, targetOutputCount: 5 }, 24));
  assert.throws(() => S.validateStreamPolicy({ maxRetries: 0, targetOutputPercent: 100.1 }, 24));
  let w = fresh(); Object.assign(get(w).streamPolicy, policy);
  w = tick(finiteStart(w, 'phase2-demo'), 100);
  assert.equal(get(w).stream.stopReason, 'target');
  assert(get(w).stream.admitted < 24);
  assert(get(w).stream.stages.at(-1).outputs >= 3);
});
test('automatic estimates use bounded percentage checkpoints', () => {
  assert.deepEqual(S.estimateRefreshCheckpoints(0, 11, 240), []);
  assert.deepEqual(S.estimateRefreshCheckpoints(11, 22, 240), [12, 17, 22]);
  assert.deepEqual(S.estimateRefreshCheckpoints(0, 1000, 2000000), [1000]);
  assert.deepEqual(S.estimateRefreshCheckpoints(1000, 1400, 2000000), [1400]);
});

const targetReached = (policy = {}) => {
  let w = fresh();
  Object.assign(get(w).streamPolicy, { targetOutputCount: 8, maxRetries: 2 }, policy);
  w = finiteStart(w, 'phase2-demo');
  for (let i = 0; i < 100 && get(w).stream.stopReason !== 'target'; i++) w = tick(w);
  assert.equal(get(w).stream.stopReason, 'target');
  assert(get(w).stream.failures.length > 0);
  return w;
};

test('reaching the output goal drains without starting any new automatic retry', () => {
  let w = targetReached(); const before = structuredClone(get(w).stream);
  const results = w.batches.flatMap(b => b.results ?? []).map(r => r.id);
  w = tick(w, 100); const e = get(w);
  assert.equal(e.stream.admitted, before.admitted); assert.equal(e.stream.retryRound, 0);
  assert(e.stream.failures.length); assert.equal(e.stream.phase, 'review');
  const after = w.batches.flatMap(b => b.results ?? []).map(r => r.id);
  assert(results.every(id => after.includes(id))); assert.equal(new Set(after).size, after.length);
});

test('goal completion respects disabled and exhausted retry allowances', () => {
  for (const maxRetries of [0, 1]) {
    let w = targetReached({ maxRetries });
    get(w).stream.retryRound = maxRetries;
    const before = structuredClone(get(w).stream);
    w = tick(w, 100);
    assert.equal(get(w).stream.retryRound, maxRetries);
    assert.equal(get(w).stream.admitted, before.admitted);
    assert(get(w).stream.failures.length > 0);
    assert.equal(get(w).stream.phase, 'review');
  }
});

test('cost and input ceilings prevent new retry rounds after reaching the output goal', () => {
  for (const ceiling of ['cost', 'input']) {
    let w = targetReached();
    const s = get(w).stream;
    if (ceiling === 'cost') {
      get(w).streamPolicy.costLimitCents = s.costCents + 1;
      s.costLimitCents = s.costCents + 1;
    } else {
      get(w).streamPolicy.inputLimit = s.admitted;
    }
    const admitted = s.admitted;
    for (let i = 0; i < 100 && get(w).runtime.state === 'running'; i++) w = S.tickStream(w, 'phase2-demo', 1);
    const after = get(w).stream;
    assert.equal(after.retryRound, 0, `${ceiling} ceiling must prevent new retries`);
    assert.equal(after.admitted, admitted);
    assert(after.failures.length > 0);
    assert.equal(after.phase, 'review');
    if (ceiling === 'cost') assert(after.triggerCostCents !== undefined);
    else assert.equal(after.stopReason, 'input');
  }
});

test('resume boundary excludes the paused portion of a shared driver interval', () => {
  let w = tick(started(), 2); const before = get(w).stream.activeRunMs;
  get(w).stream.clockBoundaryAt = 9500;
  w = S.tickStream(w, 'phase2-demo', 1200, 10000);
  assert.equal(get(w).stream.activeRunMs - before, 500);
  assert.equal(get(w).stream.stageActiveMs[0], 500);
});

test('a goal above available production never requests more inputs or retries beyond configured policy', () => {
  let w = fresh(); get(w).streamPolicy.targetOutputCount = 1000; get(w).streamPolicy.maxRetries = 0;
  w = tick(finiteStart(w, 'phase2-demo'), 200);
  const e = get(w); assert.equal(e.stream.admitted, 24); assert.equal(e.stream.retryRound, 1);
  assert(e.stream.stages.at(-1).outputs < 1000); assert.match(e.stream.reason, /尚未达到目标/);
  const before = JSON.stringify(w); w = tick(w, 100); assert.equal(JSON.stringify(w), before);
});
