import type { LocalExecutor, LocalWorkspace } from './local-workspace';
import type { PipelineGroup } from './mock-pipelines';

export function groupProjectId(workspace: Pick<LocalWorkspace, 'projects'>, group: PipelineGroup): number | undefined {
  if (workspace.projects.some(project => project.id === group.projectId)) return group.projectId;
  const matches = workspace.projects.filter(project => project.name === group.project);
  return matches.length === 1 ? matches[0].id : undefined;
}

export function draftProjectId(workspace: Pick<LocalWorkspace, 'projects' | 'groups'>, draftId: string): number | undefined {
  const groups = workspace.groups.filter(group => group.drafts.some(flow => flow.id === draftId));
  const ids = groups.map(group => groupProjectId(workspace, group));
  return ids.length && ids.every(id => id !== undefined && id === ids[0]) ? ids[0] : undefined;
}

export function executorProjectId(workspace: LocalWorkspace, executor: LocalExecutor): number | undefined {
  if (workspace.projects.some(project => project.id === executor.projectId)) return executor.projectId;
  const batchIds = new Set(workspace.batches.filter(batch => batch.executorId === executor.id && workspace.projects.some(project => project.id === batch.projectId)).map(batch => batch.projectId));
  const ids = executor.flowIds.map(id => draftProjectId(workspace, id));
  if (batchIds.size === 1 && ids.every(id => id === undefined || batchIds.has(id))) return [...batchIds][0];
  if (batchIds.size) return undefined;
  return ids.length && ids.every(id => id !== undefined && id === ids[0]) ? ids[0] : undefined;
}

/** Repair only a uniquely evidenced legacy association. Never pick a first project. */
export function normalizeProjectAssociations(workspace: LocalWorkspace): LocalWorkspace {
  const groups = workspace.groups.map(group => {
    const projectId = groupProjectId(workspace, group);
    return projectId !== undefined && projectId !== group.projectId ? { ...group, projectId } : group;
  });
  const scoped = { ...workspace, groups };
  const executors = workspace.executors.map(executor => {
    const projectId = executorProjectId(scoped, executor);
    return projectId !== undefined && projectId !== executor.projectId ? { ...executor, projectId } : executor;
  });
  const batches = workspace.batches.map(batch => {
    const projectId = batch.executorId ? executors.find(executor => executor.id === batch.executorId)?.projectId : undefined;
    return projectId !== undefined && batch.projectId !== projectId ? { ...batch, projectId } : batch;
  });
  return { ...workspace, groups, executors, batches };
}
