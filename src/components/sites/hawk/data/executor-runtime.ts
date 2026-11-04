import { startStream, tickStream, validateStreamPolicy, type StreamPolicy } from './executor-streaming';
import { advanceBatchFinish, appendCompletedResults, beginBatchFinish, exportMembers } from './delivery';
import type { LocalExecutor, LocalWorkspace } from './local-workspace';
import type { BatchNode, BatchRow } from './mock-batches';
import { publishedFlowId } from './mock-pipelines';
import { batchSuccessRate, executorSettings, validateExecutorSettings, type ExecutorSettings } from './executor-settings';

export type PublishedGraph = { nodes: { id: string; data: { operatorId: string; kind?: string; label: string; readOnly?: boolean } }[]; edges?: { source: string; target: string }[] };
export type ExecutorAction = 'start' | 'pause' | 'resume' | 'end' | 'confirm' | 'retry' | 'finish-batch';
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
    graphKey: flow.graphKey, outputFields: [...flow.outputs], deliveryMode: executor.deliveryMode ?? 'sorted', results: [], simulation: {},
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
export function configureExecutor(workspace: LocalWorkspace, id: string, input: { resource: string; count: number; resourceType: NonNullable<LocalExecutor['resourceType']>; settings: ExecutorSettings; runMode?: 'batch' | 'stream'; streamPolicy?: StreamPolicy }): LocalWorkspace {
  const original = workspace.executors.find(item => item.id === id);
  if (!original?.runtime || original.runtime.state === 'running') throw new Error('请先暂停，再调整输入及执行器配置');
  validateExecutorSettings(input.settings);
  if (original.runtime.started && (input.runMode ?? original.runMode ?? 'batch') !== (original.runMode ?? 'batch')) throw new Error('首次启动后运行方式已锁定');
  if (input.runMode === 'stream') { if (!input.streamPolicy) throw new Error('请填写流式策略'); validateStreamPolicy(input.streamPolicy, input.count); }
  if (original.runtime.started && original.runMode === 'stream' && (input.streamPolicy?.sampleSize !== original.streamPolicy?.sampleSize || input.streamPolicy?.targetUnitCost !== original.streamPolicy?.targetUnitCost)) throw new Error('已启动的执行器不能修改旧版样本设置');
  if (!['video', 'image', 'audio', 'other'].includes(input.resourceType)) throw new Error('请选择输入资源类型');
  const next = original.runtime.started ? copy(workspace) : setExecutorInput(workspace, id, input.resource, input.count);
  const executor = next.executors.find(item => item.id === id)!;
  executor.settings = input.settings;
  executor.runMode = input.runMode ?? executor.runMode ?? 'batch';
  executor.streamPolicy = input.streamPolicy;
  if (!original.runtime.started) {
    executor.resourceType = input.resourceType;
    executorBatches(next, executor)[0].material = { video: '视频', image: '图片', audio: '音频', other: '其他' }[input.resourceType];
  }
  return next;
}

export function canExecutorAction(workspace: LocalWorkspace, executor: LocalExecutor, action: ExecutorAction): boolean {
  const runtime = executor.runtime;
  if (!runtime) return false;
  if (executor.runMode === 'stream') {
    if (action === 'start') return runtime.state === 'ready' && Boolean(executor.input && executor.streamPolicy);
    if (action === 'pause') return runtime.state === 'running' && executor.stream?.phase !== 'draining';
    if (action === 'resume') return runtime.state === 'paused';
    return false;
  }
  const batch = executorBatches(workspace, executor)[runtime.currentIndex];
  if (action === 'finish-batch') return ['running', 'paused', 'waiting'].includes(runtime.state) && Boolean(batch && !batch.finish);
  if (action === 'start') return runtime.state === 'ready' && Boolean(executor.input?.trim()) && (executor.inputCount ?? 0) > 0 && executorBatches(workspace, executor).length > 0;
  if (action === 'pause') return runtime.state === 'running';
  if (action === 'resume') return runtime.state === 'paused';
  if (action === 'confirm') return runtime.state === 'waiting' && !batch?.finish;
  if (action === 'retry') return !batch?.finish && runtime.state === 'waiting' && (executorBatches(workspace, executor)[runtime.currentIndex]?.failed ?? 0) > 0;
  return ['running', 'paused', 'waiting'].includes(runtime.state);
}

