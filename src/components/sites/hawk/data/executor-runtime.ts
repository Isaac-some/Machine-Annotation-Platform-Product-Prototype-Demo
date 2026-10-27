import type { LocalExecutor, LocalWorkspace } from './local-workspace';
import type { BatchNode, BatchRow } from './mock-batches';
import { publishedFlowId } from './mock-pipelines';
import { batchSuccessRate, executorSettings, validateExecutorSettings, type ExecutorSettings } from './executor-settings';

export type PublishedGraph = { nodes: { id: string; data: { operatorId: string; kind?: string; label: string; readOnly?: boolean } }[]; edges?: { source: string; target: string }[] };
export type ExecutorAction = 'start' | 'pause' | 'resume' | 'end' | 'confirm' | 'retry';
const copy = (workspace: LocalWorkspace): LocalWorkspace => JSON.parse(JSON.stringify(workspace)) as LocalWorkspace;
const timestamp = () => new Date().toLocaleString('sv-SE', { hour12: false });

function orderedNodes(graph?: PublishedGraph): BatchNode[] {
  if (!graph) return [];
  const remaining = [...graph.nodes];
  const ordered: typeof remaining = [];
  while (remaining.length) {
    const index = remaining.findIndex(node => !(graph.edges ?? []).some(edge => edge.target === node.id && remaining.some(other => other.id === edge.source)));
    if (index < 0) throw new Error('发布快照含有循环，无法生成执行顺序');
    ordered.push(remaining.splice(index, 1)[0]);
  }
  return ordered.filter(node => node.data.operatorId !== 'control.start' && node.data.kind !== 'result' && !node.data.readOnly)
    .map((node, index) => ({ seq: index + 1, name: node.data.label, status: '待处理', cost: '¥ -' }));
}

/** Materialize each executor's own batch exactly once. Never read mutable drafts. */
export function initializeExecutor(workspace: LocalWorkspace, id: string, snapshots: Record<string, PublishedGraph | undefined>): LocalWorkspace {
  const original = workspace.executors.find(item => item.id === id);
  if (!original) throw new Error('执行器不存在');
  if (original.runtime) {
    if (!original.runtime.batchIds.every(batchId => workspace.batches.some(batch => batch.id === batchId && batch.executorId === id))) throw new Error('执行器关联的本地批次缺失，请恢复浏览器数据');
    return workspace;
  }
  const next = copy(workspace);
  const executor = next.executors.find(item => item.id === id)!;
  let serial = Math.max(5899, ...next.batches.map(batch => batch.id));
  const now = timestamp();
  const batches = executor.flows.map((flow, index): BatchRow => ({
    id: ++serial, projectId: executor.projectId ?? 0, executorId: executor.id,
    name: flow.name, workflow: publishedFlowId(flow), status: '初始化',
    total: index === 0 && executor.inputCount ? executor.inputCount : -1,
    success: 0, failed: 0, filtered: 0, progress: 0, cost: '¥ 0.00',
    createdAt: now, updatedAt: now, material: '其他', notice: '飞书消息',
    inputResource: index === 0 ? executor.input ?? '' : '',
    inputFromBatchId: index ? serial - 1 : undefined,
    nodes: orderedNodes(snapshots[flow.graphKey ?? `annotation-demo.published.${flow.id}.v${flow.version ?? 1}`]),
    graphKey: flow.graphKey, outputFields: [...flow.outputs],
  }));
  executor.runtime = { batchIds: batches.map(batch => batch.id), currentIndex: 0, state: 'ready', phase: 'processing', started: false };
  next.batches.push(...batches);
  return next;
}

export function executorBatches(workspace: LocalWorkspace, executor: LocalExecutor): BatchRow[] {
  return (executor.runtime?.batchIds ?? []).map(id => workspace.batches.find(batch => batch.id === id)).filter((batch): batch is BatchRow => Boolean(batch));
}

export function setExecutorInput(workspace: LocalWorkspace, id: string, resource: string, count: number): LocalWorkspace {
  const executor = workspace.executors.find(item => item.id === id);
  if (!executor?.runtime || executor.runtime.started) throw new Error('执行已开始，本次输入不能更换');
  if (!/^(tos|cid|local|https?):\/\/.+/i.test(resource.trim()) || !Number.isSafeInteger(count) || count < 1) throw new Error('请填写有效的资源路径与正整数资源数量');
  const next = copy(workspace);
  const target = next.executors.find(item => item.id === id)!;
  target.input = resource.trim(); target.inputCount = count;
  const first = executorBatches(next, target)[0];
  if (!first) throw new Error('请先添加工作流');
  first.inputResource = target.input; first.total = count; first.updatedAt = timestamp();
  return next;
}

