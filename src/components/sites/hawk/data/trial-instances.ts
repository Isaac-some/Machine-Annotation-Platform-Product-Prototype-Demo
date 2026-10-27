import type { LocalWorkspace } from './local-workspace';
export interface TrialInstance {
  id: string; draftId: string; projectId: number; name: string; sequence: number;
  phase: 'running' | 'passed' | 'failed'; createdAt: number; kept: boolean;
  revision: number; scope?: string;
}
export const trialVisible = (run: TrialInstance, now = Date.now()) => run.phase === 'running' || run.kept || run.createdAt + 7 * 86400000 > now;
export function syncTrialInstances(workspace: LocalWorkspace, draftId: string, projectId: number, title: string, input: unknown): LocalWorkspace {
  if (!Array.isArray(input) || input.length > 10) return workspace;
  const valid = input.every(run => run && typeof run.id === 'string' && run.id.startsWith('trial-') && Number.isSafeInteger(run.sequence) && run.sequence > 0 && ['running', 'passed', 'failed'].includes(run.phase) && Number.isFinite(run.createdAt) && Number.isSafeInteger(run.revision) && typeof run.kept === 'boolean' && (run.scope === undefined || typeof run.scope === 'string'));
  if (!valid || new Set(input.map(run => run.id)).size !== input.length) return workspace;
  const runs: TrialInstance[] = input.map(run => ({ id: run.id, draftId, projectId, name: title, sequence: run.sequence, phase: run.phase, createdAt: run.createdAt, kept: run.kept, revision: run.revision, scope: run.scope }));
  const trialRuns = [...(workspace.trialRuns ?? []).filter(run => run.draftId !== draftId), ...runs];
  return JSON.stringify(trialRuns) === JSON.stringify(workspace.trialRuns ?? []) ? workspace : { ...workspace, trialRuns };
}
