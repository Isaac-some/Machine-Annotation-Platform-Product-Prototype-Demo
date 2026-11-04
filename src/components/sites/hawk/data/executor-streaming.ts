import type { LocalExecutor, LocalWorkspace } from './local-workspace';
import { cloneWorkspace } from './delivery';

export type StreamPolicy = { sampleSize: number; targetUnitCost: number; maxRetries: number; reminderRatio?: number };
export type StreamToken = { key: string; root: number; stage: number; attempt: number };
export type StreamStage = { processed: number; failed: number; outputs: number; costCents: number };
export type StreamRun = {
  phase: 'sample' | 'budget' | 'production' | 'draining' | 'review' | 'completed';
  control: 'automatic' | 'manual'; admitted: number; queues: StreamToken[][]; failures: StreamToken[];
  stages: StreamStage[]; costCents: number; sampleOutputs?: number; predicted?: number;
  budget?: { quantity: number; unitCost: number; cents: number; confirmedAt: number };
  budgetHistory: { quantity: number; unitCost: number; cents: number; confirmedAt: number }[];
  triggerCostCents?: number; drainFinalCents?: number; reminded: boolean; retryRound: number; reason?: string;
  preparation?: number; recoveryRuns: number; events: { at: number; text: string }[];
  pausedStages?: number[];
  manualAdmission?: boolean;
  costPrompts?: { id: string; text: string; sampled: boolean }[];
  demoOutcome?: 'normal' | 'zero';
};
const batchesFor = (w: LocalWorkspace, e: LocalExecutor) => (e.runtime?.batchIds ?? []).map(id => w.batches.find(b => b.id === id)!);
const costPrompt = (s: StreamRun, text: string) => { const id = `cost-${(s.costPrompts?.length ?? 0) + 1}`; s.costPrompts ??= []; s.costPrompts.push({ id, text, sampled: s.costPrompts.length % 2 === 0 }); };
const event = (s: StreamRun, text: string) => { s.events.unshift({ at: Date.now(), text }); };
export function validateStreamPolicy(policy: StreamPolicy, count: number) {
  if (!Number.isSafeInteger(policy.sampleSize) || policy.sampleSize < 1 || policy.sampleSize > count) throw new Error('样本数量须为 1 至本次输入数量之间的整数');
  if (!Number.isFinite(policy.targetUnitCost) || policy.targetUnitCost <= 0) throw new Error('请填写大于 0 的期望成品单价');
  if (!Number.isSafeInteger(policy.maxRetries) || policy.maxRetries < 0) throw new Error('请填写有限的非负整数重试次数，0 表示不自动重试');
  if (policy.reminderRatio !== undefined && (!Number.isFinite(policy.reminderRatio) || policy.reminderRatio <= 0 || policy.reminderRatio >= 100)) throw new Error('提前提醒比例须大于 0 且小于 100%，也可留空');
}
export function newStreamRun(stages: number): StreamRun {
  return { phase: 'sample', control: 'automatic', admitted: 0, queues: Array.from({ length: stages }, () => []), failures: [], stages: Array.from({ length: stages }, () => ({ processed: 0, failed: 0, outputs: 0, costCents: 0 })), costCents: 0, budgetHistory: [], reminded: false, retryRound: 0, recoveryRuns: 0, events: [] };
}
export function startStream(w: LocalWorkspace, id: string): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!;
  if (!e?.runtime || !e.streamPolicy || e.runtime.started) throw new Error('请先配置流式策略，已启动的执行器不能重新开始');
  validateStreamPolicy(e.streamPolicy, e.inputCount ?? 0);
  if (!e.input || !e.runtime.batchIds.length) throw new Error('请先配置输入与已发布工作流');
  e.stream = newStreamRun(e.runtime.batchIds.length); if (id === 'phase2-zero') e.stream.demoOutcome = 'zero'; e.runtime.started = true; e.runtime.state = 'running';
  event(e.stream, '开始本次执行器样本；费用与产物归本次执行器');
  return next;
}
export function confirmStreamBudget(w: LocalWorkspace, id: string, quantity: number, unitCost: number): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!; const s = e?.stream;
  if (!s || !s.sampleOutputs || s.sampleOutputs < 1) throw new Error('样本未跑通或零成品，不能确认正式预算');
  if (s.control === 'manual' || ['completed', 'draining'].includes(s.phase)) throw new Error('当前状态不支持自动生产预算确认');
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost <= 0) throw new Error('预计成品数与期望单价须大于 0');
  const cents = Math.round(quantity * unitCost * 100);
  if (cents <= s.costCents) throw new Error('新预算未覆盖已发生费用，请调整公式参数后确认');
  s.budget = { quantity, unitCost, cents, confirmedAt: Date.now() }; s.budgetHistory.push({ ...s.budget });
  e.streamPolicy!.targetUnitCost = unitCost; s.phase = 'production'; s.reason = '预算已人工确认，继续处理剩余固定输入；可读成功结果持续下传'; e.runtime!.state = 'running';
  event(s, `人工确认公式预算：${quantity} × ¥${unitCost} = ¥${(cents / 100).toFixed(2)}`);
  return next;
}
export function takeOverStream(w: LocalWorkspace, id: string): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!; const s = e?.stream;
  if (!s || s.phase === 'completed') throw new Error('当前状态不能人工接管');
  s.control = 'manual'; s.manualAdmission = false; s.phase = 'draining'; s.reason = '人工接管：停止新增取入与自动重试，已取入数据完成后原位补救';
  e.runtime!.state = 'running'; event(s, s.reason); return next;
}
export function prepareStreamRecovery(w: LocalWorkspace, id: string): LocalWorkspace {
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!; const s = e?.stream;
  if (!s || s.control !== 'manual' || s.phase !== 'review' || s.preparation !== undefined || !s.failures.length) throw new Error('请先人工接管，等待收尾后选择失败数据补救');
  s.preparation = 0; s.reason = '正在扫描并准备失败输入；rowkey 标记不能替代完整输入'; e.runtime!.state = 'running'; event(s, '人工确认本次失败类补救，可能产生额外费用'); return next;
}
function queued(s: StreamRun) { return s.queues.some(q => q.length > 0); }
function sync(w: LocalWorkspace, e: LocalExecutor) {
  const s = e.stream!, batches = batchesFor(w, e);
  batches.forEach((b, i) => {
    const stage = s.stages[i]; b.total = i === 0 ? e.inputCount! : s.admitted === e.inputCount && ['review', 'completed'].includes(s.phase) ? stage.processed : -1;
    b.success = new Set((b.results ?? []).map(r => r.values.source_key)).size; b.failed = stage.failed; b.cost = `¥ ${(stage.costCents / 100).toFixed(2)}`;
    b.progress = b.total > 0 ? Math.min(100, Math.round(stage.processed / b.total * 100)) : 0;
    b.status = e.runtime!.state === 'paused' || s.pausedStages?.includes(i) ? '已暂停' : s.phase === 'draining' ? '收尾中' : ['budget', 'review'].includes(s.phase) ? '已暂停' : s.phase === 'completed' ? '已完成' : '运行中';
    b.inputResource = i ? `CID://stream/${e.id}/${batches[i - 1].id}` : e.input ?? '';
    b.nodes.forEach(node => { node.status = s.queues[i].length ? '处理中' : stage.processed ? '已完成' : '待处理'; if (b.status === '已暂停' && node.status !== '已完成') node.status = '已暂停'; node.cost = b.cost; });
  });
}
/** Synthetic costs/outcomes only. Each token is processed once per attempt; ready results immediately enter the next stage. */
export function tickStream(w: LocalWorkspace, id: string): LocalWorkspace {
  const original = w.executors.find(x => x.id === id);
  if (!original?.stream || original.runtime?.state !== 'running') return w;
  const next = cloneWorkspace(w), e = next.executors.find(x => x.id === id)!, s = e.stream!, p = e.streamPolicy!, bs = batchesFor(next, e);
  if (s.preparation !== undefined) {
    s.preparation = Math.min(100, s.preparation + 25);
    if (s.preparation === 100) {
      s.failures.forEach(t => { s.queues[t.stage].push({ ...t, attempt: t.attempt + 1 }); s.stages[t.stage].failed -= 1; });
      s.failures = []; s.preparation = undefined; s.phase = 'production'; s.recoveryRuns += 1;
      s.reason = '人工补救进行中；不新增原始输入，费用与产物仍归本执行器'; event(s, s.reason);
    }
    sync(next, e); return next;
  }
  // Reverse order gives each downstream queue a visible step; no export task is involved.
  for (let i = s.queues.length - 1; i >= 0; i--) {
    if (s.pausedStages?.includes(i) || i + 1 < s.queues.length && s.pausedStages?.includes(i + 1) && s.queues[i + 1].length > 0) continue;
    const token = s.queues[i].shift(); if (!token) continue;
    const price = [10, 20, 15][i % 3], stage = s.stages[i];
    if (token.attempt === 0) stage.processed += 1; stage.costCents += price; s.costCents += price;
    const failed = token.attempt === 0 && (s.demoOutcome === 'zero' && i === s.queues.length - 1 || i === 0 && token.root % 5 === 0 || i === 1 && token.root % 7 === 0);
    if (failed) { stage.failed += 1; s.failures.push(token); }
    else {
      const multiplicity = i === 0 && token.root % 2 === 1 ? 2 : 1;
      for (let j = 0; j < multiplicity; j++) {
        const key = `${token.key}.${j}`, b = bs[i];
        const result = { id: `${b.id}:${key}`, batchId: b.id, inputOrder: token.root, completedAt: Date.now(), values: { tos_path: `tos://demo/phase2/${e.id}/${key}.json`, result: `合成产物 ${key}`, source_key: token.key } };
        b.results ??= []; if (!b.results.some(x => x.id === result.id)) b.results.push(result);
        stage.outputs += 1;
        if (i + 1 < s.queues.length) s.queues[i + 1].push({ key, root: token.root, stage: i + 1, attempt: 0 });
      }
    }
    if (s.budget && s.costCents >= s.budget.cents && s.triggerCostCents === undefined && s.control === 'automatic') {
      s.triggerCostCents = s.costCents; s.phase = 'draining'; s.reason = '达到预算：已停止新增取入与新增重试，已取入数据继续处理，收尾可能超额'; event(s, s.reason); costPrompt(s, s.reason);
    }
  }
  if (s.budget && p.reminderRatio !== undefined && !s.reminded && s.costCents >= s.budget.cents * p.reminderRatio / 100) { s.reminded = true; costPrompt(s, '预算提前提醒'); event(s, `费用达到预算 ${p.reminderRatio}% 的提前提醒；继续运行`); }
  const limit = s.phase === 'sample' ? p.sampleSize : e.inputCount!;
  if (['sample', 'production'].includes(s.phase) && (s.control === 'automatic' || s.manualAdmission) && !s.pausedStages?.some(i => i === 0 || s.queues[i].length > 0) && s.admitted < limit) {
    s.admitted += 1; s.queues[0].push({ key: String(s.admitted), root: s.admitted, stage: 0, attempt: 0 });
  }
  const terminal = Array.from({ length: s.admitted }, (_, i) => i + 1).filter(root => !s.queues.some(q => q.some(t => t.root === root))).length;
  if (terminal > 0) s.predicted = Math.round(s.stages.at(-1)!.outputs / terminal * e.inputCount! * 100) / 100;
  if (!queued(s)) {
    if (s.phase === 'sample' && s.admitted === p.sampleSize) {
      s.sampleOutputs = s.stages.at(-1)!.outputs; s.phase = 'budget'; e.runtime!.state = 'waiting';
      s.reason = s.sampleOutputs ? '样本完整链路已结束，确认公式预算后处理剩余输入；代表性需人工核对' : '样本零成品，无法可靠估算；请人工接管补救并复核样本'; event(s, s.reason);
    } else if (s.phase === 'draining' || s.control === 'manual') {
      if (s.triggerCostCents !== undefined && s.drainFinalCents === undefined) s.drainFinalCents = s.costCents;
      s.manualAdmission = false; s.phase = 'review'; e.runtime!.state = 'waiting'; event(s, `收尾结束，最终费用 ¥${(s.costCents / 100).toFixed(2)}`);
    } else if (s.phase === 'production' && s.admitted === e.inputCount) {
      if (s.failures.length && s.retryRound < p.maxRetries) {
        const estimateCents = s.failures.reduce((n, t) => n + Array.from({ length: s.queues.length - t.stage }, (_, j) => [10, 20, 15][(j + t.stage) % 3] * (t.stage === 0 ? 2 : 1)).reduce((a, b) => a + b, 0), 0);
        // Closed queues have no unsettled synthetic work. Production must include unsettled charges as well.
        const expected = s.failures.length * (s.sampleOutputs! / p.sampleSize);
        if (!expected || !s.budget || s.costCents + estimateCents >= s.budget.cents || (s.costCents + estimateCents) / 100 / (s.stages.at(-1)!.outputs + expected) > p.targetUnitCost) {
          s.phase = 'review'; e.runtime!.state = 'waiting'; s.reason = '暂不自动重试：预计后续费用、预算余量或成品收益不满足；请人工核对'; event(s, s.reason); costPrompt(s, s.reason);
        } else {
          s.retryRound += 1; s.failures.forEach(t => { s.queues[t.stage].push({ ...t, attempt: t.attempt + 1 }); s.stages[t.stage].failed -= 1; }); s.failures = [];
          event(s, `首轮及后续处理均已结束，启动第 ${s.retryRound} 轮有限自动重试`);
        }
      } else {
        s.phase = s.failures.length ? 'review' : 'completed'; e.runtime!.state = s.failures.length ? 'waiting' : 'completed';
        s.reason = s.failures.length ? '有限重试已结束，仍有失败数据，可人工接管原位补救' : '固定输入处理结束；预计成品量仅用于预算'; event(s, s.reason);
      }
    }
  }
  sync(next, e); return next;
}

export function toggleStreamStage(w: LocalWorkspace, id: string, stage: number): LocalWorkspace {
 const next = cloneWorkspace(w), e = next.executors.find(e => e.id === id)!, s = e?.stream;
 if (!s || e.runtime?.state !== 'running' || !s.queues[stage]) throw new Error('当前状态不能调整环节');
 const paused = s.pausedStages ?? []; s.pausedStages = paused.includes(stage) ? paused.filter(i => i !== stage) : [...paused, stage];
 event(s, `${s.pausedStages.includes(stage) ? '暂停' : '恢复'}第 ${stage + 1} 环节；整体控制与费用规则仍有效`); sync(next, e); return next;
}
export function continueStreamManually(w: LocalWorkspace, id: string): LocalWorkspace {
 const next = cloneWorkspace(w), e = next.executors.find(e => e.id === id)!, s = e?.stream;
 if (!s || s.control !== 'manual' || s.phase !== 'review' || s.admitted >= (e.inputCount ?? 0)) throw new Error('当前没有可继续取入的剩余输入');
 s.manualAdmission = true; s.phase = 'production'; s.reason = '人工确认继续剩余输入；累计费用可能超出原预算'; e.runtime!.state = 'running'; event(s, s.reason); return next;
}
