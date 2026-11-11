import type { LocalWorkspace } from './local-workspace';
import { changeExecutorState, cloneExecutor, configureExecutor } from './executor-runtime';
import { executorSettings } from './executor-settings';
import { startStream, tickStream, recordStreamSourceEvent } from './executor-streaming';

export const DEMO_BOUNDARY_CIDS = { cost: 'CID://demo-cost-limit', time: 'CID://demo-time-limit', target: 'CID://demo-output-limit', input: 'CID://demo-input-limit' } as const;
export const DEMO_EXECUTOR_ID = 'executor-demo-showcase';
export const DEMO_SCENARIOS = [
  { id: 'cost', title: '费用触顶与收尾', expected: '接近上限开始，费用触顶后停止取入，在途继续收尾' },
  { id: 'input', title: '原始数据取入上限', expected: '再取入 3 条即停止新增；输入量与成品量分别统计' },
  { id: 'target', title: '达到目标成品量', expected: '再产出 3 份达到目标，已取入数据继续完成' },
  { id: 'time', title: '实际运行时长上限', expected: '再处理约 2.4 秒触顶，暂停等待不计入' },
  { id: 'estimate', title: '小批次自动预估', expected: '240 条输入，12 条收尾首次估算，此后约每 5 条刷新' },
  { id: 'cid', title: 'CID 输入与持续生产', expected: 'CID 来源逐条接续，可暂停后继续' },
  { id: 'csv', title: 'CSV 读取与 RowKey 校验', expected: '从 CSV 读取阶段开始，读取后显示总量' },
  { id: 'csv-invalid', title: 'CSV 缺少 RowKey', expected: '校验失败，阻止数据处理并明确缺失字段' },
  { id: 'insufficient', title: '数据不足与等待新增', expected: '现有输入耗尽，保持等待；可以追加数据' },
  { id: 'end', title: '供数结束', expected: '明确结束且在途完成后结束本次运行' },
  { id: 'idle', title: '无活动超时', expected: '模拟无活动触发暂停；恢复供数仍须人工继续' },
  { id: 'error', title: '输入源检查失败', expected: '检查失败停止取入并收尾；恢复后不自动继续' },
  { id: 'retry', title: '失败数据原位恢复', expected: '停在有失败的数据，可在批次中仅重试失败项' },
  { id: 'zero', title: '零成品估算边界', expected: '已产生费用但无成品，不显示虚假单价或无限预测' },
] as const;
export type DemoScenario = typeof DEMO_SCENARIOS[number]['id'];

