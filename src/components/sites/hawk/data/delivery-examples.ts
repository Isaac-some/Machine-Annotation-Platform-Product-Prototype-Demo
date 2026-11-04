import type { LocalWorkspace } from './local-workspace';
import type { BatchRow } from './mock-batches';
import type { PipelineDraft } from './mock-pipelines';
import { cloneWorkspace, type ResultRecord } from './delivery';
import { initializeExecutor, setExecutorInput } from './executor-runtime';

/** Explicit opt-in examples. Never reset existing user work or rewrite legacy rows. */
export function withDeliveryExamples(workspace: LocalWorkspace): LocalWorkspace {
  if (workspace.executors.some(item => item.id === 'delivery-demo') && workspace.batches.some(item => item.id === 5889)) return workspace;
  let next = cloneWorkspace(workspace);
  const sampleResults = (id: number): ResultRecord[] => [3, 1, 2, 6, 4, 5, 9, 7, 8, 12, 10, 11].map((order, index) => ({
    id: `${id}:${order}`, batchId: id, inputOrder: order,
    completedAt: Date.parse(`2026-11-03T${index < 6 ? '09' : '10'}:${String(index % 6 * 5).padStart(2, '0')}:00+08:00`),
    values: { tos_path: `tos://demo/time-export/${order}.json`, result: `合成示例 ${order}` },
  }));
  if (!next.batches.some(item => item.id === 5889)) {
    const batch: BatchRow = { id: 5889, projectId: 234, name: '时间范围导出 · 示例批次', workflow: 'flow.delivery-demo@1', status: '已暂停', total: 24, success: 12, failed: 0, filtered: 0, progress: 50, cost: '¥ 0.00', createdAt: '2026-11-03 08:50:00', updatedAt: '2026-11-03 10:25:00', material: '其他', notice: '不通知', inputResource: 'tos://demo/time-export/input.csv', outputFields: ['tos_path', 'result'], nodes: [{ seq: 1, name: '结果处理', status: '已完成', cost: '¥ 0.00' }], results: sampleResults(5889), simulation: {} };
    next.batches.push(batch);
  }
  if (!next.executors.some(item => item.id === 'delivery-demo')) {
    const flows: PipelineDraft[] = ['A · 数据整理', 'B · 标注处理', 'C · 结果复核'].map((name, index) => ({ id: `delivery-demo-${index}`, name, description: '导出体验合成示例', status: 'published', outputs: ['tos_path', 'result'], version: 1 }));
    next.executors.push({ id: 'delivery-demo', name: '导出体验 · 三环节串联示例', description: '合成数据，演示当前批次收尾与下游接续', projectId: 234, source: 'selection', flowIds: flows.map(item => item.id), flows });
    next = initializeExecutor(next, 'delivery-demo', Object.fromEntries(flows.map(flow => [`annotation-demo.published.${flow.id}.v1`, { nodes: [{ id: 'process', data: { operatorId: 'demo', label: flow.name } }] }])));
    next = setExecutorInput(next, 'delivery-demo', 'tos://demo/time-export/input.csv', 24);
    const executor = next.executors.find(item => item.id === 'delivery-demo')!;
    executor.runtime!.state = 'paused'; executor.runtime!.started = true;
    const first = next.batches.find(item => item.id === executor.runtime!.batchIds[0])!;
    Object.assign(first, { status: '已暂停', success: 12, progress: 50, results: sampleResults(first.id) });
  }
  return next;
}
