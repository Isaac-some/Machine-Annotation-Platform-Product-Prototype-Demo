import type { LocalWorkspace } from './local-workspace';
import { executorSettings } from './executor-settings';
import { DELIVERY_DEMO_FLOW_NAMES, withDeliveryExamples } from './delivery-examples';
import { cloneExecutor, configureExecutor } from './executor-runtime';
import { cloneWorkspace } from './delivery';
import { estimateConfigurationKey, newStreamRun } from './executor-streaming';
import { timeConfigurationKey } from './executor-time-estimates';

const PHASE2_EXECUTOR_NAMES = {
  'phase2-1555': ['运行上限与计时 · 可启动验收执行器', '定军山 · 运行上限与计时'],
  'phase2-1441': ['录屏迭代验收 · 可启动的三环节执行器', '长坂坡 · 三环节流式验收'],
  'phase2-demo': ['流式生产 · 实绩成本估算', '草船借箭 · 流式生产与成本估算'],
  'phase2-cost': ['成本上限 · 收尾与人工继续', '赤壁火攻 · 成本收尾与人工继续'],
  'phase2-zero': ['零成品 · 成本不可计算', '空城计 · 零成品与估算边界'],
  'phase2-acceptance': ['验收演示 · 可启动的三环节流式执行器', '桃园结义 · 三环节流式验收'],
  'phase2-live': ['流式生产 · 实绩与成本估算', '木牛流马 · 流式生产与成本估算'],
} as const;

function refreshPhase2ExampleNames(workspace: LocalWorkspace): LocalWorkspace {
  let changes = false;
  for (const [id, [oldName]] of Object.entries(PHASE2_EXECUTOR_NAMES)) {
    const executor = workspace.executors.find(item => item.id === id);
    if (executor?.name === oldName || executor?.flows.some((flow, index) => flow.id === `delivery-demo-${index}` && flow.name === ['A · 数据整理', 'B · 标注处理', 'C · 结果复核'][index])) changes = true;
    if (executor?.runtime?.batchIds.some(batchId => workspace.batches.some(batch => batch.id === batchId && ['A · 数据整理', 'B · 标注处理', 'C · 结果复核'].includes(batch.name)))) changes = true;
  }
  if (!changes) return workspace;
  const next = cloneWorkspace(workspace);
  for (const [id, [oldName, name]] of Object.entries(PHASE2_EXECUTOR_NAMES)) {
    const executor = next.executors.find(item => item.id === id);
    if (!executor) continue;
    if (executor.name === oldName) executor.name = name;
    executor.flows = executor.flows.map((flow, index) => ({
      ...flow,
      name: flow.id === `delivery-demo-${index}` && ['A · 数据整理', 'B · 标注处理', 'C · 结果复核'][index] === flow.name ? DELIVERY_DEMO_FLOW_NAMES[index] : flow.name,
    }));
    for (const batchId of executor.runtime?.batchIds ?? []) {
      const batch = next.batches.find(item => item.id === batchId);
      const index = batch ? ['A · 数据整理', 'B · 标注处理', 'C · 结果复核'].indexOf(batch.name) : -1;
      if (batch && index >= 0) batch.name = DELIVERY_DEMO_FLOW_NAMES[index];
    }
  }
  return next;
}

