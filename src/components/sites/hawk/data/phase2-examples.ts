import type { LocalWorkspace } from './local-workspace';
import { executorSettings } from './executor-settings';
import { withDeliveryExamples } from './delivery-examples';
import { cloneExecutor, configureExecutor } from './executor-runtime';
import { startStream, tickStream } from './executor-streaming';
/** Opt-in, synthetic fixtures. Existing records are never overwritten. Parameters are scenario inputs, not business defaults. */
export function withPhase2Examples(w: LocalWorkspace): LocalWorkspace {
  let next = withDeliveryExamples(w);
  for (const [id, name, policy] of [
    ['phase2-1555', '运行上限与计时 · 可启动验收执行器', { maxRetries: 0, observationSize: 100 }],
    ['phase2-1441', '录屏迭代验收 · 可启动的三环节执行器', { maxRetries: 0, observationSize: 100 }],
    ['phase2-demo', '流式生产 · 实绩成本估算', { maxRetries: 1, observationSize: 100 }],
    ['phase2-cost', '成本上限 · 收尾与人工继续', { costLimitCents: 432, maxRetries: 1, reminderRatio: 60, observationSize: 100 }],
    ['phase2-zero', '零成品 · 成本不可计算', { maxRetries: 0, observationSize: 100 }],
  ] as const) {
    if (next.executors.some(e => e.id === id)) continue;
    next = cloneExecutor(next, 'delivery-demo', { id, name, includeInput: true, includeConfiguration: true });
    next = configureExecutor(next, id, { resource: ['phase2-1441', 'phase2-1555'].includes(id) ? 'tos://demo/acceptance/240-videos.csv' : 'tos://demo/production/inputs.csv', count: ['phase2-1441', 'phase2-1555'].includes(id) ? 240 : 24, resourceType: 'video', settings: executorSettings(), runMode: 'stream', streamPolicy: policy });
    if (id === 'phase2-zero') next.executors.find(e => e.id === id)!.streamPolicy!.costLimitCents = undefined;
  }
  if (!next.executors.some(e => e.id === 'phase2-acceptance')) {
    next = cloneExecutor(next, 'delivery-demo', { id: 'phase2-acceptance', name: '验收演示 · 可启动的三环节流式执行器', includeInput: true, includeConfiguration: true });
    next = configureExecutor(next, 'phase2-acceptance', { resource: 'tos://demo/acceptance/240-videos.csv', count: 240, resourceType: 'video', settings: executorSettings(), runMode: 'stream', streamPolicy: { maxRetries: 0, observationSize: 100 } });
  }
  if (!next.executors.some(e => e.id === 'phase2-live')) {
    next = cloneExecutor(next, 'delivery-demo', { id: 'phase2-live', name: '流式生产 · 实绩与成本估算', includeInput: true, includeConfiguration: true });
    next = configureExecutor(next, 'phase2-live', { resource: 'tos://demo/production/10k-videos.csv', count: 10000, resourceType: 'video', settings: executorSettings(), runMode: 'stream', streamPolicy: { costLimitCents: 80000, unitCostMin: 0.2, unitCostMax: 0.4, maxRetries: 1, observationSize: 100 } });
    next = startStream(next, 'phase2-live');
    for (let i = 0; i < 130; i++) next = tickStream(next, 'phase2-live');
    // Pre-seeded progress has no measured browser intervals.
    const seeded = next.executors.find(e => e.id === 'phase2-live')!.stream!;
    seeded.activeRunMs = undefined; seeded.stageActiveMs = undefined;
  }
  return next;
}
