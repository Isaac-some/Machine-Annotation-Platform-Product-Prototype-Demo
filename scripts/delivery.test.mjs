import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const D = require('../src/components/sites/hawk/data/delivery.ts');
const R = require('../src/components/sites/hawk/data/executor-runtime.ts');
const W = require('../src/components/sites/hawk/data/workspace-runtime.ts');
const { withDeliveryExamples } = require('../src/components/sites/hawk/data/delivery-examples.ts');
const time = value => Date.parse(`2026-11-03T${value}+08:00`);
const now = time('12:00:00');
const fixture = () => ({ groups: [], executors: [], projects: [], batches: [{ id: 1, projectId: 234, name: 'Time export', status: '运行中', total: 10, success: 4, failed: 0, filtered: 0, progress: 40, nodes: [], simulation: {}, results: [
  ['a', 3, '08:59:59'], ['b', 1, '09:00:00'], ['c', 4, '10:00:00'], ['d', 2, '11:00:00'],
].map(([id, inputOrder, at]) => ({ id, batchId: 1, inputOrder, completedAt: time(at), values: { result: id } })) }] });
const request = (overrides = {}) => ({ requestId: 'first', batchId: 1, range: { kind: 'all' }, sorted: true, ...overrides });
function complete(w) { for (let i = 0; i < 5; i++) w = D.tickExportJobs(w, now + i); return w; }

