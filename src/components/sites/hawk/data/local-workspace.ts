import { PIPELINE_GROUPS, type PipelineDraft, type PipelineGroup } from './mock-pipelines';
import { useSyncExternalStore } from 'react';
import { PROJECTS, type ProjectRow } from './mock-projects';
import { BATCHES, type BatchRow } from './mock-batches';
import type { TrialInstance } from './trial-instances';
import type { ExecutorSettings } from './executor-settings';
import { normalizeProjectAssociations } from './workspace-projects';
import type { DeliveryMode, ExportJob } from './delivery';
import type { StreamPolicy, StreamRun } from './executor-streaming';

export interface LocalExecutor {
  runMode?: 'batch' | 'stream';
  streamPolicy?: StreamPolicy;
  stream?: StreamRun;
  clonedFrom?: string;
  notification?: { baseline: number; reminder: number; stop: number; recipients: string };
  costFeedback?: { kind: 'accuracy' | 'missed'; eventId?: string; batchId?: number; text: string; at: number }[];
  deliveryMode?: Exclude<DeliveryMode, 'none'>;
  id: string; name: string; description: string; projectId?: number;
  purpose?: 'trial'; sourceDraftId?: string;
  source: 'selection' | 'canvas'; flowIds: string[]; flows: PipelineDraft[];
  input?: string; concurrency?: number; updatedAt?: string;
  inputCount?: number;
  resourceType?: 'video' | 'image' | 'audio' | 'other';
  settings?: ExecutorSettings;
  runtime?: {
    batchIds: number[];
    currentIndex: number;
    state: 'ready' | 'running' | 'paused' | 'waiting' | 'completed' | 'ended';
    phase: 'processing' | 'exporting' | 'retrying' | 'review';
    started: boolean;
    reason?: string;
    retryCounts?: Record<string, number>;
    retryRemaining?: number;
    urgent?: boolean;
  };
}
export interface LocalWorkspace { lastSimulationTick?: number; exportJobs?: ExportJob[]; trialRuns?: TrialInstance[]; groups: PipelineGroup[]; executors: LocalExecutor[]; projects: ProjectRow[]; batches: BatchRow[]; }
export const WORKSPACE_KEY = 'annotation-demo.local-workspace.v2';
export const WORKSPACE_EVENT = 'hawk-workspace-change';
export const WORKSPACE_ERROR_EVENT = 'hawk-workspace-storage-error';
export const WORKSPACE_RESUME_EVENT = 'hawk-workspace-runtime-resume';
const DATABASE_NAME = 'annotation-demo.workspace.v2';
const LEGACY_DATABASE_NAME = 'annotation-demo.workspace.v1';
const RESULT_STORE = 'batch-results';
const initialWorkspace = (): LocalWorkspace => ({ groups: PIPELINE_GROUPS, executors: [], projects: PROJECTS, batches: BATCHES });
function decodeWorkspace(raw: string): LocalWorkspace {
  const parsed = JSON.parse(raw) as Partial<LocalWorkspace> | null;
  return normalizeProjectAssociations(parsed && Array.isArray(parsed.groups) && Array.isArray(parsed.executors) ? { ...initialWorkspace(), ...parsed } : initialWorkspace());
}
const serverSnapshot = initialWorkspace();
let workspaceCache: LocalWorkspace | undefined;
let committedWorkspace: LocalWorkspace | undefined;
let storageEpoch = 0;
let hydration: Promise<void> | undefined;
let persistQueue = Promise.resolve();
let database: Promise<IDBDatabase> | undefined;
const persistedResultCounts = new Map<number, number>();
let legacyDemoDataCleared = false;

function clearLegacyDemoData() {
  if (legacyDemoDataCleared || typeof window === 'undefined') return;
  legacyDemoDataCleared = true;
  ['annotation-demo.local-workspace.v1', 'annotation-demo.local-resource-entries.v1', 'annotation-demo.local-batch-inputs.v1'].forEach(key => localStorage.removeItem(key));
  window.indexedDB?.deleteDatabase(LEGACY_DATABASE_NAME);
}

function getDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(RESULT_STORE, { keyPath: ['batchId', 'position'] });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开浏览器结果存储'));
  });
  return database;
}

function announceChange() { window.dispatchEvent(new Event(WORKSPACE_EVENT)); }
function announceStorageError() { window.dispatchEvent(new Event(WORKSPACE_ERROR_EVENT)); }
function readBaseWorkspace() {
  clearLegacyDemoData();
  try { return decodeWorkspace(localStorage.getItem(WORKSPACE_KEY) ?? 'null'); }
  catch { return initialWorkspace(); }
}

export function compactWorkspace(workspace: LocalWorkspace): LocalWorkspace {
  return { ...workspace, batches: workspace.batches.map(batch => Object.fromEntries(Object.entries(batch).filter(([key]) => key !== 'results')) as BatchRow) };
}

export function mergeWorkspaceResults(workspace: LocalWorkspace, records: { batchId: number; results: NonNullable<BatchRow['results']> }[]): LocalWorkspace {
  const byBatch = new Map(records.map(record => [record.batchId, record.results]));
  return { ...workspace, batches: workspace.batches.map(batch => byBatch.has(batch.id) ? { ...batch, results: byBatch.get(batch.id)! } : batch) };
}

