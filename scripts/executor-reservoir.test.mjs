import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const S = require('../src/components/sites/hawk/data/executor-streaming.ts');
const T = require('../src/components/sites/hawk/data/executor-time-estimates.ts');
const R = require('../src/components/sites/hawk/data/executor-runtime.ts');
const { executorSettings } = require('../src/components/sites/hawk/data/executor-settings.ts');
const { withPhase2Examples } = require('../src/components/sites/hawk/data/phase2-examples.ts');
const id = 'phase2-reservoir', get = w => w.executors.find(e => e.id === id);
const fresh = () => S.startStream(withPhase2Examples({ groups: [], projects: [], executors: [], batches: [] }), id);
const tick = (w, n = 100, now = Date.now()) => { for (let i = 0; i < n; i++) w = S.tickStream(w, id, 0, now); return w; };
const inputs = e => ({ resource: e.input, count: e.inputCount, resourceType: e.resourceType, runMode: 'stream', settings: executorSettings(e.settings), streamPolicy: { ...e.streamPolicy } });

test('depletion waits without accruing processing time; explicit source end completes with finite retries exhausted', () => {
  let w = tick(fresh()); const e = get(w), cost = e.stream.costCents, time = e.stream.activeRunMs;
  assert.equal(e.runtime.state, 'running'); assert.equal(e.stream.source.waiting, true);
  w = S.tickStream(w, id, 10000, e.stream.source.lastActivityAt + 599999);
  assert.equal(get(w).stream.activeRunMs, time); assert.equal(get(w).stream.costCents, cost);
  w = S.recordStreamSourceEvent(w, id, { kind: 'end' }); w = tick(w);
  assert.equal(get(w).stream.phase, 'completed'); assert.equal(get(w).runtime.state, 'completed');
});
test('each type of source activity resets the deadline, including large-file transfer progress', () => {
  for (const kind of ['message', 'heartbeat', 'progress']) {
    let w = tick(fresh()); const start = get(w).stream.source.lastActivityAt;
    w = S.recordStreamSourceEvent(w, id, { kind }, start + 590000);
    w = S.tickStream(w, id, 0, start + 600000);
    assert.equal(get(w).stream.phase, 'production', kind);
    w = S.tickStream(w, id, 0, start + 1190000);
    assert.equal(get(w).stream.phase, 'review', kind); assert.equal(get(w).stream.stopReason, 'idle');
  }
});
test('late data after idle timeout is retained but cannot automatically restart intake', () => {
  let w = tick(fresh()); const time = get(w).stream.source.lastActivityAt + 600000;
  w = tick(w, 1, time); const admitted = get(w).stream.admitted, cost = get(w).stream.costCents;
  w = S.recordStreamSourceEvent(w, id, { kind: 'data', count: 3 }, time + 1);
  w = tick(w, 10, time + 2);
  assert.equal(get(w).stream.admitted, admitted); assert.equal(get(w).runtime.state, 'waiting');
  w = S.resumeStream(w, id, time + 3); w = tick(w, 100, time + 4);
  assert.equal(get(w).stream.admitted, admitted + 3); assert(get(w).stream.costCents > cost);
});
test('source failure stops intake, drains admitted work and blocks resume until check recovery', () => {
  let w = tick(fresh(), 2); const admitted = get(w).stream.admitted;
  w = S.recordStreamSourceEvent(w, id, { kind: 'error', message: '存储接口不可达' }); w = tick(w);
  assert.equal(get(w).stream.admitted, admitted); assert.equal(get(w).stream.phase, 'review');
  assert.match(get(w).stream.reason, /存储接口不可达/); assert.throws(() => S.resumeStream(w, id), /检查失败/);
  w = S.recordStreamSourceEvent(w, id, { kind: 'heartbeat' }); assert.throws(() => S.resumeStream(w, id), /检查失败/);
  w = S.recordStreamSourceEvent(w, id, { kind: 'recovered' });
  assert.equal(get(w).runtime.state, 'waiting'); assert.equal(get(S.resumeStream(w, id)).runtime.state, 'running');
});
test('configuration updates preserve counters and a latched stop; unrelated production settings cannot change', () => {
  let w = fresh(); get(w).streamPolicy.inputLimit = 2; w = tick(w);
  const e = get(w), before = structuredClone(e.stream), form = inputs(e); form.streamPolicy.inputLimit = 5;
  w = R.configureExecutor(w, id, form);
  assert.equal(get(w).runtime.state, 'waiting'); assert.equal(get(w).stream.phase, 'review');
  assert.equal(get(w).stream.costCents, before.costCents); assert.equal(get(w).stream.admitted, before.admitted);
  assert.equal(get(w).stream.activeRunMs, before.activeRunMs);
  const snapshot = JSON.stringify(w), invalid = inputs(get(w)); invalid.streamPolicy.inputLimit = 1;
  assert.throws(() => R.configureExecutor(w, id, invalid), /已取入/); assert.equal(JSON.stringify(w), snapshot);
  for (const mutate of [f => f.resource = 'tos://changed', f => f.streamPolicy.maxRetries++, f => f.settings.urgentReminder = !f.settings.urgentReminder]) {
    const form = inputs(get(w)); mutate(form); assert.throws(() => R.configureExecutor(w, id, form), /只能修改运行限制/);
  }
  w = R.changeExecutorState(w, id, 'resume'); assert.equal(get(w).runtime.state, 'running');
});
test('every reached cost/input/time ceiling blocks resume and manual retry, including simultaneous ceilings', () => {
  for (const ceiling of ['cost', 'input', 'time', 'all']) {
    let w = tick(fresh()); const e = get(w), s = e.stream;
    e.runtime.state = 'paused'; assert(s.failures.length);
    if (ceiling === 'cost' || ceiling === 'all') s.costLimitCents = e.streamPolicy.costLimitCents = s.costCents;
    if (ceiling === 'input' || ceiling === 'all') e.streamPolicy.inputLimit = s.admitted;
    if (ceiling === 'time' || ceiling === 'all') e.streamPolicy.runtimeLimitMs = s.activeRunMs = 1;
    assert.throws(() => S.resumeStream(w, id), /输入及执行器配置/);
    assert.equal(R.canExecutorAction(w, e, 'resume'), false);
    assert.throws(() => S.retryStreamStage(w, id, s.failures[0].stage), /输入及执行器配置/);
    w = S.setStreamLimits(w, id, {}); assert.equal(get(w).runtime.state, 'paused');
    assert.equal(get(S.resumeStream(w, id)).runtime.state, 'running');
  }
});
test('completed legacy records do not reopen and source events cannot mutate them', () => {
  const w = fresh(), e = get(w); delete e.stream.source; e.stream.phase = 'completed'; e.runtime.state = 'completed';
  const before = JSON.stringify(w); assert.equal(S.tickStream(w, id), w);
  assert.throws(() => S.recordStreamSourceEvent(w, id, { kind: 'data', count: 1 })); assert.equal(JSON.stringify(w), before);
});
test('a configured idle timeout must be a positive finite integer duration', () => {
  const e = get(fresh());
  for (const idleTimeoutMs of [0, -1, Infinity, NaN, 0.5]) assert.throws(() => S.validateStreamPolicy({ ...e.streamPolicy, idleTimeoutMs }, 6));
});

