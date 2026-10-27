import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const loadModule = createRequire(import.meta.url);
loadModule.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const R = loadModule('../src/components/sites/hawk/data/executor-runtime.ts');
const { publishedFlowId } = loadModule('../src/components/sites/hawk/data/mock-pipelines.ts');
const { draftProjectId, normalizeProjectAssociations } = loadModule('../src/components/sites/hawk/data/workspace-projects.ts');
const workspace = () => ({ groups: [], projects: [], batches: [], executors: [{ id: 'test', name: 'test', description: '', source: 'selection', projectId: 234, flowIds: ['a', 'b'], flows: [
  { id: 'a', name: 'First', description: 'original', status: 'published', outputs: ['tos_path'], version: 2, graphKey: 'published.a' },
  { id: 'b', name: 'Second', description: '', status: 'published', outputs: ['result'], version: 1 },
] }] });
const setup = () => R.initializeExecutor(workspace(), 'test', { 'published.a': { nodes: [{ id: 'end', data: { kind: 'result', operatorId: 'control.result', label: 'End' } }, { id: 'step', data: { operatorId: 'process', label: 'Process' } }, { id: 'start', data: { operatorId: 'control.start', label: 'Start' } }], edges: [{ source: 'start', target: 'step' }, { source: 'step', target: 'end' }] } });
const prepared = () => R.setExecutorInput(setup(), 'test', 'tos://example/input.csv', 13);
test('publication identity includes @ revision and honors an assigned full ID', () => {
  assert.equal(publishedFlowId(workspace().executors[0].flows[0]), 'flow.a@2');
  assert.equal(publishedFlowId({ ...workspace().executors[0].flows[0], publishedId: 'flow.unique@7' }), 'flow.unique@7');
});
test('legacy executor and its batches inherit only a uniquely evidenced draft project', () => {
  const w = setup(); delete w.executors[0].projectId;
  w.projects = [{ id: 234, name: 'Project A' }, { id: 233, name: 'Project B' }];
  w.groups = [{ project: 'Project A', drafts: w.executors[0].flows }];
  w.batches.forEach(batch => batch.projectId = 0);
  const next = normalizeProjectAssociations(w);
  assert.equal(next.executors[0].projectId, 234);
  assert(next.batches.every(batch => batch.projectId === 234));
  assert.equal(w.executors[0].projectId, undefined);
  assert.equal(draftProjectId(next, 'a'), 234);
  const renamed = { ...next, projects: next.projects.map(project => ({ ...project, name: project.name + ' renamed' })) };
  assert.equal(draftProjectId(renamed, 'a'), 234);
  const restored = JSON.parse(JSON.stringify(next));
  assert.deepEqual(normalizeProjectAssociations(restored), restored);
});
test('missing, ambiguous or mixed draft ownership never falls back to a first project', () => {
  const w = workspace(); delete w.executors[0].projectId;
  w.projects = [{ id: 234, name: 'Same' }, { id: 233, name: 'Same' }];
  w.groups = [{ project: 'Same', drafts: w.executors[0].flows }];
  assert.equal(normalizeProjectAssociations(w).executors[0].projectId, undefined);
  w.groups = [{ project: 'A', projectId: 234, drafts: [w.executors[0].flows[0]] }, { project: 'B', projectId: 233, drafts: [w.executors[0].flows[1]] }];
  assert.equal(normalizeProjectAssociations(w).executors[0].projectId, undefined);
  w.groups = [];
  assert.equal(draftProjectId(w, 'a'), undefined);
  w.groups = [{ project: 'A', projectId: 234, drafts: w.executors[0].flows }];
  w.batches = [{ executorId: 'test', projectId: 233 }];
  assert.equal(normalizeProjectAssociations(w).executors[0].projectId, undefined);
});
test('initialization is idempotent, keeps fixed publications and avoids invented nodes', () => {
  const w = setup(); assert.equal(w.batches.length, 2);
  assert.equal(R.initializeExecutor(w, 'test', {}), w);
  assert.equal(w.batches[0].workflow, 'flow.a@2');
  assert.deepEqual(w.batches[0].nodes.map(node => node.name), ['Process']);
  assert.deepEqual(w.batches[1].nodes, []);
  assert.equal(w.batches[1].inputResource, ''); assert.equal(w.batches[1].total, -1);
});
test('missing or invalid input blocks starting without mutating the workspace', () => {
  const w = setup(), before = JSON.stringify(w);
  assert.throws(() => R.changeExecutorState(w, 'test', 'start'), /输入/);
  for (const [resource, count] of [['invalid', 10], ['tos://valid/a', 0], ['CID://1', 1.5]]) assert.throws(() => R.setExecutorInput(w, 'test', resource, count));
  assert.equal(JSON.stringify(w), before);
});
test('valid preparation updates only the first batch', () => {
  const w = prepared(); assert.equal(w.batches[0].total, 13); assert.equal(w.batches[1].total, -1);
  assert.equal(w.batches[1].inputResource, '');
  assert.equal(R.canExecutorAction(w, w.executors[0], 'start'), true);
});
test('pause freezes progress, resume continues and input cannot change after starting', () => {
  let w = R.changeExecutorState(prepared(), 'test', 'start'); w = R.tickExecutor(w, 'test');
  const progress = w.batches[0].progress;
  w = R.changeExecutorState(w, 'test', 'pause');
  assert.equal(R.tickExecutor(w, 'test'), w); assert.equal(w.batches[0].progress, progress);
  assert.throws(() => R.setExecutorInput(w, 'test', 'CID://other', 20), /不能更换/);
  w = R.changeExecutorState(w, 'test', 'resume'); w = R.tickExecutor(w, 'test');
  assert.ok(w.batches[0].progress > progress); assert.equal(w.batches[1].inputResource, '');
});
test('successor waits for export, then receives only its own predecessor output', () => {
  let w = R.changeExecutorState(prepared(), 'test', 'start');
  for (let i = 0; i < 5; i++) w = R.tickExecutor(w, 'test');
  assert.equal(w.batches[0].status, '已完成'); assert.equal(w.batches[1].status, '初始化');
  assert.equal(w.batches[1].inputResource, '');
  w = R.tickExecutor(w, 'test');
  assert.equal(w.batches[0].status, '已导出'); assert.equal(w.batches[1].status, '运行中');
  assert.equal(w.batches[1].inputResource, w.batches[0].deliveryResource);
  assert.equal(w.batches[1].total, 13); assert.equal(w.executors[0].runtime.currentIndex, 1);
});
test('completion preserves batches and cannot start the same run twice', () => {
  let w = R.changeExecutorState(prepared(), 'test', 'start');
  assert.throws(() => R.changeExecutorState(w, 'test', 'start'));
  for (let i = 0; i < 12; i++) w = R.tickExecutor(w, 'test');
  assert.equal(w.executors[0].runtime.state, 'completed');
  assert.ok(w.batches.every(batch => batch.status === '已导出'));
  assert.equal(R.tickExecutor(w, 'test'), w);
  assert.throws(() => R.changeExecutorState(w, 'test', 'start'));
});
test('ending preserves partial progress and prevents later steps from starting', () => {
  let w = R.changeExecutorState(prepared(), 'test', 'start'); w = R.tickExecutor(w, 'test');
  const success = w.batches[0].success;
  w = R.changeExecutorState(w, 'test', 'end');
  assert.equal(w.batches[0].success, success); assert.equal(w.batches[1].inputResource, '');
  assert.equal(R.tickExecutor(w, 'test'), w); assert.equal(w.executors[0].runtime.state, 'ended');
});
test('a failed node pauses the executor before any successor can start', () => {
  let w = R.changeExecutorState(prepared(), 'test', 'start');
  w.batches[0].nodes[0].status = '失败';
  w = R.tickExecutor(w, 'test');
  assert.equal(w.executors[0].runtime.state, 'waiting');
  assert.equal(w.batches[1].inputResource, '');
  assert.equal(w.batches[0].progress, 0);
});

