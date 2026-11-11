import { observationCheckpoints, observationStep as percentStep, validateDemoCount } from './executor-observation';
import type { LocalExecutor, LocalWorkspace } from './local-workspace';
import { cloneWorkspace } from './delivery';
import type { RunTimeTrace } from './executor-run-time';
import { prepareTimeObservation, recordTimeObservation, type TimeObservation, type ResourceTimeEvidence } from './executor-time-estimates';

export type StreamPolicy = {
  targetOutputMode?: 'count' | 'percent';
  costLimitCents?: number;
  costLimitAction?: 'drain' | 'continue';
  idleTimeoutMs?: number;
  inputLimit?: number;
  runtimeLimitMs?: number;
  targetOutputCount?: number;
  targetOutputPercent?: number;
  unitCostMin?: number;
  unitCostMax?: number;
  maxRetries: number;
  reminderRatio?: number;
  observationSize?: number;
  sampleSize?: number;
  targetUnitCost?: number;
};
export type StreamToken = { key: string; root: number; stage: number; attempt: number };
export type StreamStage = { processed: number; failed: number; outputs: number; costCents: number };
export type StreamRun = {
  timeObservation?: TimeObservation;
  resourceTimeEvidence?: ResourceTimeEvidence;
  /** Optional authoritative trace. The tick simulator never invents processing durations. */
  timeTrace?: RunTimeTrace;
  /** Measured browser execution intervals. Absent on legacy runs; never backfilled from tick counts. */
  activeRunMs?: number;
  stageActiveMs?: number[];
  clockBoundaryAt?: number;
  stageClockBoundaryAt?: number[];
  source?: { lastActivityAt: number; closed: boolean; waiting: boolean; initialInputCount: number; totalKnown?: boolean; readingTicks?: number; rowKeyValid?: boolean; error?: string };
  stopReason?: 'cost' | 'input' | 'time' | 'target' | 'idle' | 'source-error';
  stageRecovery?: {
    stage: number; preparation?: number; queues: StreamToken[][];
    phase: StreamRun['phase']; control: StreamRun['control'];
    manualAdmission?: boolean; pausedStages?: number[]; returnPaused: boolean;
  };
  phase: 'production' | 'draining' | 'review' | 'completed';
  control: 'automatic' | 'manual'; admitted: number; settledInputs: number; queues: StreamToken[][]; failures: StreamToken[];
  estimateRootIds?: number[]; estimateMetrics?: Record<number, { costCents: number; finalOutputs: number }>; estimateAtInputCount?: number;
  estimateConfigKey?: string; estimateWindowStartCount?: number; estimateWindowStartRunMs?: number; estimateWindowActiveRunMs?: number;
  estimateWindowStartRoot?: number; estimateWindowReady?: boolean;
  estimateWindowRootIds?: number[]; estimateWindowMetrics?: Record<number, { costCents: number; finalOutputs: number }>;
  timeEstimateRootIds?: number[]; timeEstimateMetrics?: Record<number, { finalOutputs: number }>;
  stages: StreamStage[]; costCents: number; costLimitCents?: number; triggerCostCents?: number; triggerCostAction?: 'drain' | 'continue'; drainFinalCents?: number; predicted?: number;
  inputMetrics: Record<number, { costCents: number; finalOutputs: number }>; settledRootIds: number[];
  reminded: boolean; retryRound: number; reason?: string; preparation?: number; recoveryRuns: number;
  events: { at: number; text: string }[]; pausedStages?: number[]; manualAdmission?: boolean;
  costPrompts?: { id: string; text: string; sampled: boolean; notificationLevel?: number }[]; demoOutcome?: 'normal' | 'zero';
};
export function effectiveTargetOutputCount(policy: StreamPolicy, inputCount: number) {
  return policy.targetOutputPercent === undefined ? policy.targetOutputCount : Math.ceil(inputCount * policy.targetOutputPercent / 100);
}
export function estimateRefreshCheckpoints(previous: number, current: number, total: number) {
  return observationCheckpoints(total).filter(value => value > previous && value <= current);
}
const batchesFor = (w: LocalWorkspace, e: LocalExecutor) => (e.runtime?.batchIds ?? []).map(id => w.batches.find(b => b.id === id)!);
const notificationLevel = (e: LocalExecutor, kind: 'reminder' | 'stop') => Math.max(e.notification?.baseline ?? 1, e.notification?.[kind] ?? (kind === 'reminder' ? 1 : 2));
const costPrompt = (s: StreamRun, text: string, level: number) => { const id = `cost-${(s.costPrompts?.length ?? 0) + 1}`; s.costPrompts ??= []; s.costPrompts.push({ id, text, sampled: s.costPrompts.length % 2 === 0, notificationLevel: level }); };
const event = (s: StreamRun, text: string) => { s.events.unshift({ at: Date.now(), text }); s.events = s.events.slice(0, 100); };
export function validateStreamPolicy(policy: StreamPolicy, count: number) {
  validateDemoCount(count);
  if (policy.costLimitCents !== undefined && (!Number.isSafeInteger(policy.costLimitCents) || policy.costLimitCents <= 0)) throw new Error('总成本上限须为大于 0 的金额，或留空');
  if (policy.costLimitAction !== undefined && !['drain', 'continue'].includes(policy.costLimitAction)) throw new Error('请选择触碰成本上限后的处理方式');
  for (const [key, label] of [['idleTimeoutMs', '无输入源活动等待时长'], ['inputLimit', '输入条数上限'], ['runtimeLimitMs', '运行时长上限'], ['targetOutputCount', '目标成品量']] as const) {
    const value = policy[key];
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) throw new Error(`${label}须为正整数，或留空`);
  }
  if (policy.targetOutputPercent !== undefined && (!Number.isFinite(policy.targetOutputPercent) || policy.targetOutputPercent <= 0 || policy.targetOutputPercent > 100)) throw new Error('目标成品比例须大于 0 且不超过 100%，或留空');
  if (policy.targetOutputPercent !== undefined && policy.targetOutputCount !== undefined) throw new Error('目标成品量只能设置数量或比例其中一种');
  if (!Number.isSafeInteger(policy.maxRetries) || policy.maxRetries < 0) throw new Error('请填写有限的非负整数重试次数，0 表示不自动重试');
  if (policy.reminderRatio !== undefined && (!Number.isFinite(policy.reminderRatio) || policy.reminderRatio <= 0 || policy.reminderRatio >= 100)) throw new Error('提前提醒比例须大于 0 且小于 100%，也可留空');
  if (policy.observationSize !== undefined && (!Number.isSafeInteger(policy.observationSize) || policy.observationSize < 100 || policy.observationSize > 1000 || policy.observationSize % 100 !== 0)) throw new Error('估算刷新步长须为 100 至 1,000 条之间的百数整数');
}
export function newStreamRun(stages: number, costLimitCents?: number): StreamRun {
  return { activeRunMs: 0, stageActiveMs: Array(stages).fill(0), phase: 'production', control: 'automatic', admitted: 0, settledInputs: 0, queues: Array.from({ length: stages }, () => []), failures: [], stages: Array.from({ length: stages }, () => ({ processed: 0, failed: 0, outputs: 0, costCents: 0 })), costCents: 0, inputMetrics: {}, settledRootIds: [], costLimitCents, reminded: false, retryRound: 0, recoveryRuns: 0, events: [] };
}
export function estimateConfigurationKey(e: LocalExecutor) {
  return JSON.stringify(e.flows ?? []);
}
export function startStream(w: LocalWorkspace, id: string): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!;
  if (!e?.runtime || !e.streamPolicy || e.runtime.started) throw new Error('请先配置流式策略，已启动的执行器不能重新开始');
  validateStreamPolicy(e.streamPolicy, e.inputCount ?? 0);
  if (!e.input || !e.runtime.batchIds.length) throw new Error('请先配置输入与已发布工作流');
  e.stream = newStreamRun(e.runtime.batchIds.length, e.streamPolicy.costLimitCents); if (id === 'phase2-zero') e.stream.demoOutcome = 'zero'; e.stream.clockBoundaryAt = Date.now(); e.runtime.started = true; e.runtime.state = 'running';
  e.stream.source = { lastActivityAt: Date.now(), closed: false, waiting: false, initialInputCount: e.inputCount!, totalKnown: !/\.csv(?:$|[?#])/i.test(e.input ?? ''), readingTicks: 0, rowKeyValid: !/missing-rowkey/i.test(e.input ?? '') };
  e.streamPolicy.costLimitAction = 'drain';
  prepareTimeObservation(e);
  event(e.stream, '开始连续生产；成本上限为可选项，预测将随演示观测数据更新');
  sync(next, e); return next;
}
export type StreamLimits = Pick<StreamPolicy, 'costLimitCents' | 'inputLimit' | 'runtimeLimitMs' | 'idleTimeoutMs'>;
export function setStreamCostLimit(w: LocalWorkspace, id: string, cents?: number): LocalWorkspace {
  const e = w.executors.find(x => x.id === id);
  return setStreamLimits(w, id, { ...e?.streamPolicy, costLimitCents: cents });
}
export function setStreamLimits(w: LocalWorkspace, id: string, limits: StreamLimits): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!, s = e?.stream;
  if (!s || !e.streamPolicy || s.phase === 'completed') throw new Error('当前状态不能调整运行限制');
  const policy = { ...e.streamPolicy, ...limits, costLimitCents: limits.costLimitCents, inputLimit: limits.inputLimit, runtimeLimitMs: limits.runtimeLimitMs, costLimitAction: 'drain' as const };
  validateStreamPolicy(policy, e.inputCount!);
  // Unchanged limits may already be reached; editing another field must remain possible.
  if (limits.costLimitCents !== e.streamPolicy.costLimitCents && limits.costLimitCents !== undefined && limits.costLimitCents <= s.costCents) throw new Error('成本上限须高于当前累计费用，或留空取消');
  if (limits.inputLimit !== e.streamPolicy.inputLimit && limits.inputLimit !== undefined && limits.inputLimit <= s.admitted) throw new Error('输入条数上限须高于已取入条数，或留空取消');
  if (limits.runtimeLimitMs !== e.streamPolicy.runtimeLimitMs && limits.runtimeLimitMs !== undefined && (s.activeRunMs === undefined || limits.runtimeLimitMs <= s.activeRunMs)) throw new Error('运行时长上限须高于已累计运行时长，且计时记录完整；或留空取消');
  if (s.costLimitCents !== policy.costLimitCents) { s.triggerCostCents = undefined; s.drainFinalCents = undefined; s.reminded = false; }
  e.streamPolicy = policy; s.costLimitCents = policy.costLimitCents;
  // Do not clear a latched stop or restart intake when saving configuration.
  event(s, '运行限制已保存；已停止取数时仍须在主界面手动继续');
  return next;
}
export type StreamSourceEvent = { kind: 'data'; count: number } | { kind: 'message' | 'heartbeat' | 'progress' | 'end' | 'recovered' } | { kind: 'error'; message: string };
export function recordStreamSourceEvent(w: LocalWorkspace, id: string, signal: StreamSourceEvent, now = Date.now()): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!, s = e?.stream;
  if (!s || !s.source || s.phase === 'completed') throw new Error('当前执行器未开启持续供数');
  if (!Number.isFinite(now) || now < s.source.lastActivityAt) throw new Error('输入源事件时间无效');
  if (s.source.closed) throw new Error('输入源已明确供数结束');
  if (signal.kind === 'data') {
    validateDemoCount((e.inputCount ?? 0) + signal.count);
    if (!Number.isSafeInteger(signal.count) || signal.count < 1 || !Number.isSafeInteger((e.inputCount ?? 0) + signal.count)) throw new Error('新增数据量须为正整数');
    e.inputCount = (e.inputCount ?? 0) + signal.count;
  }
  s.source.lastActivityAt = now; s.source.waiting = false;
  if (signal.kind === 'end') s.source.closed = true;
  if (signal.kind === 'recovered' || signal.kind === 'data') s.source.error = undefined;
  if (signal.kind === 'error') {
    s.source.error = signal.message || '输入源检查失败';
    s.stopReason = 'source-error'; s.phase = e.runtime?.state === 'running' ? 'draining' : 'review';
    s.reason = `输入源检查失败：${s.source.error}；停止取数，在途任务继续收尾`;
  }
  event(s, signal.kind === 'data' ? `输入源新增 ${signal.count} 条可用数据` : signal.kind === 'error' ? s.reason! : `输入源事件：${({ message: '消息', heartbeat: '心跳', progress: '传输进度', end: '明确供数结束', recovered: '检查恢复成功' })[signal.kind]}`);
  sync(next, e); return next;
}
export function streamRunBlockReason(e: LocalExecutor): string | undefined {
  const s = e.stream, p = e.streamPolicy;
  if (!s || !p) return '执行器尚未启动';
  const reason = runLimitReason(e);
  if (reason) return `请先在“输入及执行器配置”中提高或取消已达到的${({ cost: '成本上限', input: '输入条数上限', time: '运行时长上限', target: '目标成品量' })[reason]}`;
  if (s.source?.error) return `输入源检查失败：${s.source.error}；请先恢复输入源`;
}
export function resumeStream(w: LocalWorkspace, id: string, now = Date.now()): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!, s = e?.stream;
  if (!s || !e.runtime || !(['paused', 'waiting'].includes(e.runtime.state)) || s.phase === 'completed' || s.phase === 'draining') throw new Error('请等待收尾完成，再继续运行');
  const blocked = streamRunBlockReason(e); if (blocked) throw new Error(blocked);
  s.stopReason = undefined; s.control = 'automatic'; s.phase = 'production'; s.manualAdmission = true;
  s.triggerCostCents = undefined; s.drainFinalCents = undefined;
  if (s.source) { s.source.lastActivityAt = now; s.source.waiting = false; }
  s.clockBoundaryAt = now; s.reason = '已人工继续生产，累计费用、取入量和处理时长保留';
  e.runtime.state = 'running'; event(s, s.reason); sync(next, e); return next;
}
/** Contract only: upstream estimates supplemental inputs; this prototype never calculates or submits them. */
export function buildUpstreamInputRequest(e: LocalExecutor) {
  const targetOutputCount = e.streamPolicy && effectiveTargetOutputCount(e.streamPolicy, e.stream?.source?.initialInputCount ?? e.inputCount ?? 0);
  if (!targetOutputCount) return undefined;
  return {
    schemaVersion: 1, executorId: e.id, targetOutputCount,
    deliveredOutputCount: e.stream?.stages.at(-1)?.outputs ?? 0,
    observation: { settledInputCount: e.stream?.settledInputs ?? 0, settledOutputCount: e.stream?.settledRootIds.reduce((sum, root) => sum + (e.stream?.inputMetrics[root]?.finalOutputs ?? 0), 0) ?? 0, completedAutomaticRetryRounds: e.stream?.retryRound ?? 0, manualRecoveryRuns: e.stream?.recoveryRuns ?? 0 },
    retryPolicy: { maxRetries: e.streamPolicy!.maxRetries, scope: 'failed-stage-then-downstream' as const, manualRetryRequiresUserAction: true },
    estimateStatus: 'awaiting-upstream' as const,
  };
}
function runnableStages(s: StreamRun) {
  return s.queues.map((q, i) => q.length > 0 && !s.pausedStages?.includes(i) && !(i + 1 < s.queues.length && s.pausedStages?.includes(i + 1) && s.queues[i + 1].length > 0));
}
function runLimitReason(e: LocalExecutor): 'cost' | 'input' | 'time' | 'target' | undefined {
  const p = e.streamPolicy!, s = e.stream!;
  if (s.costLimitCents !== undefined && s.costCents >= s.costLimitCents) return 'cost';
  if (p.inputLimit !== undefined && s.admitted >= p.inputLimit) return 'input';
  if (p.runtimeLimitMs !== undefined && (s.activeRunMs ?? 0) >= p.runtimeLimitMs) return 'time';
  const targetOutputCount = effectiveTargetOutputCount(p, s.source?.initialInputCount ?? e.inputCount ?? 0);
  if (targetOutputCount !== undefined && (s.stages.at(-1)?.outputs ?? 0) >= targetOutputCount) return 'target';
}
function enforceRunLimits(e: LocalExecutor) {
  const s = e.stream!, reason = runLimitReason(e);
  const targetDraining = s.phase === 'draining' && s.stopReason === 'target';
  if (!reason || s.phase !== 'production' && !targetDraining || s.control !== 'automatic' && !s.manualAdmission && !s.stageRecovery) return;
  if (targetDraining && reason === 'target') return;
  s.stopReason = reason; s.phase = 'draining';
  s.reason = reason === 'target'
    ? '达到目标成品量：停止新增输入，在途任务继续收尾；失败数据仍按配置次数自动重试'
    : `${reason === 'cost' ? '达到成本上限' : reason === 'input' ? '达到输入条数上限' : '达到累计运行时长上限'}：停止新增输入及自动重试，在途任务继续收尾`;
  event(s, s.reason);
}
function canAutomaticallyRetry(e: LocalExecutor) {
  const s = e.stream!, p = e.streamPolicy!, reason = runLimitReason(e);
  if (s.control !== 'automatic' || !s.failures.length || s.retryRound >= p.maxRetries) return false;
  if ((s.costLimitCents !== undefined && s.costCents >= s.costLimitCents) || reason === 'input' || reason === 'time') return false;
  if (s.stopReason === 'idle' || s.stopReason === 'source-error') return false;
  // A goal stops admission only; retry rounds may finish the admitted subset.
  return s.phase === 'production' && s.admitted === e.inputCount
    || s.phase === 'draining' && s.stopReason === 'target' && reason === 'target';
}