/** Save resource and release rules atomically; an invalid form never saves half. */
export function configureExecutor(workspace: LocalWorkspace, id: string, input: { resource: string; count: number; resourceType: NonNullable<LocalExecutor['resourceType']>; settings: ExecutorSettings }): LocalWorkspace {
  const original = workspace.executors.find(item => item.id === id);
  if (!original?.runtime || original.runtime.state === 'running') throw new Error('请先暂停，再调整输入及执行器配置');
  validateExecutorSettings(input.settings);
  if (!['video', 'image', 'audio', 'other'].includes(input.resourceType)) throw new Error('请选择输入资源类型');
  const next = original.runtime.started ? copy(workspace) : setExecutorInput(workspace, id, input.resource, input.count);
  const executor = next.executors.find(item => item.id === id)!;
  executor.settings = input.settings;
  if (!original.runtime.started) {
    executor.resourceType = input.resourceType;
    executorBatches(next, executor)[0].material = { video: '视频', image: '图片', audio: '音频', other: '其他' }[input.resourceType];
  }
  return next;
}

export function canExecutorAction(workspace: LocalWorkspace, executor: LocalExecutor, action: ExecutorAction): boolean {
  const runtime = executor.runtime;
  if (!runtime) return false;
  if (action === 'start') return runtime.state === 'ready' && Boolean(executor.input?.trim()) && (executor.inputCount ?? 0) > 0 && executorBatches(workspace, executor).length > 0;
  if (action === 'pause') return runtime.state === 'running';
  if (action === 'resume') return runtime.state === 'paused';
  if (action === 'confirm') return runtime.state === 'waiting';
  if (action === 'retry') return runtime.state === 'waiting' && (executorBatches(workspace, executor)[runtime.currentIndex]?.failed ?? 0) > 0;
  return ['running', 'paused', 'waiting'].includes(runtime.state);
}

export function changeExecutorState(workspace: LocalWorkspace, id: string, action: ExecutorAction): LocalWorkspace {
  const original = workspace.executors.find(item => item.id === id);
  if (!original || !canExecutorAction(workspace, original, action)) throw new Error(action === 'start' ? '请先配置有效的本次输入' : '当前执行状态不支持此操作');
  const next = copy(workspace);
  const executor = next.executors.find(item => item.id === id)!;
  const runtime = executor.runtime!;
  const batches = executorBatches(next, executor);
  const batch = batches[runtime.currentIndex];
  const now = timestamp();
  if (action === 'end') {
    runtime.state = 'ended';
    batches.slice(runtime.currentIndex).forEach(item => { item.status = '已结束'; item.updatedAt = now; item.nodes.forEach(node => { if (node.status === '处理中') node.status = '待处理'; }); });
    return next;
  }
  if (action === 'pause') {
    runtime.state = 'paused'; batch.status = '已暂停';
  } else if (action === 'confirm') {
    runtime.state = 'running'; runtime.phase = 'exporting'; runtime.reason = undefined; runtime.urgent = false;
    batch.status = '已完成';
  } else if (action === 'retry') {
    runtime.retryRemaining = batch.failed;
    runtime.retryCounts = { ...runtime.retryCounts, [batch.id]: (runtime.retryCounts?.[batch.id] ?? 0) + 1 };
    runtime.state = 'running'; runtime.phase = 'retrying'; runtime.reason = undefined; runtime.urgent = false; batch.status = '运行中';
  } else {
    runtime.state = 'running'; runtime.started = true;
    batch.status = runtime.phase === 'exporting' ? '已完成' : '运行中';
    batch.nodes.forEach((node, index) => { if (node.status !== '已完成') node.status = index === 0 ? '处理中' : '待处理'; });
  }
  batch.updatedAt = now;
  return next;
}

function awaitConfirmation(executor: LocalExecutor, batch: BatchRow, reason: string) {
  const runtime = executor.runtime!;
  runtime.state = 'waiting'; runtime.phase = 'review'; runtime.reason = reason;
  runtime.urgent = executorSettings(executor.settings).urgentReminder;
  batch.status = '已暂停';
}

