import { observationCheckpoints } from './executor-observation';
import type { LocalExecutor } from './local-workspace';

/** Prototype defaults; empirical spread, never a calibrated prediction interval. */
export const TIME_ESTIMATE_DEFAULTS = { retainedSegments: 10, minimumSegments: 5, lowQuantile: .1, highQuantile: .9 } as const;
export type TimeCheckpoint = { activeMs: number; outputs: number; settledInputs: number };
export type TimeSegment = { activeMs: number; outputs: number };
export type TimeObservation = {
  configKey: string;
  source: 'local-observation' | 'synthetic-demo';
  excludeThroughRoot?: number;
  waitingThroughRoot?: number;
  checkpoint: TimeCheckpoint;
  current: TimeCheckpoint;
  segments: TimeSegment[];
  incompleteReason?: string;
  updatedAt?: number;
};
export type ResourceTimeEvidence = {
  configKey: string;
  source: 'synthetic-demo';
  /** Shares are of expected final products, not raw input counts. */
  classes: { label: string; productShare: number; segments: TimeSegment[] }[];
};
export type TimeEvidence = {
  ready: boolean; reason?: string; note?: string;
  method: 'overall' | 'resource'; source?: TimeObservation['source'];
  rate?: number; fastRate?: number; slowRate?: number;
  observedOutputs: number; observedHours: number; completeSegments: number;
  updatedAt?: number;
};
export type TimeForecast = {
  evidence: TimeEvidence; reason?: string; supplyWarning?: string;
  hours?: { base: number; low?: number; high?: number };
};

