import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { hasBlockingBatchIssues } = require('../src/components/sites/hawk/data/batch-common.ts');
const { canExecutorAction } = require('../src/components/sites/hawk/data/executor-runtime.ts');

test('batch level blockers stop start/resume while warnings and cleared issues do not', () => {
  assert.equal(hasBlockingBatchIssues({ batchIssues: [{ code: 'header', title: '缺少表头', message: 'rowkey' }] }), true);
  assert.equal(hasBlockingBatchIssues({ batchIssues: [{ code: 'notice', title: '提醒', message: '检查输入', blocking: false }] }), false);
  assert.equal(hasBlockingBatchIssues({ batchIssues: [] }), false);
});

test('executor start is blocked by batch level diagnostics and becomes available after they clear', () => {
  const batch = { id: 1, batchIssues: [{ code: 'duplicate-rowkey', title: 'rowkey 重复', message: '请检查输入' }] };
  const executor = { id: 'demo', runMode: 'stream', input: 'tos://demo/input.csv', inputCount: 500, streamPolicy: { maxRetries: 0 }, runtime: { batchIds: [1], state: 'ready' } };
  const workspace = { executors: [executor], batches: [batch] };
  assert.equal(canExecutorAction(workspace, executor, 'start'), false);
  batch.batchIssues = [];
  assert.equal(canExecutorAction(workspace, executor, 'start'), true);
});
