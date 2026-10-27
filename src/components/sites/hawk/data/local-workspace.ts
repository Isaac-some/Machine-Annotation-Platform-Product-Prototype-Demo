import { PIPELINE_GROUPS, type PipelineDraft, type PipelineGroup } from './mock-pipelines';
import { useMemo, useSyncExternalStore } from 'react';
import { PROJECTS, type ProjectRow } from './mock-projects';
import { BATCHES, type BatchRow } from './mock-batches';
import type { ExecutorSettings } from './executor-settings';
import { normalizeProjectAssociations } from './workspace-projects';

export interface LocalExecutor {
  id: string; name: string; description: string; projectId?: number;
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
export interface LocalWorkspace { groups: PipelineGroup[]; executors: LocalExecutor[]; projects: ProjectRow[]; batches: BatchRow[]; }
export const WORKSPACE_KEY = 'annotation-demo.local-workspace.v1';
export const WORKSPACE_EVENT = 'hawk-workspace-change';
const initialWorkspace = (): LocalWorkspace => ({ groups: PIPELINE_GROUPS, executors: [], projects: PROJECTS, batches: BATCHES });
function decodeWorkspace(raw: string): LocalWorkspace {
  const parsed = JSON.parse(raw) as Partial<LocalWorkspace> | null;
  return normalizeProjectAssociations(parsed && Array.isArray(parsed.groups) && Array.isArray(parsed.executors) ? { ...initialWorkspace(), ...parsed } : initialWorkspace());
}
const serverSnapshot = JSON.stringify(initialWorkspace());
const subscribe = (listener: () => void) => {
  window.addEventListener(WORKSPACE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => { window.removeEventListener(WORKSPACE_EVENT, listener); window.removeEventListener('storage', listener); };
};
const snapshot = () => localStorage.getItem(WORKSPACE_KEY) ?? serverSnapshot;
export function useWorkspace(): LocalWorkspace {
  const raw = useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
  return useMemo(() => { try { return decodeWorkspace(raw); } catch { return initialWorkspace(); } }, [raw]);
}

export function readWorkspace(): LocalWorkspace {
  if (typeof window === 'undefined') return initialWorkspace();
  try {
    return decodeWorkspace(localStorage.getItem(WORKSPACE_KEY) ?? 'null');
  } catch { /* Keep reference data usable if storage is unavailable. */ }
  return initialWorkspace();
}
export function writeWorkspace(next: LocalWorkspace) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(normalizeProjectAssociations(next)));
  window.dispatchEvent(new Event(WORKSPACE_EVENT));
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
