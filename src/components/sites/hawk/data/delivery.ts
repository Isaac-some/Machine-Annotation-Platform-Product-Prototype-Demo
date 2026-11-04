import type { LocalWorkspace } from './local-workspace';
import type { BatchRow } from './mock-batches';

export type DeliveryMode = 'sorted' | 'unsorted' | 'none';
export type ResultRecord = { id: string; batchId: number; inputOrder: number; completedAt: number; values: Record<string, string | number> };
export type ExportRange = { kind: 'all' } | { kind: 'interval'; start: number; end: number } | { kind: 'until'; end: number };
export type ExportJob = {
  id: string; requestId: string; batchId: number; batchName: string; executorId?: string;
  step: number; intermediate: boolean; trigger: 'manual' | 'finish'; range: ExportRange;
  sorted: boolean; snapshotAt: number; actor: string; members: ResultRecord[];
  status: 'generating' | 'succeeded' | 'failed'; phase: 'organizing' | 'sorting' | 'writing' | 'done';
  progress: number; resource?: string; error?: string;
  attempts: { startedAt: number; finishedAt?: number; error?: string }[];
  simulateFailure?: boolean;
};
export const DELIVERY_LABELS: Record<DeliveryMode, string> = { sorted: '有序生成交付文件', unsorted: '不排序，生成交付文件', none: '不生成交付文件' };
export const EXPORT_PHASES = { organizing: '整理数据', sorting: '排序', writing: '生成文件', done: '完成' };
export const cloneWorkspace = (workspace: LocalWorkspace): LocalWorkspace => JSON.parse(JSON.stringify(workspace));
export const beijingTime = (value: number) => new Date(value).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false });
export function parseBeijing(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return NaN;
  const parsed = Date.parse(value + '+08:00');
  return Number.isFinite(parsed) && beijingTime(parsed).replace(' ', 'T') === (value.length === 16 ? value + ':00' : value) ? parsed : NaN;
}
export function rangeLabel(range: ExportRange): string {
  return range.kind === 'all' ? '全部已完成结果' : range.kind === 'until' ? `截至 ${beijingTime(range.end)}（含）` : `${beijingTime(range.start)} — ${beijingTime(range.end)}（不含结束）`;
}
export function hasDownstream(workspace: LocalWorkspace, batchId: number): boolean {
  const batch = workspace.batches.find(item => item.id === batchId);
  const ids = workspace.executors.find(item => item.id === batch?.executorId)?.runtime?.batchIds ?? [];
  return workspace.batches.some(item => item.inputFromBatchId === batchId) || (ids.includes(batchId) && ids.indexOf(batchId) < ids.length - 1);
}
export function deliveryLocked(batch: BatchRow): boolean {
  return Boolean(batch.finish || ['已导出', '已结束'].includes(batch.status));
}
export function setDeliveryMode(workspace: LocalWorkspace, batchId: number, mode: DeliveryMode): LocalWorkspace {
  const batch = workspace.batches.find(item => item.id === batchId);
  if (!batch || deliveryLocked(batch)) throw new Error('本批次已开始收尾，结束配置不可修改');
  if (!['sorted', 'unsorted', 'none'].includes(mode)) throw new Error('请选择有效的结束配置');
  if (mode === 'none' && hasDownstream(workspace, batchId) && workspace.executors.find(e => e.id === batch.executorId)?.runMode !== 'stream') throw new Error('后续批次依赖该文件，不能选择不生成交付文件');
  return { ...workspace, batches: workspace.batches.map(item => item.id === batchId ? { ...item, deliveryMode: mode } : item) };
}
export function setExecutorDelivery(workspace: LocalWorkspace, executorId: string, mode: Exclude<DeliveryMode, 'none'>): LocalWorkspace {
  if (!workspace.executors.some(item => item.id === executorId) || !['sorted', 'unsorted'].includes(mode)) throw new Error('请选择有效的执行器交付配置');
  return { ...workspace,
    executors: workspace.executors.map(item => item.id === executorId ? { ...item, deliveryMode: mode } : item),
    batches: workspace.batches.map(item => item.executorId === executorId && !deliveryLocked(item) ? { ...item, deliveryMode: mode } : item),
  };
}
export function selectResults(batch: BatchRow, range: ExportRange, now = Date.now()): ResultRecord[] {
  if (range.kind !== 'all' && (!Number.isFinite(range.end) || range.end > now)) throw new Error('结束时间无效或晚于当前时间');
  if (range.kind === 'interval' && (!Number.isFinite(range.start) || range.start >= range.end)) throw new Error('开始时间必须早于结束时间');
  return (batch.results ?? []).filter(row => row.completedAt <= now && (range.kind === 'all' || (range.kind === 'until' ? row.completedAt <= range.end : row.completedAt >= range.start && row.completedAt < range.end)));
}
type ExportRequest = { requestId: string; batchId: number; range: ExportRange; sorted: boolean; trigger?: ExportJob['trigger']; actor?: string };
/** Append to an already isolated draft. Finish and manual exports use the same task model. */
export function appendExportJob(workspace: LocalWorkspace, request: ExportRequest, now = Date.now()): ExportJob {
  const previous = workspace.exportJobs?.find(item => item.requestId === request.requestId);
  if (previous) return previous;
  const batch = workspace.batches.find(item => item.id === request.batchId);
  if (!batch) throw new Error('批次不存在');
  const members = selectResults(batch, request.range, now);
  if (!members.length) throw new Error(batch.results === undefined ? '历史批次缺少逐条结果记录；原交付文件仍可查看' : '所选范围内没有可导出的成功结果');
  const ids = workspace.executors.find(item => item.id === batch.executorId)?.runtime?.batchIds ?? [];
  const job: ExportJob = {
    id: `export-${Math.max(0, ...(workspace.exportJobs ?? []).map(item => Number(item.id.replace('export-', '')) || 0)) + 1}`,
    requestId: request.requestId, batchId: batch.id, batchName: batch.name, executorId: batch.executorId,
    step: ids.indexOf(batch.id) + 1, intermediate: hasDownstream(workspace, batch.id),
    trigger: request.trigger ?? 'manual', range: { ...request.range }, sorted: request.sorted,
    snapshotAt: now, actor: request.actor ?? '刘备（liubei）', members: JSON.parse(JSON.stringify(members)),
    status: 'generating', phase: 'organizing', progress: 0, attempts: [{ startedAt: now }],
  };
  workspace.exportJobs = [...(workspace.exportJobs ?? []), job];
  return job;
}
export function createExportJob(workspace: LocalWorkspace, request: ExportRequest, now = Date.now()): LocalWorkspace {
  if (workspace.exportJobs?.some(item => item.requestId === request.requestId)) return workspace;
  const next = cloneWorkspace(workspace); appendExportJob(next, request, now); return next;
}
export function retryExportJob(workspace: LocalWorkspace, id: string, now = Date.now()): LocalWorkspace {
  const job = workspace.exportJobs?.find(item => item.id === id);
  if (!job || job.status !== 'failed') throw new Error('仅失败的导出任务可以重试');
  return { ...workspace, exportJobs: workspace.exportJobs!.map(item => item.id === id ? { ...item, status: 'generating', phase: 'organizing', progress: 0, error: undefined, simulateFailure: false, attempts: [...item.attempts, { startedAt: now }] } : item) };
}
export function tickExportJobs(workspace: LocalWorkspace, now = Date.now()): LocalWorkspace {
  if (!workspace.exportJobs?.some(item => item.status === 'generating')) return workspace;
  const next = cloneWorkspace(workspace);
  next.exportJobs!.forEach(job => {
    if (job.status !== 'generating') return;
    const attempt = job.attempts[job.attempts.length - 1];
    if (job.simulateFailure) {
      job.status = 'failed'; job.error = '文件生成失败，请重试导出；已处理结果保留';
      attempt.finishedAt = now; attempt.error = job.error; return;
    }
    job.progress = Math.min(100, job.progress + (job.sorted ? 20 : 35));
    job.phase = job.progress === 100 ? 'done' : job.sorted && job.progress < 60 ? 'sorting' : 'writing';
    if (job.progress === 100) {
      job.status = 'succeeded'; job.resource = `local-demo://exports/${job.id}.csv`; attempt.finishedAt = now;
    }
  });
  return next;
}
export function exportMembers(job: ExportJob): ResultRecord[] {
  return job.sorted ? [...job.members].sort((a, b) => a.inputOrder - b.inputOrder || a.id.localeCompare(b.id)) : job.members;
}
export function exportCsv(job: ExportJob): string {
  if (job.status !== 'succeeded') throw new Error('文件尚未生成完成');
  const fields = [...new Set(job.members.flatMap(row => Object.keys(row.values)))];
  const cell = (value: string | number) => '"' + String(typeof value === 'string' && /^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
  return '\uFEFF' + [['rowkey', 'batch_id', 'input_order', 'completed_at', ...fields], ...exportMembers(job).map(row => [row.id, row.batchId, row.inputOrder, beijingTime(row.completedAt), ...fields.map(key => row.values[key] ?? '')])].map(row => row.map(cell).join(',')).join('\r\n');
}

/** Record only newly completed synthetic results; never invent legacy completion times. */
export function appendCompletedResults(batch: BatchRow, now = Date.now()) {
  if (!batch.simulation) return;
  const rows = batch.results ??= [];
  const target = Math.max(0, batch.success - (batch.simulation.legacySuccess ?? 0));
  const used = new Set(rows.map(row => row.inputOrder));
  // Reverse each completed chunk so sorting has an observable effect.
  for (let order = target; order >= 1; order--) {
    if (used.has(order)) continue;
    const source = batch.inputResults?.[order - 1];
    rows.push({ id: `${batch.id}:${order}`, batchId: batch.id, inputOrder: order, completedAt: now,
      values: source ? { ...source.values, source_rowkey: source.id } : Object.fromEntries((batch.outputFields?.length ? batch.outputFields : ['tos_path', 'result']).filter(key => !['rowkey', 'batch_id', 'input_order', 'completed_at'].includes(key)).map(key => [key, key === 'tos_path' ? `tos://demo/batch-${batch.id}/${order}.json` : `示例结果 ${order}`])),
    });
  }
}

export function beginBatchFinish(workspace: LocalWorkspace, batchId: number, now = Date.now()) {
  const batch = workspace.batches.find(item => item.id === batchId)!;
  if (batch.finish) return;
  const mode = batch.deliveryMode ?? 'sorted';
  if (mode === 'none' && hasDownstream(workspace, batchId) && workspace.executors.find(e => e.id === batch.executorId)?.runMode !== 'stream') throw new Error('后续批次依赖交付文件，无法结束');
  batch.finish = { mode, requestedAt: now, phase: 'draining', inFlight: batch.status === '运行中' && batch.progress < 100 ? Math.min(Math.max(0, batch.total - Math.max(0, batch.success) - Math.max(0, batch.failed) - Math.max(0, batch.filtered)), Math.max(1, Math.ceil(batch.total / 20))) : 0 };
  batch.status = '收尾中';
}
export function advanceBatchFinish(workspace: LocalWorkspace, batch: BatchRow, now = Date.now()): boolean {
  const finish = batch.finish;
  if (!finish) return false;
  if (finish.phase === 'draining') {
    batch.success = Math.max(0, batch.success) + finish.inFlight; finish.inFlight = 0;
    appendCompletedResults(batch, now);
    batch.nodes.forEach(node => { if (node.status === '处理中') node.status = '已完成'; });
    batch.progress = batch.total > 0 ? Math.min(100, Math.round((batch.success + Math.max(0, batch.failed) + Math.max(0, batch.filtered)) / batch.total * 100)) : 0;
    if (finish.mode === 'none' || !(batch.results?.length)) {
      finish.phase = 'done'; batch.status = '已结束';
      finish.note = finish.mode === 'none' ? '未生成交付文件；处理结果保留，可主动导出' : batch.results === undefined ? '历史结果缺少逐条记录，未生成新文件；原交付文件保留' : '没有可交付的成功结果，未生成文件';
      return true;
    }
    const job = appendExportJob(workspace, { requestId: `finish-${batch.id}-${finish.requestedAt}`, batchId: batch.id, range: { kind: 'all' }, sorted: finish.mode === 'sorted', trigger: 'finish' }, now);
    finish.exportId = job.id; finish.phase = 'exporting'; return false;
  }
  if (finish.phase === 'exporting') {
    const job = workspace.exportJobs?.find(item => item.id === finish.exportId);
    if (job?.status !== 'succeeded') return false;
    finish.phase = 'done'; batch.status = '已导出'; batch.deliveryResource = job.resource;
  }
  return finish.phase === 'done';
}