const { DEFAULT_EXECUTOR_SETTINGS, batchSuccessRate } = loadModule('../src/components/sites/hawk/data/executor-settings.ts');
function finished(settings, counts = { total: 100, success: 90, failed: 10, filtered: 0 }) {
  let w = R.setExecutorInput(setup(), 'test', 'tos://demo/input.csv', counts.total);
  w.executors[0].settings = { ...DEFAULT_EXECUTOR_SETTINGS, ...settings };
  w = R.changeExecutorState(w, 'test', 'start');
  Object.assign(w.batches[0], counts, { progress: 100, status: '部分失败' });
  w.batches[0].nodes.forEach(node => node.status = counts.failed ? '失败' : '已完成');
  return R.tickExecutor(w, 'test');
}
test('rigorous mode waits even at full success and manual confirmation gates export', () => {
  let w = finished({ mode: 'rigorous' }, { total: 100, success: 100, failed: 0, filtered: 0 });
  assert.equal(w.executors[0].runtime.state, 'waiting');
  assert.equal(R.canExecutorAction(w, w.executors[0], 'resume'), false);
  assert.equal(R.tickExecutor(w, 'test'), w);
  assert.equal(w.batches[1].inputResource, '');
  w = R.changeExecutorState(w, 'test', 'confirm');
  w = R.tickExecutor(w, 'test');
  assert.equal(w.batches[0].status, '已导出');
  assert.equal(w.batches[1].total, 100);
});
test('filter denominator excludes filters or counts them as failures, never fabricates 100% for zero', () => {
  assert.equal(batchSuccessRate({ total: 100, success: 90, filtered: 10 }, 'exclude'), 100);
  assert.equal(batchSuccessRate({ total: 100, success: 90, filtered: 10 }, 'include'), 90);
  assert.equal(batchSuccessRate({ total: 10, success: 0, filtered: 10 }, 'exclude'), null);
  const w = finished({ mode: 'target', filterRule: 'include', maxRetries: 3 }, { total: 100, success: 90, failed: 0, filtered: 10 });
  assert.equal(w.executors[0].runtime.state, 'waiting');
  assert.equal(w.executors[0].runtime.retryCounts, undefined);
});
test('target retries only failed rows, stops at target and releases successful output', () => {
  let w = finished({ mode: 'target', targetRate: 95 });
  assert.equal(w.executors[0].runtime.phase, 'retrying');
  assert.equal(w.batches[0].success, 90);
  w = R.tickExecutor(w, 'test');
  assert.equal(w.batches[0].success, 95); assert.equal(w.batches[0].failed, 5);
  assert.equal(w.executors[0].runtime.phase, 'exporting');
  assert.equal(w.executors[0].runtime.retryCounts[w.batches[0].id], 1);
  w = R.tickExecutor(w, 'test');
  assert.equal(w.batches[1].total, 95);
});
test('zero retries is honored and exhaustion choices block or release without another attempt', () => {
  const waiting = finished({ mode: 'target', maxRetries: 0, afterRetries: 'wait' });
  assert.equal(waiting.executors[0].runtime.state, 'waiting');
  assert.equal(waiting.executors[0].runtime.urgent, true);
  assert.equal(waiting.executors[0].runtime.retryCounts, undefined);
  let passing = finished({ mode: 'target', maxRetries: 0, afterRetries: 'continue' });
  assert.equal(passing.executors[0].runtime.phase, 'exporting');
  passing = R.tickExecutor(passing, 'test'); assert.equal(passing.batches[1].total, 90);
});
test('retry exhaustion preserves counts, waits and retains configurable urgency across serialization', () => {
  let w = finished({ mode: 'target', targetRate: 100, maxRetries: 2, urgentReminder: false });
  for (let i = 0; i < 2; i++) w = R.tickExecutor(w, 'test');
  assert.equal(w.executors[0].runtime.state, 'waiting');
  assert.equal(w.executors[0].runtime.retryCounts[w.batches[0].id], 2);
  assert.equal(w.batches[0].success, 98); assert.equal(w.batches[0].failed, 2);
  assert.equal(w.executors[0].runtime.urgent, false);
  assert.equal(R.canExecutorAction(JSON.parse(JSON.stringify(w)), w.executors[0], 'confirm'), true);
});
test('configuration saves atomically, preserves locked input and rejects edits while running', () => {
  const w = prepared();
  const v = { resource: 'tos://demo/changed.csv', count: 100, resourceType: 'image', settings: { ...DEFAULT_EXECUTOR_SETTINGS, mode: 'target', maxRetries: 0 } };
  const next = R.configureExecutor(w, 'test', v);
  assert.equal(next.batches[0].material, '图片'); assert.equal(next.executors[0].inputCount, 100);
  assert.equal(w.executors[0].inputCount, 13);
  assert.throws(() => R.configureExecutor(w, 'test', { ...v, count: 0 }));
  const started = R.changeExecutorState(next, 'test', 'start');
  assert.throws(() => R.configureExecutor(started, 'test', v), /暂停/);
  const paused = R.changeExecutorState(started, 'test', 'pause');
  const edited = R.configureExecutor(paused, 'test', { ...v, resource: 'tos://ignored/new.csv', count: 77 });
  assert.equal(edited.executors[0].inputCount, 100);
});