export function takeOverStream(w: LocalWorkspace, id: string): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!; const s = e?.stream;
  if (!s || ['completed', 'draining'].includes(s.phase)) throw new Error('当前状态不能人工接管');
  s.control = 'manual'; s.manualAdmission = false; s.phase = 'draining'; s.reason = '人工接管：停止新增取入与自动重试，已取入数据完成后等待人工决定';
  e.runtime!.state = 'running'; s.clockBoundaryAt = Date.now(); event(s, s.reason); return next;
}
export function prepareStreamRecovery(w: LocalWorkspace, id: string): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!; const s = e?.stream;
  if (!s || s.control !== 'manual' || s.phase !== 'review' || s.preparation !== undefined || !s.failures.length) throw new Error('请先人工接管，等待收尾后选择失败数据补救');
  const blocked = streamRunBlockReason(e); if (blocked) throw new Error(blocked);
  s.preparation = 0; s.reason = '正在扫描并准备失败输入；rowkey 标记不能替代完整输入'; e.runtime!.state = 'running'; event(s, '人工确认本次失败类补救，可能产生额外费用'); return next;
}
export function retryStreamStage(w: LocalWorkspace, id: string, stageIndex: number): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!, s = e?.stream;
  if (!s || !Number.isSafeInteger(stageIndex) || stageIndex < 0 || stageIndex >= s.stages.length) throw new Error('该生产环节不存在');
  if (s.stageRecovery || s.preparation !== undefined) throw new Error('已有失败数据正在重试，请等待本轮结束');
  const failed = s.failures.filter(token => token.stage === stageIndex);
  if (!failed.length) throw new Error('该环节没有失败数据');
  if (e.runtime?.state !== 'paused' && !['review', 'completed'].includes(s.phase)) throw new Error('请先暂停执行器，再重试该批次失败数据');
  if (s.phase === 'draining') throw new Error('请等待已取入数据收尾完成，再重试');
  const blocked = streamRunBlockReason(e); if (blocked) throw new Error(blocked);
  s.stageRecovery = { stage: stageIndex, preparation: 0, queues: s.queues, phase: s.phase, control: s.control, manualAdmission: s.manualAdmission, pausedStages: s.pausedStages, returnPaused: e.runtime?.state === 'paused' };
  s.queues = s.queues.map(() => []);
  failed.forEach(token => s.queues[stageIndex].push({ ...token, attempt: token.attempt + 1 }));
  s.failures = s.failures.filter(token => token.stage !== stageIndex);
  s.stages[stageIndex].failed -= failed.length;
  s.phase = 'production'; s.control = 'manual'; s.manualAdmission = false; s.pausedStages = [];
  s.reason = `正在准备第 ${stageIndex + 1} 环节的 ${failed.length} 条失败输入；仅重试失败环节，成功后继续下游，原有队列已保留`;
  e.runtime!.state = 'running'; s.clockBoundaryAt = Date.now(); event(s, s.reason); sync(next, e);
  return next;
}