test('Beijing time is host-independent and invalid calendar dates are rejected', () => {
  assert.equal(D.parseBeijing('2026-11-03T09:00'), time('09:00:00'));
  assert.equal(D.beijingTime(time('09:00:00')), '2026-11-03 09:00:00');
  assert(Number.isNaN(D.parseBeijing('2026-02-30T09:00')));
});
test('time intervals include start and exclude end; until includes its endpoint', () => {
  const b = fixture().batches[0];
  assert.deepEqual(D.selectResults(b, { kind: 'interval', start: time('09:00:00'), end: time('11:00:00') }, now).map(r => r.id), ['b', 'c']);
  assert.deepEqual(D.selectResults(b, { kind: 'until', end: time('11:00:00') }, now).map(r => r.id), ['a', 'b', 'c', 'd']);
  assert.equal(D.selectResults(b, { kind: 'all' }, now).length, 4);
});
test('future, reversed, invalid and empty ranges do not create records', () => {
  const w = fixture();
  for (const range of [{ kind: 'until', end: now + 1 }, { kind: 'until', end: NaN }, { kind: 'interval', start: now, end: now }, { kind: 'interval', start: time('07:00:00'), end: time('08:00:00') }]) assert.throws(() => D.createExportJob(w, request({ range }), now));
  assert.equal(w.exportJobs, undefined);
});
test('snapshot membership and contents freeze, overlaps remain complete, repeated request is idempotent', () => {
  const original = fixture();
  let w = D.createExportJob(original, request(), now);
  assert.equal(original.exportJobs, undefined);
  w.batches[0].results[0].values.result = 'changed';
  w.batches[0].results.push({ id: 'later', batchId: 1, inputOrder: 5, completedAt: now + 1, values: {} });
  assert.equal(w.exportJobs[0].members[0].values.result, 'a');
  assert.equal(w.exportJobs[0].members.length, 4);
  assert.equal(D.createExportJob(w, request(), now), w);
  w = D.createExportJob(w, request({ requestId: 'second' }), now + 2);
  assert.deepEqual(w.exportJobs.map(j => j.members.length), [4, 5]);
  assert.equal(w.batches[0].status, '运行中');
});
test('ordered and unordered CSV use the frozen rows and downloads cannot create records', () => {
  const sorted = complete(D.createExportJob(fixture(), request(), now));
  const unsorted = complete(D.createExportJob(fixture(), request({ sorted: false }), now));
  assert.deepEqual(D.exportMembers(sorted.exportJobs[0]).map(r => r.inputOrder), [1, 2, 3, 4]);
  assert.deepEqual(D.exportMembers(unsorted.exportJobs[0]).map(r => r.inputOrder), [3, 1, 4, 2]);
  assert.match(D.exportCsv(sorted.exportJobs[0]), /rowkey.*batch_id.*input_order.*completed_at/);
  D.exportCsv(sorted.exportJobs[0]); D.exportCsv(sorted.exportJobs[0]);
  assert.equal(sorted.exportJobs.length, 1);
  assert.throws(() => D.exportCsv(D.createExportJob(fixture(), request(), now).exportJobs[0]));
});
test('unsorted generation skips sorting and CSV cells safely escape quotes, newlines and formulas', () => {
  let w = fixture(); w.batches[0].results[0].values = { result: '=SUM(1,2)', quote: 'a"b\nc' };
  w = D.createExportJob(w, request({ sorted: false }), now);
  w = D.tickExportJobs(w, now); assert.equal(w.exportJobs[0].phase, 'writing');
  w = complete(w);
  const csv = D.exportCsv(w.exportJobs[0]); assert.match(csv, /'=SUM\(1,2\)/); assert.match(csv, /a""b\nc/);
});
test('failure and retry retain one task, original snapshot, actor and attempts across reload', () => {
  let w = D.createExportJob(fixture(), request({ actor: '测试用户' }), now);
  w.exportJobs[0].simulateFailure = true;
  w = D.tickExportJobs(w, now); assert.equal(w.exportJobs[0].status, 'failed');
  const snapshot = JSON.stringify(w.exportJobs[0].members);
  w.batches[0].results = [];
  w = D.retryExportJob(JSON.parse(JSON.stringify(w)), w.exportJobs[0].id, now + 1);
  w = complete(w);
  assert.equal(w.exportJobs.length, 1); assert.equal(w.exportJobs[0].attempts.length, 2);
  assert.equal(w.exportJobs[0].actor, '测试用户'); assert.equal(JSON.stringify(w.exportJobs[0].members), snapshot);
  assert.equal(w.exportJobs[0].status, 'succeeded'); assert(w.exportJobs[0].attempts[0].error);
});
test('no-file finish retains results and can later manually export without a phantom finish record', () => {
  let w = D.setDeliveryMode(fixture(), 1, 'none');
  w = W.finishStandaloneBatch(w, 1, now);
  assert.equal(w.batches[0].finish.inFlight, 1);
  w = W.tickWorkspace(w, now);
  assert.equal(w.batches[0].status, '已结束'); assert.equal(w.batches[0].success, 5);
  assert.equal(w.exportJobs, undefined); assert.equal(w.batches[0].results.length, 5);
  w = D.createExportJob(w, request(), now);
  assert.equal(w.exportJobs[0].members.length, 5);
});
test('finish configuration freezes immediately and standalone draining includes only in-flight results', () => {
  let w = W.finishStandaloneBatch(fixture(), 1, now);
  assert.equal(w.batches[0].status, '收尾中');
  assert.throws(() => D.setDeliveryMode(w, 1, 'unsorted'));
  w = W.tickWorkspace(w, now);
  assert.equal(w.batches[0].success, 5); assert.equal(w.exportJobs[0].members.length, 5);
  for (let i = 0; i < 6; i++) w = W.tickWorkspace(JSON.parse(JSON.stringify(w)), now + i);
  assert.equal(w.batches[0].success, 5); assert.equal(w.batches[0].status, '已导出');
});
test('legacy data keeps old files and does not fabricate completion times or successful exports', () => {
  let w = fixture(); delete w.batches[0].results; delete w.batches[0].simulation; w.batches[0].status = '已完成'; w.batches[0].deliveryResource = 'CID://old';
  assert.throws(() => D.createExportJob(w, request(), now), /历史/);
  w = W.finishStandaloneBatch(w, 1, now); w = W.tickWorkspace(w, now);
  assert.equal(w.exportJobs, undefined); assert.deepEqual(w.batches[0].results, []);
  assert.equal(w.batches[0].deliveryResource, 'CID://old');
});
const chain = () => withDeliveryExamples({ groups: [], projects: [{ id: 234, name: 'Demo' }], executors: [], batches: [] });
test('three-step defaults, global updates, per-batch overrides and dependency guards', () => {
  let w = chain(), ids = w.executors[0].runtime.batchIds;
  assert(w.batches.filter(b => ids.includes(b.id)).every(b => (b.deliveryMode ?? 'sorted') === 'sorted'));
  assert.throws(() => D.setDeliveryMode(w, ids[0], 'none'), /依赖/);
  w = D.setExecutorDelivery(w, 'delivery-demo', 'unsorted');
  w = D.setDeliveryMode(w, ids[2], 'none');
  assert.equal(w.batches.find(b => b.id === ids[2]).deliveryMode, 'none');
  w = R.changeExecutorState(w, 'delivery-demo', 'finish-batch');
  w = D.setExecutorDelivery(w, 'delivery-demo', 'sorted');
  assert.equal(w.batches.find(b => b.id === ids[0]).finish.mode, 'unsorted');
  assert.equal(w.batches.find(b => b.id === ids[0]).deliveryMode, 'unsorted');
  assert.equal(w.batches.find(b => b.id === ids[1]).deliveryMode, 'sorted');
});
test('manual middle export does not dispatch downstream; failed required export blocks then retries once', () => {
  let w = chain(); const ids = w.executors[0].runtime.batchIds;
  w = D.createExportJob(w, request({ batchId: ids[0] }), now);
  assert.equal(w.exportJobs[0].intermediate, true);
  w = complete(w); assert.equal(w.executors[0].runtime.currentIndex, 0);
  w = R.changeExecutorState(w, 'delivery-demo', 'finish-batch'); w = W.tickWorkspace(w, now);
  const job = w.exportJobs.find(j => j.trigger === 'finish'); job.simulateFailure = true;
  w = W.tickWorkspace(w, now); assert.equal(w.executors[0].runtime.currentIndex, 0);
  assert.equal(w.batches.find(b => b.id === ids[1]).inputResource, '');
  w = D.retryExportJob(w, job.id, now);
  for (let i = 0; i < 5; i++) w = W.tickWorkspace(JSON.parse(JSON.stringify(w)), now + i);
  assert.equal(w.executors[0].runtime.currentIndex, 1);
  const b = w.batches.find(b => b.id === ids[1]); assert.equal(b.total, 12);
  assert.equal(b.inputResource, w.exportJobs.find(j => j.id === job.id).resource);
  assert.equal(w.exportJobs.filter(j => j.trigger === 'finish').length, 1);
});
test('early finish passes the completed subset to B then C, never ends the entire executor', () => {
  let w = chain(); const ids = w.executors[0].runtime.batchIds;
  w = R.changeExecutorState(w, 'delivery-demo', 'resume');
  w = R.changeExecutorState(w, 'delivery-demo', 'finish-batch');
  assert.equal(w.batches.find(b => b.id === ids[0]).finish.inFlight, 2);
  for (let i = 0; i < 7; i++) w = W.tickWorkspace(w, now + i);
  assert.equal(w.executors[0].runtime.currentIndex, 1);
  assert.equal(w.batches.find(b => b.id === ids[1]).total, 14);
  for (let i = 0; i < 35; i++) w = W.tickWorkspace(w, now + i);
  assert.equal(w.executors[0].runtime.state, 'completed');
  assert.equal(w.batches.find(b => b.id === ids[2]).success, 14);
});
test('zero successful rows never dispatch an empty downstream batch or fabricate a file', () => {
  let w = chain(); const ids = w.executors[0].runtime.batchIds;
  Object.assign(w.batches.find(b => b.id === ids[0]), { success: 0, results: [], status: '已暂停' });
  w = R.changeExecutorState(w, 'delivery-demo', 'finish-batch'); w = W.tickWorkspace(w, now);
  assert.equal(w.executors[0].runtime.state, 'completed');
  assert.equal(w.batches.find(b => b.id === ids[1]).total, 0); assert.equal(w.exportJobs, undefined);
});

test('processing continues during manual export and newly completed rows stay outside the snapshot', () => {
  let w = D.createExportJob(fixture(), request(), now);
  w = W.tickWorkspace(w, now);
  assert.equal(w.batches[0].status, '运行中'); assert.equal(w.batches[0].success, 5);
  assert.equal(w.exportJobs[0].members.length, 4); assert.equal(w.exportJobs[0].status, 'generating');
});
test('last step may skip automatic generation while the executor still completes', () => {
  let w = chain(); const ids = w.executors[0].runtime.batchIds;
  w = D.setDeliveryMode(w, ids[2], 'none'); w = R.changeExecutorState(w, 'delivery-demo', 'resume');
  for (let i = 0; i < 50; i++) w = W.tickWorkspace(w, now + i);
  assert.equal(w.executors[0].runtime.state, 'completed');
  assert.equal(w.batches.find(b => b.id === ids[2]).status, '已结束');
  assert(w.batches.find(b => b.id === ids[2]).results.length > 0);
  assert.equal(w.exportJobs.filter(j => j.batchId === ids[2]).length, 0);
});

const EW = require('../src/components/sites/hawk/data/export-window.ts');
test('relative windows resolve to absolute times and reject invalid duration', () => {
  const range = EW.recentExportRange(60, now);
  assert.deepEqual(range, { kind: 'interval', start: time('11:00:00'), end: now });
  assert.equal(D.selectResults(fixture().batches[0], range, now).length, 1);
  for (const duration of [0, -1, NaN, Infinity]) assert.throws(() => EW.recentExportRange(duration, now));
});
test('continuation uses the furthest successful endpoint, ignoring failed and generating jobs', () => {
  const make = (id, range, status = 'succeeded') => ({ id, range, status, snapshotAt: now });
  const jobs = [
    make('old', { kind: 'interval', start: time('09:00:00'), end: time('10:00:00') }),
    make('new', { kind: 'interval', start: time('08:00:00'), end: time('09:00:00') }),
    make('failed', { kind: 'all' }, 'failed'), make('pending', { kind: 'all' }, 'generating'),
  ];
  const end = EW.latestDeliveredEnd(jobs, time('08:00:00'));
  assert.equal(end, time('10:00:00'));
  assert.deepEqual(D.selectResults(fixture().batches[0], { kind: 'interval', start: end, end: now }, now).map(row => row.id), ['c', 'd']);
  assert.equal(EW.latestDeliveredEnd([], now), undefined);
});
test('legacy inclusive export windows continue without re-exporting their endpoint', () => {
  const job = { range: { kind: 'until', end: time('10:00:00') }, status: 'succeeded', snapshotAt: now };
  const boundary = EW.latestDeliveredEnd([job], time('08:00:00'));
  assert.equal(boundary, time('10:00:00') + 1);
  assert.deepEqual(D.selectResults(fixture().batches[0], { kind: 'interval', start: boundary, end: now }, now).map(row => row.id), ['d']);
  assert.equal(EW.deliveredWindow({ ...job, range: { kind: 'all' } }, time('08:00:00')).end, now + 1);
});
