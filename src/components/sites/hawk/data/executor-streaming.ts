import type { LocalExecutor, LocalWorkspace } from './local-workspace';
import { cloneWorkspace } from './delivery';
import type { RunTimeTrace } from './executor-run-time';

export type StreamPolicy = {
  targetOutputMode?: 'count' | 'percent';
  costLimitCents?: number;
  costLimitAction?: 'drain' | 'continue';
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
  /** Optional authoritative trace. The tick simulator never invents processing durations. */
  timeTrace?: RunTimeTrace;
  /** Measured browser execution intervals. Absent on legacy runs; never backfilled from tick counts. */
  activeRunMs?: number;
  stageActiveMs?: number[];
  clockBoundaryAt?: number;
  stageClockBoundaryAt?: number[];
  stopReason?: 'input' | 'time' | 'target';
  stageRecovery?: {
    stage: number; preparation?: number; queues: StreamToken[][];
    phase: StreamRun['phase']; control: StreamRun['control'];
    manualAdmission?: boolean; pausedStages?: number[]; returnPaused: boolean;
  };
  phase: 'production' | 'draining' | 'review' | 'completed';
  control: 'automatic' | 'manual'; admitted: number; settledInputs: number; queues: StreamToken[][]; failures: StreamToken[];
  stages: StreamStage[]; costCents: number; costLimitCents?: number; triggerCostCents?: number; triggerCostAction?: 'drain' | 'continue'; drainFinalCents?: number; predicted?: number;
  inputMetrics: Record<number, { costCents: number; finalOutputs: number }>; settledRootIds: number[];
  reminded: boolean; retryRound: number; reason?: string; preparation?: number; recoveryRuns: number;
  events: { at: number; text: string }[]; pausedStages?: number[]; manualAdmission?: boolean;
  costPrompts?: { id: string; text: string; sampled: boolean; notificationLevel?: number }[]; demoOutcome?: 'normal' | 'zero';
};
export function effectiveTargetOutputCount(policy: StreamPolicy, inputCount: number) {
  return policy.targetOutputPercent === undefined ? policy.targetOutputCount : Math.ceil(inputCount * policy.targetOutputPercent / 100);
}
const batchesFor = (w: LocalWorkspace, e: LocalExecutor) => (e.runtime?.batchIds ?? []).map(id => w.batches.find(b => b.id === id)!);
const notificationLevel = (e: LocalExecutor, kind: 'reminder' | 'stop') => Math.max(e.notification?.baseline ?? 1, e.notification?.[kind] ?? (kind === 'reminder' ? 1 : 2));
const costPrompt = (s: StreamRun, text: string, level: number) => { const id = `cost-${(s.costPrompts?.length ?? 0) + 1}`; s.costPrompts ??= []; s.costPrompts.push({ id, text, sampled: s.costPrompts.length % 2 === 0, notificationLevel: level }); };
const event = (s: StreamRun, text: string) => { s.events.unshift({ at: Date.now(), text }); };
export function validateStreamPolicy(policy: StreamPolicy, count: number) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('请先配置正整数输入数量');
  if (policy.costLimitCents !== undefined && (!Number.isSafeInteger(policy.costLimitCents) || policy.costLimitCents <= 0)) throw new Error('总成本上限须为大于 0 的金额，或留空');
  if (policy.costLimitAction !== undefined && !['drain', 'continue'].includes(policy.costLimitAction)) throw new Error('请选择触碰成本上限后的处理方式');
  for (const [key, label] of [['inputLimit', '输入条数上限'], ['runtimeLimitMs', '运行时长上限'], ['targetOutputCount', '目标成品量']] as const) {
    const value = policy[key];
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) throw new Error(`${label}须为正整数，或留空`);
  }
  if (policy.targetOutputPercent !== undefined && (!Number.isFinite(policy.targetOutputPercent) || policy.targetOutputPercent <= 0 || policy.targetOutputPercent > 100)) throw new Error('目标成品比例须大于 0 且不超过 100%，或留空');
  if (policy.targetOutputPercent !== undefined && policy.targetOutputCount !== undefined) throw new Error('目标成品量只能设置数量或比例其中一种');
  if (!Number.isSafeInteger(policy.maxRetries) || policy.maxRetries < 0) throw new Error('请填写有限的非负整数重试次数，0 表示不自动重试');
  if (policy.reminderRatio !== undefined && (!Number.isFinite(policy.reminderRatio) || policy.reminderRatio <= 0 || policy.reminderRatio >= 100)) throw new Error('提前提醒比例须大于 0 且小于 100%，也可留空');
  if (policy.observationSize !== undefined && (!Number.isSafeInteger(policy.observationSize) || policy.observationSize < 100 || policy.observationSize > 1000)) throw new Error('观察批量须为 100 至 1000 条之间的整数');
}
export function newStreamRun(stages: number, costLimitCents?: number): StreamRun {
  return { activeRunMs: 0, stageActiveMs: Array(stages).fill(0), phase: 'production', control: 'automatic', admitted: 0, settledInputs: 0, queues: Array.from({ length: stages }, () => []), failures: [], stages: Array.from({ length: stages }, () => ({ processed: 0, failed: 0, outputs: 0, costCents: 0 })), costCents: 0, inputMetrics: {}, settledRootIds: [], costLimitCents, reminded: false, retryRound: 0, recoveryRuns: 0, events: [] };
}
export function startStream(w: LocalWorkspace, id: string): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!;
  if (!e?.runtime || !e.streamPolicy || e.runtime.started) throw new Error('请先配置流式策略，已启动的执行器不能重新开始');
  validateStreamPolicy(e.streamPolicy, e.inputCount ?? 0);
  if (!e.input || !e.runtime.batchIds.length) throw new Error('请先配置输入与已发布工作流');
  e.stream = newStreamRun(e.runtime.batchIds.length, e.streamPolicy.costLimitCents); if (id === 'phase2-zero') e.stream.demoOutcome = 'zero'; e.stream.clockBoundaryAt = Date.now(); e.runtime.started = true; e.runtime.state = 'running';
  event(e.stream, '开始连续生产；成本上限为可选项，预测将随演示观测数据更新');
  return next;
}
export function setStreamCostLimit(w: LocalWorkspace, id: string, cents?: number): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!, s = e?.stream;
  if (!s || !e.streamPolicy || ['draining', 'completed'].includes(s.phase)) throw new Error('当前状态不能调整成本上限');
  if (cents !== undefined && (!Number.isSafeInteger(cents) || cents <= s.costCents)) throw new Error('成本上限须高于当前累计费用');
  s.costLimitCents = cents; e.streamPolicy.costLimitCents = cents;
  event(s, cents === undefined ? '已取消总成本上限；连续处理剩余输入' : `总成本上限调整为 ¥${(cents / 100).toFixed(2)}`);
  return next;
}