function queued(s: StreamRun) { return s.queues.some(q => q.length > 0); }
function sync(w: LocalWorkspace, e: LocalExecutor) {
  const s = e.stream!, batches = batchesFor(w, e);
  batches.forEach((b, i) => {
    const stage = s.stages[i]; b.total = i === 0 ? s.source?.totalKnown === false ? -1 : e.inputCount! : s.admitted === e.inputCount && ['review', 'completed'].includes(s.phase) ? stage.processed : -1;
    b.success = Math.max(0, stage.processed - stage.failed); b.failed = stage.failed; b.cost = `¥ ${(stage.costCents / 100).toFixed(2)}`;
    // The simulator knows the failed stage and row, but has no operator trace.
    b.failureDetails = s.failures.filter(token => token.stage === i).map(token => ({
      nodeSeq: -1, rowkey: token.key, errorCode: 'DEMO_PROCESSING_FAILURE',
      message: '合成处理失败；可从本环节重试，未提供真实算子定位。',
    }));
    b.progress = b.total > 0 ? Math.min(100, Math.round(stage.processed / b.total * 100)) : 0;
    b.status = e.runtime!.state === 'paused' || s.pausedStages?.includes(i) ? '已暂停' : s.phase === 'draining' ? '收尾中' : s.phase === 'review' ? '已暂停' : s.phase === 'completed' ? '已完成' : '运行中';
    b.inputResource = i ? `CID://stream/${e.id}/${batches[i - 1].id}` : e.input ?? '';
    b.nodes.forEach(node => { node.status = s.queues[i].length ? '处理中' : stage.processed ? '已完成' : '待处理'; if (b.status === '已暂停' && node.status !== '已完成') node.status = '已暂停'; node.cost = b.cost; });
  });
}
/** Synthetic local costs/outcomes only. Every admitted input runs without a sample gate. */
export function tickStream(w: LocalWorkspace, id: string, observedProcessingMs = 0, observedAt?: number): LocalWorkspace {
  const original = w.executors.find(x => x.id === id);
  if (!original?.stream || original.runtime?.state !== 'running') return w;
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!, s = e.stream!, p = e.streamPolicy!, bs = batchesFor(next, e);
  const now = observedAt ?? Date.now();
  s.inputMetrics ??= {}; s.settledRootIds ??= [];
  prepareTimeObservation(e);
  const configKey = estimateConfigurationKey(e);
  if (s.estimateConfigKey !== configKey) {
    s.estimateConfigKey = configKey;
    s.estimateWindowStartCount = s.settledInputs;
    s.estimateWindowStartRunMs = s.activeRunMs ?? 0;
    s.estimateWindowStartRoot = s.admitted;
    s.estimateWindowReady = false;
    s.estimateWindowRootIds = [];
    s.estimateWindowMetrics = {};
    s.timeEstimateRootIds = [];
    s.timeEstimateMetrics = {};
    s.estimateAtInputCount = undefined;
    event(s, '工作流配置已变化；按新配置重新收集估算样本');
  }
  if (s.source?.totalKnown === false && !s.source.error) {
    s.source.readingTicks = (s.source.readingTicks ?? 0) + 1;
    if (s.source.readingTicks < 2) { s.reason = '正在读取 CSV 并校验 RowKey；总量待确认'; sync(next, e); return next; }
    if (s.source.rowKeyValid === false) {
      s.source.error = 'CSV 缺少 RowKey，请修正输入后重试'; s.stopReason = 'source-error'; s.phase = 'review'; e.runtime!.state = 'waiting';
      s.reason = s.source.error; sync(next, e); return next;
    }
    s.source.totalKnown = true; s.reason = 'CSV 已读取并通过 RowKey 校验';
  }
  if (s.stageRecovery?.preparation !== undefined) {
    s.stageRecovery.preparation = Math.min(100, s.stageRecovery.preparation + 25);
    if (s.stageRecovery.preparation === 100) {
      s.stageRecovery.preparation = undefined; s.recoveryRuns += 1;
      s.reason = '失败输入准备完成，正在重试并处理下游；原有正常任务保持暂停';
    }
    sync(next, e); return next;
  }
  if (s.preparation !== undefined) {
    s.preparation = Math.min(100, s.preparation + 25);
    if (s.preparation === 100) {
      s.failures.forEach(t => { s.queues[t.stage].push({ ...t, attempt: t.attempt + 1 }); s.stages[t.stage].failed -= 1; });
      s.failures = []; s.preparation = undefined; s.phase = 'production'; s.recoveryRuns += 1;
      s.reason = '人工补救进行中；不新增原始输入，费用与产物仍归本执行器'; event(s, s.reason);
    }
    sync(next, e); return next;
  }
  const runnable = runnableStages(s);
  // The driver supplies measured, uninterrupted intervals. Queued/paused stages never accrue time.
  if (s.activeRunMs !== undefined && Number.isFinite(observedProcessingMs) && observedProcessingMs > 0) {
    const measured = observedAt === undefined ? observedProcessingMs : Math.max(0, Math.min(observedProcessingMs, observedAt - (s.clockBoundaryAt ?? -Infinity)));
    const spans = runnable.map((active, i) => active ? (observedAt === undefined ? measured : Math.max(0, Math.min(measured, observedAt - (s.stageClockBoundaryAt?.[i] ?? -Infinity)))) : 0);
    s.activeRunMs += Math.max(0, ...spans);
    s.stageActiveMs ??= Array(s.stages.length).fill(0);
    spans.forEach((span, i) => { s.stageActiveMs![i] += span; });
  }
  enforceRunLimits(e);
  if (s.source && !s.source.closed && s.phase === 'production' && !s.stageRecovery && s.admitted >= (e.inputCount ?? 0) && now - s.source.lastActivityAt >= (p.idleTimeoutMs ?? 600000)) {
    s.stopReason = 'idle'; s.phase = 'draining';
    s.reason = `输入源连续 ${(p.idleTimeoutMs ?? 600000) / 60000} 分钟无活动，已停止取数，在途任务继续收尾`;
    event(s, s.reason);
  }
  for (let i = s.queues.length - 1; i >= 0; i--) {
    if (s.pausedStages?.includes(i) || i + 1 < s.queues.length && s.pausedStages?.includes(i + 1) && s.queues[i + 1].length > 0) continue;
    const token = s.queues[i].shift(); if (!token) continue;
    const price = [5, 10, 7][i % 3], stage = s.stages[i];
    if (token.attempt === 0) stage.processed += 1; stage.costCents += price; s.costCents += price;
    const metric = s.inputMetrics[token.root] ??= { costCents: 0, finalOutputs: 0 }; metric.costCents += price;
    const failed = token.attempt === 0 && (s.demoOutcome === 'zero' && i === s.queues.length - 1 || i === 0 && token.root % 5 === 0 || i === 1 && token.root % 7 === 0);
    if (failed) { stage.failed += 1; s.failures.push(token); }
    else {
      const multiplicity = i === 0 && token.root % 2 === 1 ? 2 : 1;
      for (let j = 0; j < multiplicity; j++) {
        const key = `${token.key}.${j}`, b = bs[i];
        const result = { id: `${b.id}:${key}`, batchId: b.id, inputOrder: token.root, completedAt: Date.now(), values: { tos_path: `tos://demo/phase2/${e.id}/${key}.json`, result: `合成产物 ${key}`, source_key: token.key } };
        // Token keys are unique per stage; retries only reprocess tokens that failed before producing a result.
        b.results ??= []; b.results.push(result);
        stage.outputs += 1;
        if (i === s.queues.length - 1) metric.finalOutputs += 1;
        if (i + 1 < s.queues.length) s.queues[i + 1].push({ key, root: token.root, stage: i + 1, attempt: 0 });
      }
    }
    if (s.costLimitCents && s.costCents >= s.costLimitCents && s.triggerCostCents === undefined) {
      s.triggerCostCents = s.costCents; s.triggerCostAction = 'drain';
      const message = '达到成本上限：已停止新增取入与新增自动重试，已取入数据继续收尾';
      s.reason = message;
      if (s.phase === 'production') { s.phase = 'draining'; s.stopReason = 'cost'; }
      event(s, message); costPrompt(s, message, notificationLevel(e, 'stop'));
    }
  }
  if (s.costLimitCents && p.reminderRatio !== undefined && !s.reminded && s.costCents >= s.costLimitCents * p.reminderRatio / 100) { s.reminded = true; costPrompt(s, '成本上限提前提醒', notificationLevel(e, 'reminder')); event(s, `费用达到上限 ${p.reminderRatio}% 的提前提醒；继续运行`); }
  enforceRunLimits(e);
  const limit = e.inputCount!;
  if (s.phase === 'production' && (s.control === 'automatic' || s.manualAdmission) && !s.pausedStages?.some(i => i === 0 || s.queues[i].length > 0) && s.admitted < limit) {
    if (s.source) { s.source.lastActivityAt = now; s.source.waiting = false; }
    s.admitted += 1; s.queues[0].push({ key: String(s.admitted), root: s.admitted, stage: 0, attempt: 0 });
  }
  enforceRunLimits(e);
  const queuedRoots = new Set([...s.queues.flat(), ...(s.stageRecovery?.queues.flat() ?? [])].map(t => t.root));
  const terminal = Object.keys(s.inputMetrics).length - [...queuedRoots].filter(root => s.inputMetrics[root] !== undefined).length;
  if (!s.estimateWindowReady && ![...queuedRoots].some(root => root <= (s.estimateWindowStartRoot ?? 0))) {
    s.estimateWindowReady = true;
    s.estimateWindowStartCount = terminal;
    s.estimateWindowStartRunMs = s.activeRunMs ?? 0;
  }
  const observationTotal = s.source?.initialInputCount ?? e.inputCount ?? 0;
  const observationStep = percentStep(observationTotal);
  const windowStartCount = s.estimateWindowStartCount ?? terminal;
  const costCheckpoints = estimateRefreshCheckpoints(s.settledInputs, terminal, observationTotal);
  const completedWindowCount = terminal - windowStartCount;
  const timeCheckpoints = s.estimateWindowReady && completedWindowCount >= observationStep ? Math.floor(completedWindowCount / observationStep) : 0;
  for (const checkpoint of costCheckpoints) event(s, `已完成 ${checkpoint} 条模拟生产输入；更新成品转化与成本估算`);
  if (timeCheckpoints) event(s, `新配置下已完成 ${timeCheckpoints * observationStep} 条模拟生产输入；更新时长产量估算`);
  s.settledInputs = terminal;
  if (timeCheckpoints) {
    const settledRoots = Object.keys(s.inputMetrics).map(Number).filter(root => !queuedRoots.has(root)).sort((a, b) => a - b);
    const previouslyObserved = new Set(s.estimateWindowRootIds ?? []);
    const newRoots = settledRoots.filter(root => root > (s.estimateWindowStartRoot ?? 0) && !previouslyObserved.has(root)).slice(-timeCheckpoints * observationStep);
    const metricEntries = newRoots.flatMap(root => {
      const metric = s.inputMetrics[root]; return metric ? [[root, { costCents: metric.costCents, finalOutputs: metric.finalOutputs }] as const] : [];
    });
    s.estimateWindowRootIds = newRoots;
    s.estimateWindowMetrics = Object.fromEntries(metricEntries);
    s.estimateWindowActiveRunMs = Math.max(0, (s.activeRunMs ?? 0) - (s.estimateWindowStartRunMs ?? 0));
    s.estimateWindowStartCount = windowStartCount + timeCheckpoints * observationStep;
    s.estimateWindowStartRunMs = s.activeRunMs ?? 0;
    s.timeEstimateRootIds = newRoots;
    s.timeEstimateMetrics = Object.fromEntries(newRoots.flatMap(root => {
      const metric = s.estimateWindowMetrics?.[root]; return metric ? [[root, { finalOutputs: metric.finalOutputs }] as const] : [];
    }));
  }
  if (costCheckpoints.length) {
    s.settledRootIds = Object.keys(s.inputMetrics).map(Number).filter(root => !queuedRoots.has(root)).sort((a, b) => a - b);
    const settledOutputs = s.settledRootIds.reduce((sum, root) => sum + (s.inputMetrics[root]?.finalOutputs ?? 0), 0);
    s.estimateAtInputCount = costCheckpoints.at(-1);
    s.estimateRootIds = s.settledRootIds.slice(-1000);
    s.estimateMetrics = Object.fromEntries(s.estimateRootIds.flatMap(root => {
      const metric = s.inputMetrics[root]; return metric ? [[root, { costCents: metric.costCents, finalOutputs: metric.finalOutputs }] as const] : [];
    }));
    if (terminal > 0 && settledOutputs > 0) s.predicted = Math.round(settledOutputs / terminal * e.inputCount!);
  }
  recordTimeObservation(e);
  if (!queued(s)) {
    if (s.stageRecovery) {
      const saved = s.stageRecovery;
      s.queues = saved.queues; s.phase = saved.returnPaused ? saved.phase : 'review';
      s.control = saved.control; s.manualAdmission = saved.manualAdmission; s.pausedStages = saved.pausedStages;
      e.runtime!.state = saved.returnPaused ? 'paused' : 'waiting'; s.stageRecovery = undefined;
      s.reason = saved.returnPaused ? '本轮重试及下游处理结束；原有队列与进度已保留，点击继续运行恢复生产' : '本轮重试及下游处理结束，可查看结果';
      event(s, s.reason);
    } else if (canAutomaticallyRetry(e)) {
      s.retryRound += 1; s.failures.forEach(t => { s.queues[t.stage].push({ ...t, attempt: t.attempt + 1 }); s.stages[t.stage].failed -= 1; }); s.failures = [];
      const retryReason = `已取入数据本轮处理结束，启动第 ${s.retryRound} 轮有限自动重试`;
      if (s.stopReason === 'target') s.reason = `目标成品量已达到，不新增输入；${retryReason}`;
      event(s, retryReason);
    } else if (s.phase === 'draining' || s.control === 'manual') {
      if (s.triggerCostAction === 'drain' && s.drainFinalCents === undefined) s.drainFinalCents = s.costCents;
      s.manualAdmission = false; s.phase = 'review'; e.runtime!.state = 'waiting';
      s.reason = s.stopReason === 'idle' ? '输入源无活动超时，取数已暂停；源活动恢复后仍须在主界面手动继续' : s.stopReason === 'source-error' ? `输入源检查失败：${s.source?.error ?? '检查不可用'}；取数已暂停` : s.stopReason === 'target' && (s.costLimitCents === undefined || s.costCents < s.costLimitCents)
        ? `目标成品量已达到，已取入数据及有限自动重试已处理结束${s.failures.length ? '；仍有失败数据，可人工补救' : ''}`
        : '已取入数据收尾完成；检查运行结果后可调整运行上限并人工继续';
      event(s, `收尾结束，累计费用 ¥${(s.costCents / 100).toFixed(2)}`);
    } else if (s.phase === 'production' && s.admitted === e.inputCount && s.source && !s.source.closed) {
      s.source.waiting = true; s.reason = '当前可用数据已处理，等待输入源新数据或活动；尚未收到供数结束消息';
    } else if (s.phase === 'production' && s.admitted === e.inputCount) {
      s.phase = s.source?.closed ? 'completed' : s.failures.length ? 'review' : 'completed'; e.runtime!.state = s.phase === 'completed' ? 'completed' : 'waiting';
      const targetOutputCount = effectiveTargetOutputCount(p, s.source?.initialInputCount ?? e.inputCount ?? 0);
      s.reason = targetOutputCount && (s.stages.at(-1)?.outputs ?? 0) < targetOutputCount ? '本轮已有输入已处理结束，尚未达到目标成品量；查看结果后可自行决定是否重试失败数据' : s.failures.length ? '有限重试已结束，仍有失败数据，可人工接管原位补救' : '本次输入已处理完成'; event(s, s.reason);
    }
  }
  sync(next, e); return next;
}

