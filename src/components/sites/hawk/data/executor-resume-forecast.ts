import type { LocalExecutor } from './local-workspace';
import { streamCostEvidence } from './executor-stream-estimates';
import { streamTimeEvidence } from './executor-time-estimates';
export function resumeProductionForecast(e: LocalExecutor) {
  const s = e.stream, p = e.streamPolicy;
  if (!s || !p) return { reason: '尚无生产观测，运行后才能估算。' };
  const cost = streamCostEvidence(e), time = streamTimeEvidence(e), obs = s.productionObservation;
  const plans: { label: string; base: number; low?: number; high?: number }[] = [], missing: string[] = [];
  if (p.costLimitCents !== undefined) {
    const budget = Math.max(0, p.costLimitCents-s.costCents);
    if (cost.ready) plans.push({ label: '剩余成本额度', base: Math.floor(budget/cost.base!), low: cost.high ? Math.floor(budget/cost.high) : undefined, high: cost.low ? Math.floor(budget/cost.low) : undefined });
    else missing.push('成本观测不足');
  }
  if (p.runtimeLimitMs !== undefined) {
    const hours = Math.max(0, p.runtimeLimitMs-(s.activeRunMs ?? 0))/3600000;
    if (time.ready) plans.push({ label: '剩余处理时长', base: Math.floor(hours*time.rate!), low: time.slowRate === undefined ? undefined : Math.floor(hours*time.slowRate), high: time.fastRate === undefined ? undefined : Math.floor(hours*time.fastRate) });
    else missing.push('时间观测不足');
  }
  if (p.inputLimit !== undefined) {
    const inputs = Math.max(0, p.inputLimit-s.admitted);
    if (cost.ready && obs?.roots.length) plans.push({ label: '剩余取入额度', base: Math.floor(inputs*cost.outputs/obs.roots.length) });
    else missing.push('输入转成品比例不足');
  }
  if (p.targetOutputCount !== undefined) {
    const target = Math.max(0,p.targetOutputCount-(s.stages.at(-1)?.outputs ?? 0));
    if (!cost.ready) missing.push('共同生产观测不足');
    plans.push({ label: '剩余成品目标', base: target, low: target, high: target });
  }
  if (missing.length) return { plans, reason: `${missing.join('、')}，暂无法综合估算；不影响实际限制已解除后的继续操作。` };
  if (!plans.length) return { plans, reason: '未设置运行限制，暂无法估算本轮产出范围。' };
  const hasObservedRange = plans.some(x=>x.label !== '剩余成品目标' && x.low !== undefined && x.high !== undefined);
  return { plans, base: Math.min(...plans.map(x=>x.base)), low: hasObservedRange && plans.every(x=>x.low !== undefined) ? Math.min(...plans.map(x=>x.low!)) : undefined, high: hasObservedRange && plans.every(x=>x.high !== undefined) ? Math.min(...plans.map(x=>x.high!)) : undefined };
}