function evaluateResult(executor: LocalExecutor, batch: BatchRow) {
  const runtime = executor.runtime!;
  const settings = executorSettings(executor.settings);
  const attempts = runtime.retryCounts?.[batch.id] ?? 0;
  if (settings.mode === 'rigorous') {
    awaitConfirmation(executor, batch, '严谨模式：本批次计算完成，需人工确认结束后继续。'); return;
  }
  if (settings.mode === 'default') {
    if (batch.failed > 0 || batch.nodes.some(node => node.status === '失败')) {
      awaitConfirmation(executor, batch, '默认模式：存在失败数据，请重试或人工确认结束后继续。'); return;
    }
  } else {
    const rate = batchSuccessRate(batch, settings.filterRule);
    if (rate === null || rate < settings.targetRate) {
      if (batch.failed > 0 && attempts < settings.maxRetries) {
        runtime.retryCounts = { ...runtime.retryCounts, [batch.id]: attempts + 1 };
        runtime.retryRemaining = batch.failed;
        runtime.phase = 'retrying'; batch.status = '运行中'; return;
      }
      if (settings.afterRetries !== 'continue' || rate === null) {
        awaitConfirmation(executor, batch, rate === null ? '当前没有可计算成功率的数据，需人工核对。' : `成功率 ${rate.toFixed(1)}%，未达到 ${settings.targetRate}%；${batch.failed ? '重试次数已用完' : '没有可重试的失败数据'}，等待人工处理。`); return;
      }
    }
  }
  runtime.phase = 'exporting'; batch.status = '已完成';
}

/** A deterministic local demonstration, advancing only while the page is open. */
export function tickExecutor(workspace: LocalWorkspace, id: string): LocalWorkspace {
  const original = workspace.executors.find(item => item.id === id);
  if (original?.runtime?.state !== 'running') return workspace;
  const next = copy(workspace);
  const executor = next.executors.find(item => item.id === id)!;
  const runtime = executor.runtime!;
  const batches = executorBatches(next, executor);
  const batch = batches[runtime.currentIndex];
  const now = timestamp();
  if (runtime.phase === 'retrying') {
    // Local simulation recovers only failed rows; successes and filters are retained.
    const recovered = Math.min(batch.failed, Math.ceil((runtime.retryRemaining ?? batch.failed) / 2));
    batch.failed -= recovered; batch.success += recovered;
    runtime.retryRemaining = undefined;
    if (!batch.failed) batch.nodes.forEach(node => { if (node.status === '失败') node.status = '已完成'; });
    evaluateResult(executor, batch); batch.updatedAt = now;
    return next;
  }
  if (runtime.phase === 'review' || batch.status === '部分失败' || (runtime.phase !== 'exporting' && batch.nodes.some(node => node.status === '失败'))) {
    if (batch.progress < 100) awaitConfirmation(executor, batch, '节点执行异常，当前进度已保留，请人工核对后处理。');
    else evaluateResult(executor, batch);
    batch.updatedAt = now; return next;
  }
  if (runtime.phase === 'exporting') {
    batch.status = '已导出';
    batch.deliveryResource = `local-demo://${executor.id}/batch-${batch.id}/result-metadata.json`;
    if (runtime.currentIndex + 1 === batches.length) runtime.state = 'completed';
    else {
      runtime.currentIndex += 1; runtime.phase = 'processing';
      runtime.reason = undefined; runtime.urgent = false;
      const following = batches[runtime.currentIndex];
      following.inputResource = batch.deliveryResource; following.total = batch.success;
      following.status = '运行中'; following.updatedAt = now;
      following.nodes.forEach((node, index) => { node.status = index === 0 ? '处理中' : '待处理'; });
    }
  } else {
    batch.progress = Math.min(100, batch.progress + 20);
    batch.success = Math.floor(Math.max(0, batch.total - batch.failed - batch.filtered) * batch.progress / 100);
    batch.nodes.forEach((node, index) => {
      const boundary = (index + 1) / batch.nodes.length * 100;
      node.status = batch.progress >= boundary ? '已完成' : batch.progress >= index / batch.nodes.length * 100 ? '处理中' : '待处理';
      node.cost = node.status === '待处理' ? '¥ -' : '¥ 0.00';
    });
    if (batch.progress === 100) evaluateResult(executor, batch);
  }
  batch.updatedAt = now;
  return next;
}