export type StreamLimits = Pick<StreamPolicy, 'costLimitCents' | 'inputLimit' | 'runtimeLimitMs'>;
export function setStreamLimits(w: LocalWorkspace, id: string, limits: StreamLimits): LocalWorkspace {
  const next = setStreamCostLimit(w, id, limits.costLimitCents), e = next.executors.find(x => x.id === id)!, s = e.stream!;
  const policy = { ...e.streamPolicy!, costLimitCents: limits.costLimitCents, inputLimit: limits.inputLimit, runtimeLimitMs: limits.runtimeLimitMs };
  validateStreamPolicy(policy, e.inputCount!);
  if (limits.inputLimit !== undefined && limits.inputLimit <= s.admitted) throw new Error('输入条数上限须高于已取入条数，或留空取消');
  if (limits.runtimeLimitMs !== undefined && s.activeRunMs === undefined) throw new Error('此历史演示缺少完整计时记录，请克隆后设置运行时长上限');
  if (limits.runtimeLimitMs !== undefined && limits.runtimeLimitMs <= (s.activeRunMs ?? 0)) throw new Error('运行时长上限须高于已累计运行时长，或留空取消');
  e.streamPolicy = policy; s.stopReason = undefined;
  event(s, '运行上限已更新；如已停止，需手动继续运行');
  return next;
}
/** Contract only: upstream estimates supplemental inputs; this prototype never calculates or submits them. */
export function buildUpstreamInputRequest(e: LocalExecutor) {
  const targetOutputCount = e.streamPolicy && effectiveTargetOutputCount(e.streamPolicy, e.inputCount ?? 0);
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
function runLimitReason(e: LocalExecutor): StreamRun['stopReason'] | undefined {
  const p = e.streamPolicy!, s = e.stream!;
  if (p.inputLimit !== undefined && s.admitted >= p.inputLimit) return 'input';
  if (p.runtimeLimitMs !== undefined && (s.activeRunMs ?? 0) >= p.runtimeLimitMs) return 'time';
  const targetOutputCount = effectiveTargetOutputCount(p, e.inputCount ?? 0);
  if (targetOutputCount !== undefined && (s.stages.at(-1)?.outputs ?? 0) >= targetOutputCount) return 'target';
}
function enforceRunLimits(e: LocalExecutor) {
  const s = e.stream!, reason = runLimitReason(e);
  const targetDraining = s.phase === 'draining' && s.stopReason === 'target';
  if (!reason || s.phase !== 'production' && !targetDraining || s.stageRecovery || s.control !== 'automatic' && !s.manualAdmission) return;
  if (targetDraining && reason === 'target') return;
  s.stopReason = reason; s.phase = 'draining';
  s.reason = reason === 'target'
    ? '达到目标成品量：停止新增输入，在途任务继续收尾；失败数据仍按配置次数自动重试'
    : `${reason === 'input' ? '达到输入条数上限' : '达到累计运行时长上限'}：停止新增输入及自动重试，在途任务继续收尾`;
  event(s, s.reason);
}
function canAutomaticallyRetry(e: LocalExecutor) {
  const s = e.stream!, p = e.streamPolicy!, reason = runLimitReason(e);
  if (s.control !== 'automatic' || !s.failures.length || s.retryRound >= p.maxRetries) return false;
  if (((p.costLimitAction ?? 'drain') !== 'continue' && s.costLimitCents !== undefined && s.costCents >= s.costLimitCents) || reason === 'input' || reason === 'time') return false;
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
  if (e.streamPolicy?.runtimeLimitMs !== undefined && (s.activeRunMs ?? 0) >= e.streamPolicy.runtimeLimitMs) throw new Error('请先在投入与产量试算中提高或取消运行时长上限，再重试');
  if ((e.streamPolicy?.costLimitAction ?? 'drain') !== 'continue' && s.costLimitCents !== undefined && s.costCents >= s.costLimitCents) throw new Error('请先在费用详情中提高或取消成本上限，再重试');
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
    const stage = s.stages[i]; b.total = i === 0 ? e.inputCount! : s.admitted === e.inputCount && ['review', 'completed'].includes(s.phase) ? stage.processed : -1;
    b.success = new Set((b.results ?? []).map(r => r.values.source_key)).size; b.failed = stage.failed; b.cost = `¥ ${(stage.costCents / 100).toFixed(2)}`;
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
  s.inputMetrics ??= {}; s.settledRootIds ??= [];
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
        b.results ??= []; if (!b.results.some(x => x.id === result.id)) b.results.push(result);
        stage.outputs += 1;
        if (i === s.queues.length - 1) metric.finalOutputs += 1;
        if (i + 1 < s.queues.length) s.queues[i + 1].push({ key, root: token.root, stage: i + 1, attempt: 0 });
      }
    }
    if (s.costLimitCents && s.costCents >= s.costLimitCents && s.triggerCostCents === undefined) {
      const action = p.costLimitAction ?? 'drain';
      s.triggerCostCents = s.costCents; s.triggerCostAction = action;
      const message = action === 'drain'
        ? '达到成本上限：已停止新增取入与新增自动重试，已取入数据继续收尾'
        : '达到成本上限：按配置提醒并继续生产及有限自动重试';
      if (s.phase === 'production') s.reason = message;
      if (action === 'drain' && s.phase === 'production') s.phase = 'draining';
      event(s, message); costPrompt(s, message, notificationLevel(e, 'stop'));
    }
  }
  if (s.costLimitCents && p.reminderRatio !== undefined && !s.reminded && s.costCents >= s.costLimitCents * p.reminderRatio / 100) { s.reminded = true; costPrompt(s, '成本上限提前提醒', notificationLevel(e, 'reminder')); event(s, `费用达到上限 ${p.reminderRatio}% 的提前提醒；继续运行`); }
  enforceRunLimits(e);
  const limit = e.inputCount!;
  if (s.phase === 'production' && (s.control === 'automatic' || s.manualAdmission) && !s.pausedStages?.some(i => i === 0 || s.queues[i].length > 0) && s.admitted < limit) {
    s.admitted += 1; s.queues[0].push({ key: String(s.admitted), root: s.admitted, stage: 0, attempt: 0 });
  }
  enforceRunLimits(e);
  const queuedRoots = new Set([...s.queues.flat(), ...(s.stageRecovery?.queues.flat() ?? [])].map(t => t.root));
  s.settledRootIds = Object.keys(s.inputMetrics).map(Number).filter(root => !queuedRoots.has(root)).sort((a, b) => a - b);
  const terminal = s.settledRootIds.length;
  const observationSize = p.observationSize ?? 100;
  if (terminal >= observationSize && Math.floor(terminal / observationSize) > Math.floor(s.settledInputs / observationSize)) {
    const before = Math.floor(s.settledInputs / observationSize), after = Math.floor(terminal / observationSize);
    for (let i = before; i < after; i++) event(s, `已完成 ${Math.min(terminal, (i + 1) * observationSize)} 条模拟生产输入；更新成品转化与成本估算`);
  }
  s.settledInputs = terminal;
  const settledOutputs = s.settledRootIds.reduce((sum, root) => sum + (s.inputMetrics[root]?.finalOutputs ?? 0), 0);
  if (terminal > 0 && settledOutputs > 0) s.predicted = Math.round(settledOutputs / terminal * e.inputCount!);
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
      s.reason = s.stopReason === 'target' && (s.costLimitCents === undefined || s.costCents < s.costLimitCents)
        ? `目标成品量已达到，已取入数据及有限自动重试已处理结束${s.failures.length ? '；仍有失败数据，可人工补救' : ''}`
        : '已取入数据收尾完成；检查运行结果后可调整运行上限并人工继续';
      event(s, `收尾结束，累计费用 ¥${(s.costCents / 100).toFixed(2)}`);
    } else if (s.phase === 'production' && s.admitted === e.inputCount) {
      s.phase = s.failures.length ? 'review' : 'completed'; e.runtime!.state = s.failures.length ? 'waiting' : 'completed';
      const targetOutputCount = effectiveTargetOutputCount(p, e.inputCount ?? 0);
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
 const next = cloneWorkspace(w), e = next.executors.find(e => e.id === id)!, s = e?.stream;
 if (!s || s.phase !== 'review' || s.admitted >= (e.inputCount ?? 0)) throw new Error('当前没有可继续的剩余输入');
 if (runLimitReason(e)) throw new Error('请先在投入与产量试算中提高或取消已达到的运行上限；目标成品量已达到时无需继续取入');
 if ((e.streamPolicy?.costLimitAction ?? 'drain') !== 'continue' && s.costLimitCents !== undefined && s.costLimitCents <= s.costCents) throw new Error('请先在成本计算器中提高或取消成本上限');
 s.control = 'automatic'; s.phase = 'production'; s.manualAdmission = true; s.triggerCostCents = undefined; s.drainFinalCents = undefined;
 s.reason = '人工决定继续本流水线；下游结果不会自动返回，累计费用继续计算'; e.runtime!.state = 'running'; s.clockBoundaryAt = Date.now(); event(s, s.reason); return next;
}