test('an open exhausted source is not falsely reported as permanently insufficient supply', () => {
  const w = tick(fresh()), e = get(w); e.stream.failures = [];
  assert.match(T.forecastSupplyWarning(e, 100), /尚未确认/);
  e.stream.source.closed = true;
  assert.match(T.forecastSupplyWarning(e, 100), /无法由当前输入支持/);
});
test('check failure arriving while already idle-paused does not leave an undrainable state', () => {
  let w = tick(fresh()); w = tick(w, 1, get(w).stream.source.lastActivityAt + 600000);
  assert.equal(get(w).stream.phase, 'review');
  w = S.recordStreamSourceEvent(w, id, {kind: 'error', message:'暂时不可达'});
  assert.equal(get(w).stream.phase, 'review');
  w = S.recordStreamSourceEvent(w, id, {kind: 'recovered'});
  assert.equal(get(S.resumeStream(w,id)).runtime.state, 'running');
});

test('new source arrivals do not move an existing percentage output goal or upstream contract', () => {
  let w = fresh(); get(w).streamPolicy.targetOutputPercent = 50;
  assert.equal(S.buildUpstreamInputRequest(get(w)).targetOutputCount, 3);
  w = S.recordStreamSourceEvent(w, id, { kind: 'data', count: 100 });
  assert.equal(S.buildUpstreamInputRequest(get(w)).targetOutputCount, 3);
  w = tick(w);
  assert.equal(get(w).stream.stopReason, 'target'); assert(get(w).stream.admitted < 106);
});
