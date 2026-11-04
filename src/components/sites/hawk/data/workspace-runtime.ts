import { tickBatchRetry } from './batch-common';
import type { LocalWorkspace } from './local-workspace';
import type { BatchRow } from './mock-batches';
import { advanceBatchFinish, appendCompletedResults, beginBatchFinish, cloneWorkspace, tickExportJobs } from './delivery';
import { tickExecutor } from './executor-runtime';

export function enableSimulation(batch: BatchRow) {
  if (!batch.simulation) batch.simulation = { legacySuccess: Math.max(0, batch.success) };
  batch.results ??= [];
}
export function finishStandaloneBatch(workspace: LocalWorkspace, batchId: number, now = Date.now()): LocalWorkspace {
  const batch = workspace.batches.find(item => item.id === batchId);
  if (!batch || batch.executorId) throw new Error('请从执行器工作台结束关联批次');
  if (batch.finish) return workspace;
  if (!['运行中', '已暂停', '部分失败', '已完成'].includes(batch.status)) throw new Error('当前批次不可结束');
  const next = cloneWorkspace(workspace), target = next.batches.find(item => item.id === batchId)!;
  enableSimulation(target); beginBatchFinish(next, batchId, now); return next;
}
export function tickWorkspace(workspace: LocalWorkspace, now = Date.now()): LocalWorkspace {
  let next = tickExportJobs(workspace, now);
  for (const executor of next.executors) next = tickExecutor(next, executor.id);
  const batches = next.batches.filter(batch => !batch.executorId && (batch.retryTask && batch.retryTask.phase !== 'done' || batch.finish && batch.finish.phase !== 'done' || batch.simulation && batch.status === '运行中'));
  if (!batches.length) return next;
  next = cloneWorkspace(next);
  for (const id of batches.map(batch => batch.id)) {
    const batch = next.batches.find(item => item.id === id)!;
    if (batch.retryTask && batch.retryTask.phase !== 'done') { tickBatchRetry(batch); appendCompletedResults(batch, now); }
    else if (batch.finish) advanceBatchFinish(next, batch, now);
    else {
      const completed = Math.max(0, batch.success) + Math.max(0, batch.failed) + Math.max(0, batch.filtered);
      batch.success = Math.max(0, batch.success) + Math.min(Math.max(0, batch.total - completed), Math.max(1, Math.ceil(batch.total / 20)));
      batch.progress = batch.total > 0 ? Math.min(100, Math.round((batch.success + Math.max(0, batch.failed) + Math.max(0, batch.filtered)) / batch.total * 100)) : 100;
      appendCompletedResults(batch, now);
      if (batch.progress === 100) { batch.nodes.forEach(node => { if (node.status !== '失败') node.status = '已完成'; }); beginBatchFinish(next, batch.id, now); }
    }
    batch.updatedAt = new Date(now).toISOString();
  }
  return next;
}
