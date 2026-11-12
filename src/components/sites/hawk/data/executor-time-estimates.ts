import { productionConfigurationKey } from './executor-production-observation';
import { observationThreshold } from './executor-observation';
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
  const s = e.stream;
  const unavailable = (reason: string): TimeEvidence => ({ ready: false, reason, method: 'overall', observedOutputs: 0, observedHours: 0, completeSegments: 0 });
  const shared = s?.productionObservation;
  if (!shared) return unavailable('等待同一批已处理完的数据及有效计时，成本与时间将同时更新');
  if (shared.configKey !== productionConfigurationKey(e)) return unavailable('工作流配置已变化，等待新配置样本');
  const threshold = observationThreshold(s?.source?.totalKnown === false ? 0 : s?.source?.initialInputCount ?? e.inputCount ?? 0);
  const rows = shared.roots.map(root => shared.metrics[root]);
  if (rows.some(row => !row || !Number.isFinite(row.costCents) || row.costCents < 0 || !Number.isSafeInteger(row.finalOutputs) || row.finalOutputs < 0)) return unavailable('部分输入缺少完整的成本或成品记录');
  if (shared.roots.length < threshold) return unavailable(`同批样本不足（${shared.roots.length} / ${threshold} 条）`);
  if (!Number.isFinite(shared.activeMs) || !shared.activeMs || shared.activeMs < 0) return unavailable('同批样本缺少完整有效计时，暂无法估算');
  const outputs = rows.reduce((n, row) => n + row.finalOutputs, 0);
  if (!outputs || rows.reduce((n,row) => n+row.costCents,0) <= 0) return unavailable('有效成本与最终成品样本不足');
  const rate = outputs * 3600000 / shared.activeMs;
  const segments = shared.segments.filter(validSegment), spread = rates(segments);
  return { ready: true, method: 'overall', source: shared.source, rate,
    slowRate: spread.slowRate === undefined ? undefined : Math.min(rate, spread.slowRate),
    fastRate: spread.fastRate === undefined ? undefined : Math.max(rate, spread.fastRate),
    observedOutputs: outputs, observedHours: shared.activeMs / 3600000,
    completeSegments: segments.length, updatedAt: shared.updatedAt,
    note: '费用、成品和有效处理时间来自同批已处理完的输入；并行处理只计一次。' };
}

export function streamForecastSupply(e: LocalExecutor): { status: 'exhausted' | 'waiting' | 'unverified'; remainingInputs: number; message: string } {
  const s = e.stream, remainingInputs = Math.max(0, (e.inputCount ?? 0) - (s?.admitted ?? 0));
  const queued = Boolean(s?.queues?.some(queue => queue.length) || s?.stageRecovery);
  // Final products may multiply. Raw input counts are never a product cap.
  if (s && (!s.source || s.source.closed) && s.source?.totalKnown !== false && Number.isSafeInteger(e.inputCount) && !remainingInputs && !queued && !s.failures?.length) {
    return { status: 'exhausted', remainingInputs, message: '当前输入已全部处理，输入供给已结束，没有可新增的成品；请补充资源后重新试算。' };
  }
  if (s?.source && !s.source.closed && !remainingInputs && !queued) {
    return { status: 'waiting', remainingInputs, message: `当前没有待处理的新输入；请补充输入${s.failures?.length ? '或重试失败数据' : ''}。产能试算以供数充足为前提。` };
  }
  return { status: 'unverified', remainingInputs, message: '按供数充足、后续资源与当前观测相近估算产能；尚未确认现有输入能否支持该产量。' };
}
export function forecastSupplyWarning(e: LocalExecutor, products: number) {
  return products > 0 ? streamForecastSupply(e).message : undefined;
}
export function estimateStreamTimeByProducts(e: LocalExecutor, products: number): TimeForecast {
  const evidence = streamTimeEvidence(e);
  if (!Number.isSafeInteger(products) || products < 0) return { evidence, reason: '请填写非负整数成品量' };
  if (products === 0) return { evidence, hours: { base: 0, low: 0, high: 0 } };
  if (streamForecastSupply(e).status === 'exhausted') return { evidence, reason: streamForecastSupply(e).message, supplyWarning: forecastSupplyWarning(e, products) };
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