export function toggleStreamStage(w: LocalWorkspace, id: string, stage: number): LocalWorkspace {
 const next = cloneWorkspace(w), e = next.executors.find(e => e.id === id)!, s = e?.stream;
 if (!s || s.stageRecovery || e.runtime?.state !== 'running' || !s.queues[stage]) throw new Error('当前状态不能调整环节');
 s.stageClockBoundaryAt ??= Array(s.stages.length).fill(0); s.stageClockBoundaryAt[stage] = Date.now();
 const paused = s.pausedStages ?? []; s.pausedStages = paused.includes(stage) ? paused.filter(i => i !== stage) : [...paused, stage];
 event(s, `${s.pausedStages.includes(stage) ? '暂停' : '恢复'}第 ${stage + 1} 环节；整体控制与费用规则仍有效`); sync(next, e); return next;
}
export function continueStreamManually(w: LocalWorkspace, id: string): LocalWorkspace {
  return resumeStream(w, id);
}

/** Explicit deep action; never resumes production or invents unsettled evidence. */
export function refreshStreamEstimate(w: LocalWorkspace, id: string): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(e => e.id === id), s = e?.stream;
  if (!e || !s) throw new Error('请先运行，获得实际观测');
  const queued = new Set([...s.queues.flat(), ...(s.stageRecovery?.queues.flat() ?? [])].map(t => t.root));
  const roots = Object.keys(s.inputMetrics).map(Number).filter(root => !queued.has(root));
  s.estimateRootIds = roots.slice(-1000); s.estimateConfigKey = estimateConfigurationKey(e);
  s.estimateMetrics = Object.fromEntries(s.estimateRootIds.map(root => [root, { ...s.inputMetrics[root] }]));
  s.estimateAtInputCount = roots.length;
  event(s, '手动刷新估算；样本不足时仍显示不足，不改变生产状态');
  return next;
}