export function changeExecutorState(workspace: LocalWorkspace, id: string, action: ExecutorAction): LocalWorkspace {
  const original = workspace.executors.find(item => item.id === id);
  if (!original || !canExecutorAction(workspace, original, action)) throw new Error(action === 'start' ? '请先配置有效的本次输入' : '当前执行状态不支持此操作');
  if (original.runMode === 'stream' && action === 'start') return startStream(workspace, id);
  const next = copy(workspace);
  const executor = next.executors.find(item => item.id === id)!;
  const runtime = executor.runtime!;
  if (executor.runMode === 'stream') { if (executor.stream) executor.stream.clockBoundaryAt = Date.now(); runtime.state = action === 'pause' ? 'paused' : 'running'; executorBatches(next, executor).forEach(b => { b.status = action === 'pause' ? '已暂停' : '运行中'; b.nodes.forEach(node => { if (action === 'pause' && node.status !== '已完成') node.status = '已暂停'; }); }); return next; }
  const batches = executorBatches(next, executor);
  const batch = batches[runtime.currentIndex];
  const now = timestamp();
  if (action === 'end') {
    runtime.state = 'ended';
    batches.slice(runtime.currentIndex).forEach(item => { item.status = '已结束'; item.updatedAt = now; item.nodes.forEach(node => { if (node.status === '处理中') node.status = '待处理'; }); });
    return next;
  }
  if (action === 'start' && !batch.simulation) { batch.simulation = { legacySuccess: Math.max(0, batch.success) }; batch.results ??= []; }
  if (action === 'pause') {
    runtime.state = 'paused'; batch.status = '已暂停'; batch.nodes.forEach(node => { if (node.status !== '已完成') node.status = '已暂停'; });
  } else if (action === 'confirm' || action === 'finish-batch') {
    runtime.state = 'running'; runtime.phase = 'exporting'; runtime.reason = undefined; runtime.urgent = false;
    beginBatchFinish(next, batch.id);
  } else if (action === 'retry') {
    runtime.retryRemaining = batch.failed;
    runtime.retryCounts = { ...runtime.retryCounts, [batch.id]: (runtime.retryCounts?.[batch.id] ?? 0) + 1 };
    runtime.state = 'running'; runtime.phase = 'retrying'; runtime.reason = undefined; runtime.urgent = false; batch.status = '运行中';
  } else {
    runtime.state = 'running'; runtime.started = true;
    batch.status = batch.finish ? '收尾中' : '运行中';
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

function evaluateResult(workspace: LocalWorkspace, executor: LocalExecutor, batch: BatchRow) {
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
  beginBatchFinish(workspace, batch.id);
}

/** A deterministic local demonstration, advancing only while the page is open. */
export function tickExecutor(workspace: LocalWorkspace, id: string, observedProcessingMs = 0, observedAt?: number): LocalWorkspace {
  const original = workspace.executors.find(item => item.id === id);
  if (original?.runMode === 'stream') return tickStream(workspace, id, observedProcessingMs, observedAt);
  if (original?.runtime?.state !== 'running') return workspace;
  const next = copy(workspace);
  const executor = next.executors.find(item => item.id === id)!;
  const runtime = executor.runtime!;
  const batches = executorBatches(next, executor);
  const batch = batches[runtime.currentIndex];
  const now = timestamp();
  if (runtime.phase === 'exporting') {
    if (!batch.finish) beginBatchFinish(next, batch.id);
    if (!advanceBatchFinish(next, batch)) { batch.updatedAt = now; return next; }
    if (runtime.currentIndex + 1 === batches.length) runtime.state = 'completed';
    else {
      const job = next.exportJobs?.find(item => item.id === batch.finish?.exportId);
      if (!job && !batch.success) {
        batches.slice(runtime.currentIndex + 1).forEach(item => { item.total = 0; item.success = 0; item.status = '已结束'; item.updatedAt = now; });
        runtime.state = 'completed'; runtime.reason = '当前环节无成功结果，后续批次无需执行'; return next;
      }
      if (!job || job.status !== 'succeeded') { runtime.state = 'waiting'; runtime.reason = '缺少可供下游读取的交付文件，无法接续'; return next; }
      runtime.currentIndex += 1; runtime.phase = 'processing'; runtime.reason = undefined; runtime.urgent = false;
      const following = batches[runtime.currentIndex];
      following.inputResource = job.resource!; following.total = job.members.length; following.inputResults = exportMembers(job);
      following.results ??= []; following.simulation ??= {};
      following.status = '运行中'; following.updatedAt = now;
      following.nodes.forEach((node, index) => { node.status = index === 0 ? '处理中' : '待处理'; });
    }
    batch.updatedAt = now; return next;
  }
  if (runtime.phase === 'retrying') {
    // Local simulation recovers only failed rows; successes and filters are retained.
    const recovered = Math.min(batch.failed, Math.ceil((runtime.retryRemaining ?? batch.failed) / 2));
    batch.failed -= recovered; batch.success += recovered;
    runtime.retryRemaining = undefined;
    if (!batch.failed) batch.nodes.forEach(node => { if (node.status === '失败') node.status = '已完成'; });
    appendCompletedResults(batch);
    evaluateResult(next, executor, batch);
    batch.updatedAt = now;
    return next;
  }
  if (runtime.phase === 'review' || batch.status === '部分失败' || batch.nodes.some(node => node.status === '失败')) {
    if (batch.progress < 100) awaitConfirmation(executor, batch, '节点执行异常，当前进度已保留，请人工核对后处理。');
    else evaluateResult(next, executor, batch);
    batch.updatedAt = now; return next;
  }
  {
    batch.progress = Math.min(100, batch.progress + 20);
    batch.success = Math.floor(Math.max(0, batch.total - batch.failed - batch.filtered) * batch.progress / 100);
    batch.nodes.forEach((node, index) => {
      const boundary = (index + 1) / batch.nodes.length * 100;
      node.status = batch.progress >= boundary ? '已完成' : batch.progress >= index / batch.nodes.length * 100 ? '处理中' : '待处理';
      node.cost = node.status === '待处理' ? '¥ -' : '¥ 0.00';
    });
    appendCompletedResults(batch);
    if (batch.progress === 100) evaluateResult(next, executor, batch);
  }
  batch.updatedAt = now;
  return next;
}

/** Clone configuration only. No runtime/result/export identity may cross into the new instance. */
export function cloneExecutor(workspace: LocalWorkspace, sourceId: string, options: { name: string; includeInput: boolean; includeConfiguration: boolean; id?: string }): LocalWorkspace {
  const source = workspace.executors.find(e => e.id === sourceId);
  if (!source || !options.name.trim()) throw new Error('请填写克隆执行器名称');
  const next = copy(workspace), id = options.id ?? `executor-clone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  if (next.executors.some(e => e.id === id)) throw new Error('新执行器 ID 已存在');
  const flows = source.flows.map(flow => {
    const published = next.groups.flatMap(g => g.drafts).find(f => f.id === flow.id && f.status === 'published' && (f.version ?? 1) === (flow.version ?? 1));
    if (!options.includeConfiguration && !published) throw new Error('来源发布版本配置不可用，无法回退；请保留实际配置或恢复该版本');
    return JSON.parse(JSON.stringify(options.includeConfiguration ? flow : published)) as typeof flow;
  });
  const cloned: LocalExecutor = { id, name: options.name.trim(), description: `克隆自 ${source.name}`, projectId: source.projectId, source: source.source, clonedFrom: sourceId, flowIds: flows.map(f => f.id), flows,
    runMode: options.includeConfiguration ? source.runMode ?? 'batch' : 'batch', settings: options.includeConfiguration ? source.settings && { ...source.settings } : undefined,
    concurrency: options.includeConfiguration ? source.concurrency : undefined,
    deliveryMode: options.includeConfiguration ? source.deliveryMode : undefined, notification: options.includeConfiguration && source.notification ? { ...source.notification } : undefined,
    streamPolicy: options.includeConfiguration && source.streamPolicy ? { ...source.streamPolicy, costLimitCents: undefined } : undefined,
    input: options.includeInput ? source.input : undefined, inputCount: options.includeInput ? source.inputCount : undefined, resourceType: options.includeInput ? source.resourceType : undefined };
  next.executors.push(cloned);
  const snapshots = Object.fromEntries(flows.map((flow, index) => [flow.graphKey ?? `annotation-demo.published.${flow.id}.v${flow.version ?? 1}`, { nodes: (executorBatches(workspace, source)[index]?.nodes ?? []).map(node => ({ id: String(node.seq), data: { operatorId: 'clone-snapshot', label: node.name } })) }]));
  return initializeExecutor(next, id, snapshots);
}