const { syncTrialInstances, trialVisible } = loadModule('../src/components/sites/hawk/data/trial-instances.ts');
test('draft history summaries are scoped, deduplicated and removed with their owning history', () => {
  const base = workspace();
  const run = { id: 'trial-1', sequence: 1, phase: 'passed', createdAt: Date.now(), revision: 2, kept: false };
  const first = syncTrialInstances(base, 'draft-a', 234, 'Draft A', [run]);
  const second = syncTrialInstances(first, 'draft-b', 233, 'Draft B', [{ ...run, id: 'trial-2' }]);
  assert.equal(second.trialRuns.length, 2);
  assert.equal(syncTrialInstances(second, 'draft-b', 233, 'Draft B', [{ ...run, id: 'trial-2' }]), second);
  const removed = syncTrialInstances(second, 'draft-a', 234, 'Draft A', []);
  assert.deepEqual(removed.trialRuns.map(run => run.projectId), [233]);
  assert.equal(syncTrialInstances(second, 'draft-a', 234, 'Draft A', [{ ...run, phase: 'invalid' }]), second);
  assert.equal(syncTrialInstances(second, 'draft-a', 234, 'Draft A', [run, run]), second);
  assert.equal(trialVisible({ ...run, createdAt: 0 }, 8 * 86400000), false);
  assert.equal(trialVisible({ ...run, createdAt: 0, kept: true }, 8 * 86400000), true);
  assert.equal(trialVisible({ ...run, createdAt: 0, phase: 'running' }, 8 * 86400000), true);
});
test('test executor purpose survives runtime creation and later state changes', () => {
  const input = workspace(); input.executors[0].purpose = 'trial';
  const initialized = R.initializeExecutor(input, 'test', {});
  const started = R.changeExecutorState(R.setExecutorInput(initialized, 'test', 'tos://example/trial', 1), 'test', 'start');
  assert.equal(started.executors[0].purpose, 'trial');
  assert(started.batches.every(batch => batch.executorId === 'test'));
});