/** Build in an isolated workspace; replace only our previous demo, never append history. */
function* prepareDemoScenarioSteps(workspace: LocalWorkspace, sourceId: string, scenario: DemoScenario): Generator<void, LocalWorkspace> {
  const selected = workspace.executors.find(e => e.id === sourceId);
  const source = workspace.executors.find(e => e.id === (selected?.id === DEMO_EXECUTOR_ID ? selected.clonedFrom : sourceId));
  if (!source) throw new Error('请先选择执行器');
  let demo: LocalWorkspace = { ...workspace, executors: [source], batches: workspace.batches.filter(b => source.runtime?.batchIds.includes(b.id)) };
  demo = cloneExecutor(demo, source.id, { id: DEMO_EXECUTOR_ID, name: `演示 · ${DEMO_SCENARIOS.find(s => s.id === scenario)!.title}`, includeConfiguration: true, includeInput: false });
  const count = ['insufficient', 'end', 'idle', 'error'].includes(scenario) ? 6 : scenario === 'retry' ? 12 : scenario === 'cost' ? 1000 : 240;
  demo = configureExecutor(demo, DEMO_EXECUTOR_ID, { resource: scenario in DEMO_BOUNDARY_CIDS ? DEMO_BOUNDARY_CIDS[scenario as keyof typeof DEMO_BOUNDARY_CIDS] : scenario === 'cid' ? 'CID://demo-fixed-input' : scenario === 'csv-invalid' ? 'tos://demo/executor/missing-rowkey.csv' : scenario === 'retry' ? 'tos://demo/executor/retry-input.csv' : count === 6 ? 'tos://demo/executor/sample-six.csv' : scenario === 'cost' ? 'tos://demo/executor/cost-input.csv' : 'tos://demo/executor/rowkey-input.csv', count, resourceType: 'video', settings: executorSettings(), runMode: 'stream', streamPolicy: { maxRetries: 0 } });
  demo = { ...demo, executors: demo.executors.filter(e => e.id === DEMO_EXECUTOR_ID), batches: demo.batches.filter(b => b.executorId === DEMO_EXECUTOR_ID) };
  demo = startStream(demo, DEMO_EXECUTOR_ID);
  let e = demo.executors[0];
  if (scenario === 'zero') e.stream!.demoOutcome = 'zero';
  const warmup = scenario === 'cost' ? 550 : ['csv', 'csv-invalid'].includes(scenario) ? 0 : ['estimate', 'cid'].includes(scenario) ? 12 : 32;
  for (let i = 0; i < warmup; i++) { demo = tickStream(demo, DEMO_EXECUTOR_ID, 1200); if (i % 4 === 0) yield; }
  e = demo.executors[0];
  const s = e.stream!, p = e.streamPolicy!;
  if (scenario === 'cost') { p.costLimitCents = s.costCents + 60; p.reminderRatio = 99; s.costLimitCents = p.costLimitCents; }
  if (scenario === 'input') p.inputLimit = s.admitted + 3;
  if (scenario === 'target') p.targetOutputCount = s.stages.at(-1)!.outputs + 3;
  if (scenario === 'time') p.runtimeLimitMs = s.activeRunMs! + 2400;
  if (scenario === 'retry') {
    demo = changeExecutorState(demo, DEMO_EXECUTOR_ID, 'pause');
    demo.executors[0].stream!.reason = '演示准备完成，请在批次操作中重试失败数据';
  }
  if (scenario === 'end') demo = recordStreamSourceEvent(demo, DEMO_EXECUTOR_ID, { kind: 'end' });
  if (scenario === 'error') demo = recordStreamSourceEvent(demo, DEMO_EXECUTOR_ID, { kind: 'error', message: '演示：输入源暂不可用' });
  if (scenario === 'idle') demo = tickStream(demo, DEMO_EXECUTOR_ID, 0, s.source!.lastActivityAt + 600001);
  // Reuse batch identities so repeated demonstrations cannot grow browser storage.
  const previous = workspace.executors.find(e => e.id === DEMO_EXECUTOR_ID);
  const foreignIds = new Set(workspace.batches.filter(b => b.executorId !== DEMO_EXECUTOR_ID).map(b => b.id));
  const canReuse = previous?.runtime?.batchIds.length === demo.batches.length && previous.runtime.batchIds.every(id => !foreignIds.has(id));
  const serial = Math.max(5899, ...workspace.batches.map(b => b.id));
  const identities = demo.batches.map((_, index) => canReuse ? previous!.runtime!.batchIds[index] : serial + index + 1);
  demo.batches.forEach((batch, index) => {
    const stable = identities[index];
    batch.id = stable;
    batch.inputFromBatchId = index ? identities[index - 1] : undefined;
    if (index) batch.inputResource = `CID://stream/${DEMO_EXECUTOR_ID}/${identities[index - 1]}`;
    batch.results = batch.results?.map(row => ({ ...row, batchId: stable, id: `${stable}:${row.id.split(':').slice(1).join(':')}` }));
    demo.executors[0].runtime!.batchIds[index] = stable;
  });
  // Pause other demos: switching must not accumulate background simulation load.
  const executors = workspace.executors.filter(e => e.id !== DEMO_EXECUTOR_ID).map(e => e.runtime?.state === 'running' ? { ...e, runtime: { ...e.runtime, state: 'paused' as const } } : e);
  return { ...workspace, executors: [...executors, ...demo.executors], batches: [...workspace.batches.filter(b => b.executorId !== DEMO_EXECUTOR_ID), ...demo.batches] };
}

export function prepareDemoScenario(workspace: LocalWorkspace, sourceId: string, scenario: DemoScenario): LocalWorkspace {
  const steps = prepareDemoScenarioSteps(workspace, sourceId, scenario);
  for (;;) { const step = steps.next(); if (step.done) return step.value; }
}
/** Cooperatively prepare fixtures so expensive warmups never monopolize the UI thread. */
export async function prepareDemoScenarioAsync(workspace: LocalWorkspace, sourceId: string, scenario: DemoScenario): Promise<LocalWorkspace> {
  const steps = prepareDemoScenarioSteps(workspace, sourceId, scenario);
  for (;;) { await new Promise(resolve => setTimeout(resolve, 0)); const step = steps.next(); if (step.done) return step.value; }
}