async function hydrateWorkspace() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return;
  const base = workspaceCache ?? readBaseWorkspace();
  const db = await getDatabase();
  const records = await new Promise<{ batchId: number; position: number; result: NonNullable<BatchRow['results']>[number] }[]>((resolve, reject) => {
    const request = db.transaction(RESULT_STORE, 'readonly').objectStore(RESULT_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法读取浏览器结果存储'));
  });
  const grouped = new Map<number, NonNullable<BatchRow['results']>>();
  records.forEach(({ batchId, result }) => { const rows = grouped.get(batchId) ?? []; rows.push(result); grouped.set(batchId, rows); });
  grouped.forEach((results, batchId) => persistedResultCounts.set(batchId, results.length));
  workspaceCache = mergeWorkspaceResults(base, [...grouped].map(([batchId, results]) => ({ batchId, results })));
  announceChange();
}

function ensureHydrated() {
  hydration ??= hydrateWorkspace().catch(error => { announceStorageError(); throw error; });
  return hydration;
}

const subscribe = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === WORKSPACE_KEY) {
      workspaceCache = readBaseWorkspace();
      committedWorkspace = workspaceCache;
      storageEpoch += 1;
      hydration = undefined;
      void ensureHydrated().catch(() => undefined);
    }
    listener();
  };
  window.addEventListener(WORKSPACE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(WORKSPACE_EVENT, listener); window.removeEventListener('storage', onStorage); };
};
const snapshot = () => {
  if (typeof window === 'undefined') return serverSnapshot;
  if (!workspaceCache) {
    workspaceCache = readBaseWorkspace();
    void ensureHydrated();
  }
  return workspaceCache;
};
export function useWorkspace(): LocalWorkspace {
  return useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
}

export function readWorkspace(): LocalWorkspace {
  if (typeof window === 'undefined') return initialWorkspace();
  if (!workspaceCache) workspaceCache = readBaseWorkspace();
  void ensureHydrated();
  return workspaceCache;
}
export function writeWorkspace(next: LocalWorkspace): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  committedWorkspace ??= workspaceCache ?? readBaseWorkspace();
  const epoch = storageEpoch;
  const normalized = normalizeProjectAssociations(next);
  workspaceCache = normalized;
  announceChange();
  const operation = persistQueue.then(async () => {
    if (epoch !== storageEpoch) throw new Error('前一次保存失败，请重新操作');
    await ensureHydrated();
    const existingResults = new Map((workspaceCache?.batches ?? []).filter(batch => batch.results).map(batch => [batch.id, batch.results!]));
    const complete = { ...normalized, batches: normalized.batches.map(batch => batch.results === undefined && existingResults.has(batch.id) ? { ...batch, results: existingResults.get(batch.id) } : batch) };
    const db = await getDatabase();
    const changedResultCounts = new Map<number, number>();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(RESULT_STORE, 'readwrite');
      const store = transaction.objectStore(RESULT_STORE);
      complete.batches.forEach(batch => {
        const results = batch.results ?? [];
        const previousCount = persistedResultCounts.get(batch.id) ?? 0;
        const previousRows = committedWorkspace?.batches.find(item => item.id === batch.id)?.results ?? [];
        if (results.length < previousCount || results.length === previousCount && JSON.stringify(results) !== JSON.stringify(previousRows)) {
          store.delete(IDBKeyRange.bound([batch.id, 0], [batch.id, Number.MAX_SAFE_INTEGER]));
          results.forEach((result, position) => store.put({ batchId: batch.id, position, result }));
          changedResultCounts.set(batch.id, results.length);
        } else if (results.length > previousCount) {
          results.slice(previousCount).forEach((result, offset) => store.put({ batchId: batch.id, position: previousCount + offset, result }));
          changedResultCounts.set(batch.id, results.length);
        }
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('无法保存批次结果'));
      transaction.onabort = () => reject(transaction.error ?? new Error('批次结果保存已取消'));
    });
    changedResultCounts.forEach((count, batchId) => persistedResultCounts.set(batchId, count));
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(compactWorkspace(complete)));
    committedWorkspace = complete;
    workspaceCache = complete;
    announceChange();
  });
  persistQueue = operation.catch(() => undefined);
  return operation.then(() => true, () => {
    // Discard queued optimistic changes based on a failed save, including runtime ticks.
    if (epoch === storageEpoch) { storageEpoch += 1; workspaceCache = committedWorkspace; announceChange(); }
    announceStorageError(); return false;
  });
}
export function saveExecutor(executor: LocalExecutor) {
  const current = readWorkspace();
  writeWorkspace({ ...current, executors: [{ ...executor, updatedAt: new Date().toISOString() }, ...current.executors.filter(item => item.id !== executor.id)] });
}
export function publishedFlows() {
  return readWorkspace().groups.flatMap(group => group.drafts.filter(flow => flow.status === 'published'));
}

export function matchesCreatedAt(value: string, filter: string): boolean {
  if (filter === '所有时间') return true;
  const date = new Date(value.replace(' ', 'T'));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = filter === '今天' ? today : filter.includes('7') ? new Date(today.getTime() - 7 * 86400000) : filter.includes('30') ? new Date(today.getTime() - 30 * 86400000) : new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return date >= from && date <= now;
}
