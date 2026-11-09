import type { BatchRow } from './mock-batches';
export type BatchRetry = { fromNode: number; remaining: number; preparation: number; recovered: number; phase: 'preparing' | 'retrying' | 'done' };
export type AlarmState = { highestSent: number; windowUntil?: number; pending: number; sent: { level: number; at: number }[] };
export const newAlarm = (): AlarmState => ({ highestSent: 0, pending: 0, sent: [] });
export const hasBlockingBatchIssues = (batch?: Pick<BatchRow, 'batchIssues'>) => Boolean(batch?.batchIssues?.some(issue => issue.blocking !== false));
/** Receive already-defined statistics; denominator/exclusions remain a production contract to confirm. */
export function evaluateAlarm(previous: AlarmState, failurePercent: number, eligible: boolean, now: number): AlarmState {
  const s: AlarmState = JSON.parse(JSON.stringify(previous));
  if (s.windowUntil !== undefined && now >= s.windowUntil) {
    if (s.pending > s.highestSent) { s.sent.push({ level: s.pending, at: s.windowUntil }); s.highestSent = s.pending; }
    s.windowUntil = undefined; s.pending = 0;
  }
  const level = [20, 50, 80].filter(t => failurePercent >= t).at(-1) ?? 0;
  if (eligible && level > s.highestSent) { s.pending = Math.max(s.pending, level); s.windowUntil ??= now + 60_000; }
  return s;
}
export function prepareBatchRetry(batch: BatchRow, fromNode: number): BatchRow {
  if (batch.executorId) throw new Error('执行器关联批次请由执行器统一补救');
  if (batch.status !== '已暂停' && batch.status !== '部分失败') throw new Error('请先暂停当前工作流，再准备失败输入');
  if (batch.finish || batch.retryTask && batch.retryTask.phase !== 'done') throw new Error('收尾或重试进行中，不能重复提交');
  if (batch.failed < 1 || !batch.nodes.some(n => n.seq === fromNode)) throw new Error('没有可重试失败记录或起始节点不存在');
  return { ...batch, retryTask: { fromNode, remaining: batch.failed, recovered: 0, preparation: 0, phase: 'preparing' } };
}
/** Only synthetic counts are recovered; successful results and normal filters are never re-run. */
export function tickBatchRetry(batch: BatchRow): void {
  const task = batch.retryTask; if (!task || task.phase === 'done') return;
  if (task.phase === 'preparing') { task.preparation = Math.min(100, task.preparation + 25); if (task.preparation === 100) task.phase = 'retrying'; return; }
  const n = Math.min(task.remaining, Math.max(1, Math.ceil(task.remaining / 2)));
  batch.failed -= n; batch.success += n; task.remaining -= n; task.recovered += n;
  batch.nodes.forEach(node => { if (node.seq >= task.fromNode && node.status !== '已完成') node.status = task.remaining ? '处理中' : '已完成'; });
  if (!task.remaining) { task.phase = 'done'; batch.status = '已暂停'; }
}
