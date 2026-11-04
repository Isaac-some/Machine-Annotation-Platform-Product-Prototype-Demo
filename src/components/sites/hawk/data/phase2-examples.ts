import type { LocalWorkspace } from './local-workspace';
import { executorSettings } from './executor-settings';
import { withDeliveryExamples } from './delivery-examples';
import { cloneExecutor, configureExecutor } from './executor-runtime';
/** Opt-in, synthetic fixtures. Existing records are never overwritten. Parameters are scenario inputs, not business defaults. */
export function withPhase2Examples(w: LocalWorkspace): LocalWorkspace {
  let next = withDeliveryExamples(w);
  for (const [id, name, unit] of [['phase2-demo', '流式生产 · 样本与公式预算', 0.8], ['phase2-cost', '预算收尾 · 费用超额说明', 0.12], ['phase2-zero', '零成品 · 样本异常说明', 0.8]] as const) {
    if (next.executors.some(e => e.id === id)) continue;
    next = cloneExecutor(next, 'delivery-demo', { id, name, includeInput: true, includeConfiguration: true });
    next = configureExecutor(next, id, { resource: 'tos://demo/phase2/fixed-input.csv', count: 24, resourceType: 'video', settings: executorSettings(), runMode: 'stream', streamPolicy: { sampleSize: 4, targetUnitCost: unit, maxRetries: 1, reminderRatio: 60 } });
  }
  return next;
}
