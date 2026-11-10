import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const T = require('../src/components/sites/hawk/data/executor-time-estimates.ts');
const { withPhase2Examples } = require('../src/components/sites/hawk/data/phase2-examples.ts');
const { estimateStreamProductsByTime, streamCostEvidence } = require('../src/components/sites/hawk/data/executor-stream-estimates.ts');
const fixture = (id = 'phase2-time-basic') => withPhase2Examples({ groups: [], projects: [], executors: [], batches: [] }).executors.find(e => e.id === id);

test('1000 products / 1000 minutes yields 500, 200 and 700 additional minutes', () => {
  const e = fixture(), before = JSON.stringify(e), result = T.estimateStreamTimeAddition(e, 500, 200);
  assert(Math.abs(result.current.hours.base * 60 - 500) < 1e-8);
  assert(Math.abs(result.incremental.base * 60 - 200) < 1e-8);
  assert(Math.abs(result.combined.hours.base * 60 - 700) < 1e-8);
  assert(result.current.hours.low <= result.current.hours.base);
  assert(result.current.hours.high >= result.current.hours.base);
  assert.equal(JSON.stringify(e), before, 'a forecast must not change limits or the run');
});
test('early time estimate is independent of cost readiness and never fabricates a range', () => {
  const e = fixture();e.stream.timeObservation.segments = [];
  e.stream.timeObservation.checkpoint = { activeMs: 0, outputs: 0, settledInputs: 0 };
  e.stream.timeObservation.current = { activeMs: 60000, outputs: 1, settledInputs: 1 };
  e.stream.estimateRootIds = [1];
  const result = T.estimateStreamTimeByProducts(e, 500);
  assert(Math.abs(result.hours.base * 60 - 500) < 1e-8);
  assert.equal(result.hours.low, undefined);assert.equal(result.hours.high, undefined);
  assert.equal(streamCostEvidence(e).ready, false);
});
test('zero-output segments are retained and can prevent a finite upper time bound', () => {
  const e = fixture();e.stream.timeObservation.segments = [0, 0, 100, 100, 100].map(outputs => ({ activeMs: 60000, outputs }));
  const forecast = T.estimateStreamTimeByProducts(e, 100);
  assert.equal(forecast.evidence.completeSegments, 5);
  assert.equal(forecast.evidence.slowRate, 0);assert.equal(forecast.hours.high, undefined);
  assert(Number.isFinite(forecast.hours.base));assert(Number.isFinite(forecast.hours.low));
  e.stream.timeObservation.segments.forEach(segment => { segment.outputs = 0; });
  assert.match(T.estimateStreamTimeByProducts(e, 100).reason, /尚无最终成品/);
});
test('resource-weighted whole-run rates require complete matching features and product mix', () => {
  const e = fixture('phase2-time-features');
  const result = T.estimateStreamTimeByProducts(e, 500);
  assert.equal(result.evidence.method, 'resource');
  assert(Math.abs(result.evidence.rate - 48) < 1e-8);
  assert(Math.abs(result.hours.base * 60 - 625) < 1e-8);
  e.stream.resourceTimeEvidence.classes[1].segments = [];
  assert.equal(T.streamTimeEvidence(e).method, 'overall');assert.match(T.streamTimeEvidence(e).note, /退回/);
  assert(Math.abs(T.estimateStreamTimeByProducts(e, 500).hours.base * 60 - 500) < 1e-8);
});
test('changed workflow, concurrency and retry policy invalidate the old forecast immediately', () => {
  for (const change of [e => e.flows[0].version++, e => e.concurrency = 9, e => e.streamPolicy.maxRetries++]) {
    const e = fixture();change(e);
    assert.match(T.streamTimeEvidence(e).reason, /配置已变化/);
    T.prepareTimeObservation(e);
    assert.equal(T.streamTimeEvidence(e).ready, false);
  }
});
test('old in-flight roots drain before a new window; late old-root retry invalidates it again', () => {
  const e = fixture();e.flows[0].version++;e.stream.queues[0].push({ root: 10, stage: 0, attempt: 0, key: 'old' });
  T.prepareTimeObservation(e);assert.match(T.streamTimeEvidence(e).reason, /旧配置/);
  e.stream.activeRunMs += 60000;e.stream.inputMetrics[10].finalOutputs += 10;T.recordTimeObservation(e);
  assert.equal(T.streamTimeEvidence(e).ready, false);
  e.stream.queues[0] = [];T.recordTimeObservation(e);
  e.stream.activeRunMs += 60000;e.stream.inputMetrics[1001] = { costCents: 1, finalOutputs: 1 };e.stream.settledInputs++;
  T.recordTimeObservation(e);assert.equal(T.streamTimeEvidence(e).observedOutputs, 1);
  e.stream.queues[0].push({ root: 10, stage: 0, attempt: 1, key: 'retry-old' });T.prepareTimeObservation(e);
  assert.match(T.streamTimeEvidence(e).reason, /旧配置/);
});
test('matching checkpoints record whole-executor output deltas and preserve zero-output work', () => {
  const e = fixture();delete e.stream.timeObservation;T.prepareTimeObservation(e);
  const start = e.stream.activeRunMs;
  e.stream.activeRunMs += 60000;e.stream.settledInputs += 100;T.recordTimeObservation(e);
  assert.deepEqual(e.stream.timeObservation.segments, [{ activeMs: 60000, outputs: 0 }]);
  e.stream.activeRunMs += 120000;e.stream.inputMetrics[1001] = { costCents: 1, finalOutputs: 10 };e.stream.settledInputs += 100;T.recordTimeObservation(e);
  assert.equal(T.streamTimeEvidence(e).observedOutputs, 10);
  assert.equal(T.streamTimeEvidence(e).observedHours, 3/60);
  const restored = JSON.parse(JSON.stringify(e));assert.deepEqual(T.streamTimeEvidence(restored), T.streamTimeEvidence(e));
  assert.equal(e.stream.activeRunMs - start, 180000);
});
test('missing and inconsistent observations cannot silently create an estimate', () => {
  for (const change of [e => e.stream.timeObservation.segments[0].activeMs = 0, e => e.stream.timeObservation.current.activeMs--, e => e.stream.timeObservation.current.outputs++, e => e.stream.timeObservation.segments[0].outputs = NaN]) {
    const e = fixture();change(e);assert.equal(T.streamTimeEvidence(e).ready, false);
  }
  assert.equal(T.estimateStreamTimeByProducts(fixture(), -1).hours, undefined);
  assert.equal(T.estimateStreamTimeAddition(fixture(), 500, NaN).incremental, undefined);
  assert.equal(T.estimateStreamTimeByProducts(fixture(), 0).hours.base, 0);
});
test('one-to-many products are not capped by raw inputs; proven exhausted supply is explicit', () => {
  const e = fixture();e.inputCount = e.stream.admitted + 1;
  assert.equal(estimateStreamProductsByTime(e, 4).products, 240);
  e.inputCount = e.stream.admitted;
  assert.match(T.estimateStreamTimeByProducts(e, 500).supplyWarning, /全部处理/);
});
test('unmeasured past output cannot be made valid by adding processing time later', () => {
  const e = fixture();delete e.stream.timeObservation;T.prepareTimeObservation(e);
  e.stream.inputMetrics[1001] = { costCents: 1, finalOutputs: 100 };T.recordTimeObservation(e);
  assert.equal(T.streamTimeEvidence(e).ready, false);
  e.stream.activeRunMs += 60000;e.stream.inputMetrics[1002] = { costCents: 1, finalOutputs: 1 };T.recordTimeObservation(e);
  assert.equal(T.streamTimeEvidence(e).observedOutputs, 1);
  assert.equal(T.streamTimeEvidence(e).rate, 60);
});

test('a positive delivery target cannot acquire a completion time after supply is proven exhausted', () => {
  const e=fixture();e.inputCount=e.stream.admitted;
  assert.equal(T.estimateStreamTimeByProducts(e,500).hours,undefined);
  assert.match(T.estimateStreamTimeByProducts(e,500).reason,/全部处理|输入.*结束/);
  assert.equal(T.estimateStreamTimeByProducts(e,0).hours.base,0);
});