export function timeConfigurationKey(e: LocalExecutor) {
  return JSON.stringify({ flows: e.flows ?? [], input: e.input, resourceType: e.resourceType, concurrency: e.concurrency, settings: e.settings, retries: e.streamPolicy?.maxRetries });
}
function checkpoint(e: LocalExecutor): TimeCheckpoint | undefined {
  const s = e.stream;
  if (!s || !Number.isFinite(s.activeRunMs) || s.activeRunMs! < 0) return;
  const rows = Object.values(s.inputMetrics);
  if (rows.some(row => !Number.isSafeInteger(row.finalOutputs) || row.finalOutputs < 0)) return;
  return { activeMs: s.activeRunMs!, outputs: rows.reduce((sum, row) => sum + row.finalOutputs, 0), settledInputs: s.settledInputs };
}
/** Called before work: legacy runs start a new measured window, never reconstruct history. */
export function prepareTimeObservation(e: LocalExecutor) {
  const s = e.stream, current = checkpoint(e);
  if (!s || !current) return;
  const key = timeConfigurationKey(e);
  const oldInFlight = [...s.queues.flat(), ...(s.stageRecovery?.queues.flat() ?? [])];
  if (s.timeObservation?.configKey === key) {
    const observation = s.timeObservation;
    if (observation.waitingThroughRoot === undefined && observation.excludeThroughRoot !== undefined && oldInFlight.some(task => task.root <= observation.excludeThroughRoot!)) {
      observation.waitingThroughRoot = observation.excludeThroughRoot;
      observation.segments = [];
    }
    return;
  }
  s.timeObservation = { configKey: key, source: 'local-observation', excludeThroughRoot: s.admitted, waitingThroughRoot: oldInFlight.length ? s.admitted : undefined, checkpoint: current, current, segments: [] };
  // Resource profiles are tied to the exact configuration that produced them.
  if (s.resourceTimeEvidence?.configKey !== key) s.resourceTimeEvidence = undefined;
}
/** Called after work: both counters are frozen at the same boundary. Zero-output work stays. */
export function recordTimeObservation(e: LocalExecutor) {
  const s = e.stream, observation = s?.timeObservation, current = checkpoint(e);
  if (!s || !observation || !current || observation.configKey !== timeConfigurationKey(e)) return;
  if (observation.waitingThroughRoot !== undefined) {
    const oldTasks = [...s.queues.flat(), ...(s.stageRecovery?.queues.flat() ?? [])];
    if (oldTasks.some(task => task.root <= observation.waitingThroughRoot!)) return;
    observation.waitingThroughRoot = undefined;
    observation.checkpoint = current;
    observation.current = current;
    return;
  }
  if (current.activeMs < observation.current.activeMs || current.outputs < observation.current.outputs || current.activeMs === observation.current.activeMs && current.outputs > observation.current.outputs) {
    // A later valid clock must never legitimize outputs whose processing time was absent.
    observation.checkpoint = current;
    observation.current = current;
    observation.segments = [];
    observation.incompleteReason = '部分观测缺少有效计时或计数发生回退，等待新观测';
    return;
  }
  if (current.activeMs > observation.current.activeMs) { observation.updatedAt = Date.now(); observation.incompleteReason = undefined; }
  observation.current = current;
  const elapsed = current.activeMs - observation.checkpoint.activeMs;
  if (elapsed > 0 && observationCheckpoints(s.source?.initialInputCount ?? e.inputCount ?? 0).some(n => n > observation.checkpoint.settledInputs && n <= current.settledInputs)) {
    observation.segments.push({ activeMs: elapsed, outputs: current.outputs - observation.checkpoint.outputs });
    observation.segments = observation.segments.slice(-TIME_ESTIMATE_DEFAULTS.retainedSegments);
    observation.checkpoint = current;
  }
}
function validSegment(segment: TimeSegment) {
  return Number.isFinite(segment.activeMs) && segment.activeMs > 0 && Number.isSafeInteger(segment.outputs) && segment.outputs >= 0;
}
function quantile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b), index = (sorted.length - 1) * fraction;
  const left = Math.floor(index), right = Math.ceil(index);
  return sorted[left] + (sorted[right] - sorted[left]) * (index - left);
}
function rates(segments: TimeSegment[]) {
  const outputs = segments.reduce((sum, segment) => sum + segment.outputs, 0);
  const activeMs = segments.reduce((sum, segment) => sum + segment.activeMs, 0);
  const rate = outputs * 3600000 / activeMs;
  if (segments.length < TIME_ESTIMATE_DEFAULTS.minimumSegments) return { rate, outputs, activeMs };
  const speeds = segments.map(segment => segment.outputs * 3600000 / segment.activeMs);
  return { rate, outputs, activeMs, slowRate: Math.min(rate, quantile(speeds, TIME_ESTIMATE_DEFAULTS.lowQuantile)), fastRate: Math.max(rate, quantile(speeds, TIME_ESTIMATE_DEFAULTS.highQuantile)) };
}
export function streamTimeEvidence(e: LocalExecutor): TimeEvidence {
  const s = e.stream, observation = s?.timeObservation;
  const unavailable = (reason: string): TimeEvidence => ({ ready: false, reason, method: 'overall', observedOutputs: 0, observedHours: 0, completeSegments: 0 });
  if (!observation) return unavailable('缺少同一观测时间段的成品与有效处理时长记录，等待新观测');
  if (observation.configKey !== timeConfigurationKey(e)) return unavailable('工作流或运行配置已变化，等待新配置样本');
  if (observation.waitingThroughRoot !== undefined) return unavailable('配置已变更，等待旧配置在途任务及重试收尾后重新采样');
  const segments = observation.segments.slice(-TIME_ESTIMATE_DEFAULTS.retainedSegments);
  const partial = { activeMs: observation.current.activeMs - observation.checkpoint.activeMs, outputs: observation.current.outputs - observation.checkpoint.outputs };
  if (segments.some(segment => !validSegment(segment)) || !Number.isFinite(partial.activeMs) || partial.activeMs < 0 || !Number.isSafeInteger(partial.outputs) || partial.outputs < 0 || partial.activeMs === 0 && partial.outputs > 0) return unavailable('部分观测缺少完整计时或成品记录');
  const all = partial.activeMs > 0 ? [...segments, partial] : segments;
  if (!all.length) return unavailable(observation.incompleteReason ?? '尚无有效处理时长记录');
  const total = rates(all);
  if (total.outputs === 0) return unavailable('当前观测尚无最终成品，暂无法估算完成所需时间');
  const spread = rates(segments);
  const evidence: TimeEvidence = {
    ready: true, method: 'overall', source: observation.source, rate: total.rate,
    updatedAt: observation.updatedAt,
    observedOutputs: total.outputs, observedHours: total.activeMs / 3600000, completeSegments: segments.length,
    slowRate: spread.slowRate === undefined ? undefined : Math.min(total.rate, spread.slowRate),
    fastRate: spread.fastRate === undefined ? undefined : Math.max(total.rate, spread.fastRate),
    note: '未使用资源特征；假设后续资源与近期观测相近。',
  };
  const profile = s?.resourceTimeEvidence;
  if (!profile) return evidence;
  const classes = profile.classes.filter(item => item.productShare > 0);
  const usable = profile.configKey === timeConfigurationKey(e) && classes.length > 0 && profile.classes.every(item => Number.isFinite(item.productShare) && item.productShare >= 0) && classes.every(item => item.segments.length > 0 && item.segments.every(validSegment));
  if (!usable) return { ...evidence, note: '资源特征或对应实测速度不完整，已退回整批运行观测。' };
  const share = classes.reduce((sum, item) => sum + item.productShare, 0);
  const groups = classes.map(item => ({ weight: item.productShare / share, segments: item.segments.slice(-TIME_ESTIMATE_DEFAULTS.retainedSegments), ...rates(item.segments.slice(-TIME_ESTIMATE_DEFAULTS.retainedSegments)) }));
  if (groups.some(group => group.rate <= 0)) return { ...evidence, note: '部分资源类型尚无成品，已退回整批运行观测。' };
  const weightedRate = (key: 'rate' | 'fastRate' | 'slowRate') => {
    if (groups.some(group => group[key] === undefined)) return undefined;
    if (groups.some(group => group[key] === 0)) return 0;
    return 1 / groups.reduce((sum, group) => sum + group.weight / group[key]!, 0);
  };
  const observedOutputs = groups.reduce((sum, group) => sum + group.outputs, 0);
  const observedHours = groups.reduce((sum, group) => sum + group.activeMs, 0) / 3600000;
  return { ...evidence, method: 'resource', source: profile.source, rate: weightedRate('rate'), slowRate: weightedRate('slowRate'), fastRate: weightedRate('fastRate'), observedOutputs, observedHours, completeSegments: Math.min(...groups.map(group => group.segments.length)), note: `按目标成品构成加权：${classes.map(item => `${item.label} ${Math.round(item.productShare / share * 100)}%`).join('、')}。资源类型速度来自各自独立的整批观测，并非节点耗时相加。` };
}
export function forecastSupplyWarning(e: LocalExecutor, products: number) {
  const s = e.stream;
  if (products <= 0 || !s) return undefined;
  // An open source can receive more data; only a closed (or legacy fixed) source proves exhaustion.
  if ((!s.source || s.source.closed) && Number.isSafeInteger(e.inputCount) && e.inputCount! <= s.admitted && !s.queues.some(queue => queue.length) && !s.failures.length && !s.stageRecovery) return '当前输入已全部处理，已知没有可继续产出的资源；此目标无法由当前输入支持。';
  return '剩余输入能否支持目标尚未确认；此时间估算不保证资源足量。';
}
export function estimateStreamTimeByProducts(e: LocalExecutor, products: number): TimeForecast {
  const evidence = streamTimeEvidence(e);
  if (!Number.isSafeInteger(products) || products < 0) return { evidence, reason: '请填写非负整数成品量' };
  if (products === 0) return { evidence, hours: { base: 0, low: 0, high: 0 } };
  if (!evidence.ready) return { evidence, reason: evidence.reason, supplyWarning: forecastSupplyWarning(e, products) };
  return { evidence, supplyWarning: forecastSupplyWarning(e, products), hours: { base: products / evidence.rate!, low: evidence.fastRate ? products / evidence.fastRate : undefined, high: evidence.slowRate ? products / evidence.slowRate : undefined } };
}
export function estimateStreamTimeAddition(e: LocalExecutor, products: number, extra: number) {
  const current = estimateStreamTimeByProducts(e, products);
  const combined = estimateStreamTimeByProducts(e, products + extra);
  if (!Number.isSafeInteger(products) || products < 0 || !Number.isSafeInteger(extra) || extra < 0 || !Number.isSafeInteger(products + extra)) return { current, combined, reason: '请填写有效的当前方案及追加成品量' };
  const incremental = current.hours && combined.hours ? {
    base: combined.hours.base - current.hours.base,
    low: combined.hours.low === undefined || current.hours.low === undefined ? undefined : combined.hours.low - current.hours.low,
    high: combined.hours.high === undefined || current.hours.high === undefined ? undefined : combined.hours.high - current.hours.high,
  } : undefined;
  return { current, combined, incremental };
}
