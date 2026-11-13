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
test('heartbeats, messages and transfer progress do not reset a no-data waiting episode', () => {
  for (const kind of ['message', 'heartbeat', 'progress']) {
    let w = tick(fresh()); const since = get(w).stream.waitingEpisode.since;
    w = S.recordStreamSourceEvent(w, id, { kind }, since + 590000); w = S.tickStream(w, id, 0, since + 1800000);
    assert.equal(get(w).runtime.state, 'running'); assert.equal(get(w).stream.waitingEpisode.since, since);
    assert.equal(get(w).stream.waitNotifications.length, 1);
  }
});
test('data arriving after a long wait automatically resumes production', () => {
  let w = tick(fresh()); const since = get(w).stream.waitingEpisode.since;
  w = tick(w, 1, since + 3600000); const admitted = get(w).stream.admitted;
  assert.equal(get(w).runtime.state, 'running');
  w = S.recordStreamSourceEvent(w, id, { kind: 'data', count: 3 }, since + 3600001); w = tick(w, 100, since + 3600002);
  assert.equal(get(w).stream.admitted, admitted + 3); assert.equal(get(w).runtime.state, 'running');
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
test('every reached cost/input/target ceiling blocks resume and manual retry, including simultaneous ceilings', () => {
  for (const ceiling of ['cost', 'input', 'target', 'all']) {
    let w = tick(fresh()); const e = get(w), s = e.stream;
    e.runtime.state = 'paused'; s.failures.push({ key: 'blocked', root: 1, stage: 0, attempt: 1 });
    if (ceiling === 'cost' || ceiling === 'all') s.costLimitCents = e.streamPolicy.costLimitCents = s.costCents;
    if (ceiling === 'input' || ceiling === 'all') e.streamPolicy.inputLimit = s.admitted;
    if (ceiling === 'target' || ceiling === 'all') e.streamPolicy.targetOutputCount = s.stages.at(-1).outputs;
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
test('waiting reminder thresholds require positive integer minutes and increasing escalation', () => {
  const e = get(fresh());
  for (const waitingNormalMinutes of [0, -1, Infinity, NaN, 0.5]) assert.throws(() => S.validateStreamPolicy({ ...e.streamPolicy, waitingNormalMinutes }, 6));
  assert.throws(() => S.validateStreamPolicy({ ...e.streamPolicy, waitingNormalMinutes: 60, waitingUrgentMinutes: 30 }, 6));
  assert.doesNotThrow(() => S.validateStreamPolicy({ ...e.streamPolicy, waitingNormalMinutes: 30, waitingUrgentMinutes: 60 }, 6));
});

test('an open exhausted source is not falsely reported as permanently insufficient supply', () => {
  const w = tick(fresh()), e = get(w); e.stream.failures = [];
  assert.equal(T.streamForecastSupply(e).status, 'waiting');
  assert.match(T.forecastSupplyWarning(e, 100), /补充输入/);
  assert.doesNotMatch(T.forecastSupplyWarning(e, 100), /供给已结束/);
  e.stream.source.closed = true;
  assert.equal(T.streamForecastSupply(e).status, 'exhausted');
  assert.match(T.forecastSupplyWarning(e, 100), /输入供给已结束/);
});
test('check failure while manually paused requires recovery and explicit continue', () => {
  let w = tick(fresh()); w = R.changeExecutorState(w, id, 'pause');
  w = S.recordStreamSourceEvent(w, id, { kind: 'error', message: '暂时不可达' }); assert.equal(get(w).stream.phase, 'review');
  w = S.recordStreamSourceEvent(w, id, { kind: 'recovered' }); assert.equal(get(w).runtime.state, 'paused');
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
