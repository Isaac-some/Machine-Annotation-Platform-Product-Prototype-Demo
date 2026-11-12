import type { LocalExecutor } from './local-workspace';
import { observationThreshold, observationStep } from './executor-observation';

export type ProductionObservation = {
  version: 1; configKey: string; roots: number[];
  metrics: Record<number, { costCents: number; finalOutputs: number }>;
  activeMs?: number; updatedAt: number; source: 'local-observation' | 'synthetic-demo';
  segments: { activeMs: number; outputs: number }[];
};
export function productionConfigurationKey(e: LocalExecutor) {
  return JSON.stringify({ flows: e.flows, input: e.input, resourceType: e.resourceType, concurrency: e.concurrency, settings: e.settings, retries: e.streamPolicy?.maxRetries });
}
/** Union of measured processing intervals: concurrent work counts once. */
export function intervalDuration(intervals: [number, number][]) {
  let end = -Infinity, total = 0;
  for (const [a, b] of [...intervals].sort((x, y) => x[0] - y[0])) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < a) return undefined;
    total += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b);
  }
  return total;
}
export function freezeProductionObservation(e: LocalExecutor, force = false) {
  const s = e.stream; if (!s) return;
  const key = productionConfigurationKey(e);
  const state = s.productionSampling;
  if (!state || state.configKey !== key) return;
  const queued = new Set([...s.queues.flat(), ...(s.stageRecovery?.queues.flat() ?? [])].map(t => t.root));
  const roots = Object.keys(s.inputMetrics).map(Number).filter(root => root > state.afterRoot && !queued.has(root)).sort((a,b) => a-b);
  const total = s.source?.totalKnown === false ? 0 : s.source?.initialInputCount ?? e.inputCount ?? 0;
  const threshold = observationThreshold(total), step = observationStep(total);
  if (!force && (roots.length < threshold || Math.floor((roots.length-threshold)/step) <= state.lastStep)) return;
  const selected = roots.slice(-1000), metrics = Object.fromEntries(selected.map(root => [root, { ...s.inputMetrics[root] }]));
  const timed = selected.every(root => s.processingIntervals?.[root]?.length && !s.incompleteTimingRoots?.[root]);
  const intervals = selected.flatMap(root => s.processingIntervals?.[root] ?? []);
  const activeMs = timed ? intervalDuration(intervals) : undefined;
  const size = Math.max(1, Math.ceil(selected.length / 10));
  const segments = Array.from({ length: Math.floor(selected.length / size) }, (_, i) => {
    const group = selected.slice(i * size, (i+1)*size);
    return { activeMs: intervalDuration(group.flatMap(root => s.processingIntervals?.[root] ?? [])) ?? 0, outputs: group.reduce((n, root) => n+metrics[root].finalOutputs, 0) };
  });
  s.productionObservation = { version: 1, configKey: key, roots: selected, metrics, activeMs, updatedAt: Date.now(), source: 'local-observation', segments };
  state.lastStep = Math.floor((roots.length-threshold)/step);
  // Compatibility mirrors are written atomically, never used as a second clock.
  s.estimateRootIds = selected; s.estimateMetrics = metrics; s.estimateConfigKey = key;
  s.estimateAtInputCount = roots.length;
}
export function prepareProductionObservation(e: LocalExecutor) {
  const s = e.stream; if (!s) return;
  const configKey = productionConfigurationKey(e);
  if (s.productionSampling?.configKey === configKey) return;
  s.productionSampling = { configKey, afterRoot: s.admitted, lastStep: -1 };
  s.productionObservation = undefined;
  s.processingIntervals = {}; s.incompleteTimingRoots = {};
}