/** Opt-in, synthetic fixtures. Existing records are never overwritten. Parameters are scenario inputs, not business defaults. */
export function withPhase2Examples(w: LocalWorkspace): LocalWorkspace {
  let next = withDeliveryExamples(w);
  for (const [id, name, policy] of [
    ['phase2-reservoir', '流式生产 · 持续供数与运行闸门', { maxRetries: 0, observationSize: 1000 }],
    ['phase2-1555', '定军山 · 运行上限与计时', { maxRetries: 0, observationSize: 1000 }],
    ['phase2-1441', '长坂坡 · 三环节流式验收', { maxRetries: 0, observationSize: 1000 }],
    ['phase2-demo', '草船借箭 · 流式生产与成本估算', { maxRetries: 1, observationSize: 1000 }],
    ['phase2-cost', '赤壁火攻 · 成本收尾与人工继续', { costLimitCents: 432, maxRetries: 1, reminderRatio: 60, observationSize: 1000 }],
    ['phase2-zero', '空城计 · 零成品与估算边界', { maxRetries: 0, observationSize: 1000 }],
  ] as const) {
    if (next.executors.some(e => e.id === id)) continue;
    next = cloneExecutor(next, 'delivery-demo', { id, name, includeInput: true, includeConfiguration: true });
    next = configureExecutor(next, id, { resource: ['phase2-1441', 'phase2-1555'].includes(id) ? 'tos://demo/acceptance/240-videos.csv' : 'tos://demo/production/inputs.csv', count: id === 'phase2-reservoir' ? 6 : ['phase2-1441', 'phase2-1555'].includes(id) ? 240 : 24, resourceType: 'video', settings: executorSettings(), runMode: 'stream', streamPolicy: policy });
    if (id === 'phase2-zero') next.executors.find(e => e.id === id)!.streamPolicy!.costLimitCents = undefined;
  }
  if (!next.executors.some(e => e.id === 'phase2-acceptance')) {
    next = cloneExecutor(next, 'delivery-demo', { id: 'phase2-acceptance', name: '桃园结义 · 三环节流式验收', includeInput: true, includeConfiguration: true });
    next = configureExecutor(next, 'phase2-acceptance', { resource: 'tos://demo/acceptance/240-videos.csv', count: 240, resourceType: 'video', settings: executorSettings(), runMode: 'stream', streamPolicy: { maxRetries: 0, observationSize: 1000 } });
  }
  if (!next.executors.some(e => e.id === 'phase2-live')) {
    next = cloneExecutor(next, 'delivery-demo', { id: 'phase2-live', name: '木牛流马 · 流式生产与成本估算', includeInput: true, includeConfiguration: true });
    next = configureExecutor(next, 'phase2-live', { resource: 'tos://demo/production/10k-videos.csv', count: 10000, resourceType: 'video', settings: executorSettings(), runMode: 'stream', streamPolicy: { costLimitCents: 80000, maxRetries: 1, observationSize: 1000 } });
  }
  // Explicit synthetic observation scenarios; the existing ready-to-run demos remain untouched.
  for (const [id, name] of [['phase2-time-basic', '借东风 · 整批时间预估'], ['phase2-time-features', '木牛流马 · 资源特征时间预估']] as const) {
    if (next.executors.some(executor => executor.id === id)) continue;
    next = cloneExecutor(next, 'delivery-demo', { id, name, includeInput: true, includeConfiguration: true });
    next = configureExecutor(next, id, { resource: 'tos://demo/time/10k-inputs.csv', count: 10000, resourceType: 'video', settings: executorSettings(), runMode: 'stream', streamPolicy: { maxRetries: 0, observationSize: 100 } });
    const executor = next.executors.find(item => item.id === id)!;
    const s = executor.stream = newStreamRun(executor.runtime!.batchIds.length);
    executor.runtime!.started = true; executor.runtime!.state = 'paused';
    s.admitted = 1000; s.settledInputs = 1000; s.activeRunMs = 1000 * 60000;
    s.inputMetrics = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [i + 1, { costCents: 40, finalOutputs: 1 }]));
    s.costCents = 40000; s.settledRootIds = Array.from({ length: 1000 }, (_, i) => i + 1);
    s.estimateRootIds = [...s.settledRootIds]; s.estimateMetrics = structuredClone(s.inputMetrics); s.estimateConfigKey = estimateConfigurationKey(executor);
    s.stageActiveMs = s.stages.map(() => s.activeRunMs!);
    s.stages.forEach((stage, index) => {
      stage.processed = 1000; stage.outputs = 1000;
      stage.costCents = Math.floor(s.costCents / s.stages.length) + (index === 0 ? s.costCents % s.stages.length : 0);
      const batch = next.batches.find(item => item.id === executor.runtime!.batchIds[index]);
      if (batch) { batch.total = 10000; batch.success = 1000; batch.failed = 0; batch.progress = 10; batch.status = '已暂停'; batch.cost = `¥ ${(stage.costCents / 100).toFixed(2)}`; }
    });
    const configKey = timeConfigurationKey(executor);
    const boundary = { activeMs: s.activeRunMs, outputs: 1000, settledInputs: 1000 };
    const minutes = [80, 120, 90, 110, 100, 80, 120, 90, 110, 100];
    s.timeObservation = { configKey, source: 'synthetic-demo', updatedAt: Date.now(), checkpoint: boundary, current: { ...boundary }, segments: minutes.map(value => ({ outputs: 100, activeMs: value * 60000 })) };
    if (id === 'phase2-time-features') s.resourceTimeEvidence = { configKey, source: 'synthetic-demo', classes: [
      { label: '短视频（≤1分钟）', productShare: .5, segments: minutes.map(value => ({ outputs: 100, activeMs: value * 30000 })) },
      { label: '长视频（1至5分钟）', productShare: .5, segments: minutes.map(value => ({ outputs: 100, activeMs: value * 120000 })) },
    ] };
  }
  return refreshPhase2ExampleNames(next);
}
