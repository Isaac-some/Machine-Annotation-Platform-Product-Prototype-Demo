import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);

test('legacy result rows migrate out of the workspace snapshot and hydrate after reload', async () => {
  const storage = new Map();
  const rows = new Map();
  const listeners = new EventTarget();
  global.window = Object.assign(listeners, { indexedDB: null });
  global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  global.IDBKeyRange = { bound: (lower, upper) => ({ lower, upper }) };
  global.indexedDB = { open: () => {
    const request = {};
    setImmediate(() => {
      const stores = {
        contains: () => true,
        create: () => undefined,
        get: () => ({
          getAll: () => { const result = {}; setImmediate(() => { result.result = [...rows.values()].sort((a, b) => a.batchId - b.batchId || a.position - b.position); result.onsuccess?.(); }); return result; },
          put: record => { rows.set(`${record.batchId}:${record.position}`, record); },
          delete: range => { for (const [key, record] of rows) if (record.batchId >= range.lower[0] && record.batchId <= range.upper[0]) rows.delete(key); },
        }),
      };
      request.result = {
        objectStoreNames: stores,
        createObjectStore: stores.create,
        transaction: () => {
          const transaction = { objectStore: stores.get, error: undefined };
          setImmediate(() => transaction.oncomplete?.());
          return transaction;
        },
      };
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  } };
  global.window.indexedDB = global.indexedDB;

  const path = '../src/components/sites/hawk/data/local-workspace.ts';
  const first = require(path);
  const legacy = { groups: [], executors: [], projects: [], batches: [{ id: 7, results: [{ id: '7:a', batchId: 7, inputOrder: 1, completedAt: 10, values: { result: 'kept' } }] }] };
  storage.set(first.WORKSPACE_KEY, JSON.stringify(legacy));
  assert.equal(await first.writeWorkspace(first.readWorkspace()), true);
  const compact = JSON.parse(storage.get(first.WORKSPACE_KEY));
  assert.equal('results' in compact.batches[0], false);
  assert.equal(rows.get('7:0').result.id, '7:a');

  delete require.cache[require.resolve(path)];
  const reloaded = require(path);
  assert.equal(reloaded.readWorkspace().batches[0].results, undefined);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reloaded.readWorkspace().batches[0].results[0].values.result, 'kept');
});
