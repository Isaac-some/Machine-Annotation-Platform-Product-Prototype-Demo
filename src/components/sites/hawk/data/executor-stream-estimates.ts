import type { LocalExecutor } from './local-workspace';

/** Empirical cohort ranges, not confidence intervals or a production pricing contract. */
export function streamCostEvidence(e: LocalExecutor) {
  const s = e.stream, threshold = 1000;
  const roots = [...new Set(s?.estimateRootIds ?? (s?.settledInputs && s.settledInputs >= threshold ? s.settledRootIds : []))].slice(-threshold);
  const rows = roots.map(root => s?.estimateMetrics ? s.estimateMetrics[root] : s?.inputMetrics?.[root]);
  const missing = rows.some(row => !row || !Number.isFinite(row.costCents) || row.costCents < 0 || !Number.isSafeInteger(row.finalOutputs) || row.finalOutputs < 0);
  const valid = rows.filter((row): row is NonNullable<typeof row> => Boolean(row));
  const cost = valid.reduce((sum, row) => sum + row.costCents, 0);
  const outputs = valid.reduce((sum, row) => sum + row.finalOutputs, 0);
  const groupSize = Math.max(5, Math.ceil(threshold / 10));
  const groups = Array.from({ length: Math.ceil(valid.length / groupSize) }, (_, i) => valid.slice(i * groupSize, (i + 1) * groupSize));
  const emptyGroups = groups.filter(group => group.reduce((sum, row) => sum + row.finalOutputs, 0) === 0).length;
  const units = groups.filter(group => group.length === groupSize).map(group => {
    const n = group.reduce((sum, row) => sum + row.finalOutputs, 0);
    return n ? group.reduce((sum, row) => sum + row.costCents, 0) / n : undefined;
  }).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
  const reason = missing ? '部分输入缺少完整的成本或成品记录' : roots.length < threshold ? `观察到 ${roots.length} / ${threshold} 条已收尾输入` : emptyGroups ? `${emptyGroups} 组尚无成品，暂不外推产量` : units.length < 2 || outputs === 0 || cost <= 0 ? '有效成本与成品样本不足' : undefined;
  const base = outputs > 0 ? cost / outputs : undefined;
  return {
    ready: reason === undefined, reason, samples: roots.length, threshold, groups: groups.length, emptyGroups,
    costCents: cost, outputs, base,
    low: reason === undefined ? Math.min(base!, units[Math.floor((units.length - 1) * .25)]) : undefined,
    high: reason === undefined ? Math.max(base!, units[Math.floor((units.length - 1) * .75)]) : undefined,
    remainingInputs: Math.max(0, (e.inputCount ?? 0) - (s?.admitted ?? 0)),
  };
}

export function estimateStreamPlan(e: LocalExecutor, plan: { budgetYuan: number } | { products: number }) {
  const evidence = streamCostEvidence(e);
  const value = 'budgetYuan' in plan ? plan.budgetYuan : plan.products;
  if (!Number.isFinite(value) || value < 0 || ('products' in plan && !Number.isSafeInteger(value))) return { evidence, reason: '请填写有效的非负数；成品量须为整数' };
  if (!evidence.ready) return { evidence, reason: evidence.reason };
  if ('budgetYuan' in plan) return { evidence, products: { low: Math.floor(plan.budgetYuan * 100 / evidence.high!), base: Math.floor(plan.budgetYuan * 100 / evidence.base!), high: Math.floor(plan.budgetYuan * 100 / evidence.low!) } };
  return { evidence, cost: { low: Math.ceil(plan.products * evidence.low!), base: Math.ceil(plan.products * evidence.base!), high: Math.ceil(plan.products * evidence.high!) } };
}

/** Time forecasts use only completed outputs and measured active processing time. */
export function estimateStreamProductsByTime(e: LocalExecutor, hours: number) {
  const s = e.stream;
  if (!Number.isFinite(hours) || hours < 0) return { reason: '请填写有效的非负运行时长' };
  const roots = [...new Set(s?.settledRootIds ?? [])];
  const metrics = roots.map(root => s?.estimateMetrics?.[root] ?? s?.inputMetrics?.[root]);
  const outputs = metrics.reduce((sum, row) => sum + (row && Number.isSafeInteger(row.finalOutputs) && row.finalOutputs >= 0 ? row.finalOutputs : 0), 0);
  const activeRunMs = s?.activeRunMs;
  if (!Number.isFinite(activeRunMs) || activeRunMs! <= 0 || outputs <= 0) return { reason: '缺少已完成成品或有效处理时长记录' };
  const rate = outputs / (activeRunMs! / 3600000);
  return { products: Math.floor(rate * hours), rate, observedOutputs: outputs, observedHours: activeRunMs! / 3600000 };
}
