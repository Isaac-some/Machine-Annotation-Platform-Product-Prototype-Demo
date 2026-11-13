"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/demo-navigation";
import { Alert, Button, Empty, message, Modal, Space, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, PauseOutlined, PlayCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { readWorkspace, useWorkspace, writeWorkspace, WORKSPACE_RESUME_EVENT } from '../data/local-workspace';
import { canExecutorAction, changeExecutorState, executorBatches, initializeExecutor, configureExecutor, type ExecutorAction, type PublishedGraph } from '../data/executor-runtime';
import type { PipelineDraft } from '../data/mock-pipelines';
import { STATUS_PILL, type BatchRow } from '../data/mock-batches';
import { withDeliveryExamples } from '../data/delivery-examples';
import { setExecutorDelivery } from '../data/delivery';
import { BatchDetailPanel } from '../project/batch-detail-page';
import { ExecutorProductionCalculator } from './executor-production-calculator';
import { ExecutorConfiguration } from './executor-configuration';
import { executorSettings, batchSuccessRate } from '../data/executor-settings';
import './executor-workbench.css';
import { retryStreamStage, toggleStreamStage, streamLimitBlocks } from '../data/executor-streaming';
import { ExecutorStreamPanel, ExecutorCloneButton } from './executor-stream-panel';
import { withPhase2Examples } from '../data/phase2-examples';
import { resumeProductionForecast } from '../data/executor-resume-forecast';
import { beginDemoScenario } from '../data/executor-demo-scenarios';

const STATES = { ready: '待执行', running: '运行中', paused: '已暂停', waiting: '待人工确认', completed: '已完成', ended: '已结束' } as const;
const BATCH_ACTIONS: Record<string, ExecutorAction> = { 开始: 'start', 暂停: 'pause', 启动: 'resume', 结束: 'finish-batch' };

function readPublishedGraphs(flows: PipelineDraft[]): Record<string, PublishedGraph | undefined> {
  return Object.fromEntries(flows.map(flow => {
    const key = flow.graphKey ?? `annotation-demo.published.${flow.id}.v${flow.version ?? 1}`;
    try { return [key, JSON.parse(localStorage.getItem(key) ?? 'null') as PublishedGraph | undefined]; }
    catch { throw new Error('发布版本快照损坏，请检查本机数据'); }
  }));
}

export function ExecutorWorkbench() {
  const router = useRouter();
  const query = useSearchParams();
  const id = query.get('id') ?? '';
  const example = query.get('example');
  const showExample = example === 'delivery' || example === 'phase2';
  useEffect(() => {
    if (!showExample) return;
    const current = readWorkspace(), next = example === 'phase2' ? withPhase2Examples(current) : withDeliveryExamples(current);
    if (next !== current) writeWorkspace(next);
  }, [showExample, example]);
  const workspace = useWorkspace();
  const executor = workspace.executors.find(item => item.id === id);
  const runtime = executor?.runtime;
  const awaitingDemo = Boolean(executor?.stream?.demoPlayback?.awaitingStart);
  const [viewedBatchId, setViewedBatchId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(query.get('panel') === 'configuration');
  const [limitNoticeOpen, setLimitNoticeOpen] = useState(false);
  const [limitCalculatorOpen, setLimitCalculatorOpen] = useState(false);
  const [trialSummary, setTrialSummary] = useState<string>();
  const [inputPreviewOpen, setInputPreviewOpen] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [msg, holder] = message.useMessage();
  const [modal, modalHolder] = Modal.useModal();
  const exists = Boolean(executor), initialized = Boolean(runtime);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active || !exists || initialized) return;
      try {
        const current = readWorkspace();
        const item = current.executors.find(item => item.id === id);
        if (!item) return;
        const next = initializeExecutor(current, id, readPublishedGraphs(item.flows));
        if (next !== current) writeWorkspace(next);
      } catch (error) { setStorageError(error instanceof Error ? error.message : '本地批次初始化失败'); }
    });
    return () => { active = false; };
  }, [id, exists, initialized]);


  if (!executor) return <div className="hawk-executor-empty"><Empty description="未找到本地执行器"><Button onClick={() => router.push('/hawk/pipeline')}>返回工作流列表</Button></Empty></div>;
  const batches = executorBatches(workspace, executor);
  const current = batches[runtime?.currentIndex ?? 0];
  const viewed = batches.find(batch => batch.id === viewedBatchId) ?? current;
  const viewedIndex = viewed ? batches.findIndex(batch => batch.id === viewed.id) : 0;
  const back = executor.projectId ? `/hawk/project/detail/${executor.projectId}?tab=${executor.purpose === 'trial' ? 'others' : 'executors'}` : '/hawk/pipeline';
  const openInput = () => setSettingsOpen(true);
  const settings = executorSettings(executor.settings);
  const currentRate = current ? batchSuccessRate(current, settings.filterRule) : null;
  const executeAction = async (action: ExecutorAction) => {
    try {
      const current = readWorkspace();
      const next = awaitingDemo && action === 'resume' ? beginDemoScenario(current, id) : changeExecutorState(current, id, action);
      if (!await writeWorkspace(next)) throw new Error('本地保存失败，操作未生效');
      setStorageError('');
      if (action === 'start' || action === 'resume') { window.dispatchEvent(new Event(WORKSPACE_RESUME_EVENT)); setViewedBatchId(null); }
    } catch (error) { msg.error(error instanceof Error ? error.message : '本地状态保存失败，当前进度已保留'); }
  };
  const runAction = (action: ExecutorAction) => {
    if (action === 'end' && executor.runMode === 'stream') {
      modal.confirm({ title: '结束执行器？', content: '结束后永久停止从源头取数，不能恢复。已有批次继续处理，导出仍由批次负责。', okText: '确认结束', cancelText: '取消', onOk: () => executeAction('end') }); return;
    }
    if (action === 'resume' && executor.runMode === 'stream' && !awaitingDemo) {
      const latest = readWorkspace().executors.find(item => item.id === id);
      if (latest && streamLimitBlocks(latest).length) { setLimitNoticeOpen(true); return; }
      const forecast = resumeProductionForecast(executor), p = executor.streamPolicy;
      modal.confirm({ title: '确认继续运行', className: 'hawk-executor-resume-modal', width: 600, okText: '确认继续', cancelText: '取消', content: <div className="hawk-executor-resume-notice">
        <p className="hawk-executor-resume-status">{executor.stream?.clearedLimits?.length ? `已解除：${executor.stream.clearedLimits.join('、')}` : '当前无运行限制阻断'}</p>
        <dl><dt>成本累计上限</dt><dd className={p?.costLimitCents === undefined ? 'is-unset' : undefined}>{p?.costLimitCents === undefined ? '未设置' : `¥${(p.costLimitCents/100).toFixed(2)}`}</dd><dt>取入累计上限</dt><dd className={p?.inputLimit === undefined ? 'is-unset' : undefined}>{p?.inputLimit === undefined ? '未设置' : `${p.inputLimit} 条`}</dd><dt>累计成品目标</dt><dd className={p?.targetOutputCount === undefined ? 'is-unset' : undefined}>{p?.targetOutputCount === undefined ? '未设置' : `${p.targetOutputCount} 份`}</dd></dl>
        {[p?.costLimitCents, p?.inputLimit, p?.targetOutputCount, p?.targetOutputPercent].every(value => value === undefined) && <div className="hawk-executor-resume-unlimited"><strong>当前未设置运行限制</strong><p>确认继续后，执行器将持续读取并处理所配置输入源中的可用资源；<b>只要输入源持续有资源可处理，就会持续运行。</b></p></div>}
        <Alert type="info" showIcon message={forecast.base === undefined ? '暂无法综合估算新增成品' : forecast.low === undefined || forecast.high === undefined || forecast.low === forecast.high ? `预计新增约 ${forecast.base.toLocaleString()} 份` : `预计新增 ${forecast.low.toLocaleString()}–${forecast.high.toLocaleString()} 份`} description={forecast.reason ?? '按同批已完成生产观测估算，取各项限制支持产量的较小值。以供数充足、资源相近为前提；实际产出及在途收尾可能超出参考值。'} />
        <p className="hawk-executor-resume-footnote">估算仅供参考，不是新的取入上限。确认时将再次校验全部限制及当前可运行状态。</p>
      </div>, onOk: () => executeAction('resume') }); return;
    }
    if (action !== 'start' || executor.runMode !== 'stream') { void executeAction(action); return; }
    const p = executor.streamPolicy;
    const limits = [
      p?.costLimitCents ? { label: '成本上限', value: `¥${(p.costLimitCents / 100).toFixed(2)}` } : undefined,
      p?.inputLimit ? { label: '最多取入', value: `${p.inputLimit.toLocaleString()} 条` } : undefined,
      p?.targetOutputPercent !== undefined ? { label: '目标成品', value: `${p.targetOutputPercent.toFixed(1)}% 输入量` } : p?.targetOutputCount ? { label: '目标成品', value: `${p.targetOutputCount.toLocaleString()} 份` } : undefined,
    ].filter(item => item !== undefined);
    const missing = [['成本上限', p?.costLimitCents], ['取数条数上限', p?.inputLimit]].filter(([, value]) => value === undefined).map(([label]) => label);
    modal.confirm({ title: '确认本轮输入与运行范围', okText: '确认一键运行', cancelText: '检查配置', width: 560,
      content: <div className="hawk-executor-start-notice">
        <p className="hawk-executor-start-input">本轮输入 <strong>{/\.csv(?:$|[?#])/i.test(executor.input ?? '') ? 'CSV：读取校验完成后显示总量' : `${executor.inputCount?.toLocaleString()} 条`}</strong></p>
        {limits.length > 0 && <dl className="hawk-executor-start-limits">{limits.map(limit => <div key={limit.label}><dt>{limit.label}</dt><dd>{limit.value}</dd></div>)}</dl>}
        {missing.length > 0 && <ul className="hawk-executor-unset-limits">{missing.map(label => <li key={label}>{label}未设置</li>)}</ul>}
        <p>未设置的项目不限制运行；暂时无数据时等待，达到限制后停止新增、在途收尾。</p>
      </div>,
      onOk: () => executeAction(action),
    });
  };
  const updateBatch = (patch: Partial<BatchRow>) => {
    if (!viewed) return;
    const currentWorkspace = readWorkspace();
    writeWorkspace({ ...currentWorkspace, batches: currentWorkspace.batches.map(batch => batch.id === viewed.id ? { ...batch, ...patch } : batch) });
  };
  const confirmRetry = (stage: number) => {
    if (awaitingDemo) { msg.info('请先点击开始演示，再选择要重试的环节'); return; }
    const failures = executor.stream?.failures.filter(token => token.stage === stage).length ?? 0;
    if (executor.stream?.stageRecovery) { msg.info('已有失败数据正在重试，请等待本轮结束'); return; }
    if (!failures) { msg.info('该批次没有失败数据'); return; }
    if (runtime?.state === 'running') { msg.info('请先暂停执行器，再重试该批次失败数据'); return; }
    modal.confirm({ title: `重试「${executor.flows[stage]?.name}」的 ${failures} 条失败数据？`, content: '仅重试失败环节，成功后继续下游；原有正常队列和成功结果保留，重试结束后保持暂停。费用继续累计。', okText: '确认重试', cancelText: '取消', onOk: () => { try { writeWorkspace(retryStreamStage(readWorkspace(), id, stage)); } catch (error) { msg.error(error instanceof Error ? error.message : '重试失败'); } } });
  };
  const primaryAction: ExecutorAction = runtime?.state === 'running' ? 'pause' : runtime?.state === 'paused' ? 'resume' : runtime?.state === 'waiting' ? executor.runMode === 'stream' ? 'resume' : 'confirm' : 'start';
  const draining = executor.stream?.phase === 'draining';
  const reachedLimits = streamLimitBlocks(executor);
  const canExplainReachedLimits = executor.runMode === 'stream' && ['paused', 'waiting'].includes(runtime?.state ?? '') && !draining && executor.stream?.phase !== 'completed' && !executor.stream?.endedIntake && reachedLimits.length > 0;
  const inFlight = new Set(executor.stream?.queues.flat().map(token => token.root) ?? []).size;
  const displayState = runtime?.state === 'ended' ? '已结束' : awaitingDemo ? '待开始演示' : draining ? '收尾中' : executor.stream?.phase === 'review' ? '等待人工决定' : executor.stream?.source?.waiting && runtime?.state === 'running' ? '运行中 · 等待新数据' : STATES[runtime?.state ?? 'ready'];
  const primaryLabel = runtime?.state === 'ended' ? '执行已结束' : awaitingDemo ? '开始演示' : draining ? '收尾中' : executor.runMode === 'stream' && runtime?.state === 'waiting' ? '继续运行' : runtime?.state === 'running' ? '暂停运行' : runtime?.state === 'paused' ? '继续运行' : runtime?.state === 'waiting' ? '确认结束并继续' : runtime?.state === 'completed' ? '运行完成' : '一键运行';
  const batchAction = (action: string): ExecutorAction | undefined => BATCH_ACTIONS[action];

  return <div className="hawk-executor-workbench">
    {holder}{modalHolder}
    <header className="hawk-executor-header"><Space><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push(back)}>{executor.projectId ? '返回项目' : '返回工作流列表'}</Button><h1 className="hawk-executor-page-title">{executor.name}</h1>{executor.purpose === 'trial' && <Tag color="purple">试跑执行器</Tag>}<Tag color={runtime?.state === 'running' ? 'processing' : runtime?.state === 'completed' ? 'success' : 'default'}>{displayState}</Tag></Space><Space wrap><ExecutorCloneButton executor={executor} /><span>本地模拟 · 浏览器保存</span></Space></header>
    {storageError && <Alert type="error" showIcon message={storageError} />}
    <div className="hawk-executor-layout">
      <aside className="hawk-executor-sidebar" aria-label="执行器控制栏">
        <section className="hawk-executor-information">
          <div className="hawk-executor-section-heading"><strong>执行器信息</strong><Button type="text" size="small" icon={<SettingOutlined />} aria-label="输入及执行器配置" onClick={openInput}>输入及执行器配置</Button></div>
          <div className="hawk-executor-summary"><Tag color="blue">{executor.runMode === 'stream' ? '流式运行' : { default: '默认模式', rigorous: '严谨模式', target: '目标模式' }[settings.mode]}</Tag></div>
          <div className="hawk-executor-resource"><span>输入资源</span>{executor.input ? <Typography.Link href="#executor-input" className="hawk-executor-input-link" title={executor.input} onClick={event => { event.preventDefault(); setInputPreviewOpen(true); }}>{executor.input}</Typography.Link> : <Button type="link" size="small" onClick={openInput}>添加本次输入资源</Button>}</div>
          {executor.runMode === 'stream' && <ExecutorStreamPanel executor={executor} onConfigure={summary => { setTrialSummary(summary); setSettingsOpen(true); }} />}
        </section>
        <section className="hawk-executor-queue"><div className="hawk-executor-section-heading"><strong>运行关联</strong><span>{batches.filter(batch => executor.runMode === 'stream' ? batch.status === '已完成' : batch.status === '已导出' || batch.finish?.phase === 'done').length} / {batches.length} 已完成</span></div>
          <ol>{batches.map((batch, index) => <li key={batch.id} className={(batch.id === viewed?.id ? 'is-selected ' : '') + (batch.id === current?.id ? 'is-current' : '')}><button aria-label={`查看第${index + 1}步 ${batch.name}`} aria-current={batch.id === viewed?.id ? 'step' : undefined} onClick={() => setViewedBatchId(batch.id)}><span className="hawk-executor-step-number">{batch.status === '已导出' || batch.finish?.phase === 'done' ? <CheckCircleOutlined /> : index + 1}</span><span className="hawk-executor-step-content"><strong>{batch.name}</strong><small>批次 {batch.id}{batch.id === current?.id && !['completed', 'ended'].includes(runtime?.state ?? '') ? ' · 当前执行项' : ''}</small><code>{batch.workflow}</code></span><span className="hawk-executor-step-status" style={{ color: STATUS_PILL[batch.status].color, background: STATUS_PILL[batch.status].bg }}>{batch.status}</span></button></li>)}</ol>
          {!batches.length && <Typography.Text type="secondary">正在准备关联批次…</Typography.Text>}
        </section>
        <footer className="hawk-executor-sidebar-footer">{executor.runMode !== 'stream' && runtime?.state === 'waiting' && current?.failed > 0 && <Button block onClick={() => runAction('retry')}>重试失败数据（{current.failed} 条）</Button>}<Button aria-label={primaryLabel} block type="primary" size="large" icon={runtime?.state === 'running' ? <PauseOutlined /> : <PlayCircleOutlined />} disabled={Boolean(storageError) || Boolean(runtime?.state === 'waiting' && current?.finish) || !awaitingDemo && !canExplainReachedLimits && !canExecutorAction(workspace, executor, primaryAction)} onClick={() => runAction(primaryAction)}>{primaryLabel}</Button>{executor.runMode === 'stream' && canExecutorAction(workspace, executor, 'end') && <Button block onClick={() => runAction('end')}>结束执行器</Button>}<p>{awaitingDemo ? '演示数据已准备，点击“开始演示”后才会推进。' : draining ? `已停止新增取入；已取入 ${executor.stream!.admitted} 条，在途剩余 ${inFlight} 条。收尾期间费用可能增加，完成后停止。` : executor.runMode === 'stream' && executor.stream?.reason ? executor.stream.reason : executor.runMode === 'stream' ? (runtime?.started ? '达到任一运行上限后先完成已取入的数据；是否再投由你决定。' : '启动时确认本轮输入，成本、取入上限与成品目标均可选。') : runtime?.state === 'waiting' ? '核对当前结果后，确认结束并接续下一步。' : runtime?.state === 'paused' ? '当前进度已保留，继续后接着处理。' : runtime?.state === 'completed' ? '全部批次已完成本地模拟，结果可按批次查看。' : runtime?.started ? '按本次执行模式判断是否自动接续。' : '先配置本次输入，再按既定顺序一键运行。'}</p></footer>
      </aside>
      <main className="hawk-executor-main" aria-label="执行器批次详情">
        {executor.runMode !== 'stream' && runtime?.state === 'waiting' && <Alert className="hawk-executor-waiting" type={runtime.urgent ? 'error' : 'warning'} showIcon message={runtime.urgent ? '加急 · 需要人工处理（本地提醒）' : '等待人工确认'} description={runtime.reason} />}

        {runtime?.phase === 'retrying' && <Alert type="info" showIcon message={`仅重试当前批次失败数据 · 第 ${runtime.retryCounts?.[current?.id] ?? 1} 次（本地模拟）`} />}
        {viewed ? <><div className="hawk-executor-viewing"><span>查看批次 {viewedIndex + 1} / {batches.length}{runtime?.state === 'running' && runtime.phase === 'exporting' && viewed.id === current?.id ? ' · 本地模拟导出中' : ''}{settings.mode === 'target' && currentRate !== null ? ` · 当前批次成功率 ${currentRate.toFixed(1)}%` : ''}</span><div className="hawk-executor-batch-caption"><strong>{viewed.name}</strong><span>批次 ID {viewed.id} · {viewed.workflow}</span></div></div><BatchDetailPanel key={viewed.id} batch={viewed} projectName={workspace.projects.find(project => project.id === executor.projectId)?.name ?? '未关联项目'} onUpdate={updateBatch} execution={{
          runMode: executor.runMode,
          activeRunMs: executor.runMode === 'stream' ? (runtime?.started ? executor.stream?.stageActiveMs?.[viewedIndex] : 0) : undefined,
          showRunClock: executor.runMode === 'stream',
          inputSource: viewedIndex ? `来自本执行器第 ${viewedIndex} 步 · Batch ${batches[viewedIndex - 1].id}` : '本次输入',
          showInputSource: false,
          showBatchCaption: false,
          waiting: viewedIndex > 0 && !viewed.inputResource,
          inputEditable: viewedIndex === 0 && !runtime?.started,
          onEditInput: openInput,
          canAction: action => executor.runMode === 'stream' ? action === '重试' || !executor.stream?.stageRecovery && (runtime?.state === 'running' || Boolean(executor.stream?.endedIntake && draining)) && (action === '暂停' && !executor.stream?.pausedStages?.includes(viewedIndex) || action === '启动' && Boolean(executor.stream?.pausedStages?.includes(viewedIndex))) : Boolean(batchAction(action) && viewed.id === current?.id && canExecutorAction(workspace, executor, batchAction(action)!)),
          onAction: action => { if (executor.runMode === 'stream' && action === '重试') { confirmRetry(viewedIndex); return; } if (executor.runMode === 'stream' && ['暂停', '启动'].includes(action)) { writeWorkspace(toggleStreamStage(readWorkspace(), id, viewedIndex)); return; } const resolved = batchAction(action); if (resolved) runAction(resolved); },
        }} /></> : <Empty description={storageError ? '关联批次未能载入' : '正在准备关联批次'} />}
        <p className="hawk-executor-prototype-note">本地模拟不调用算子或模型；交付文件包含合成示例结果。关闭页面后暂停模拟，重新打开后继续。</p>
      </main>
    </div>
    <Modal title="已达到运行上限" className="hawk-executor-limit-notice" open={limitNoticeOpen} centered width={560} onCancel={() => setLimitNoticeOpen(false)} footer={<Space wrap>
      <Button onClick={() => setLimitNoticeOpen(false)}>关闭</Button>
      <Button onClick={() => { setLimitNoticeOpen(false); setLimitCalculatorOpen(true); }}>去估算</Button>
      <Button type="primary" onClick={() => { setLimitNoticeOpen(false); setSettingsOpen(true); }}>去配置</Button>
    </Space>}>
      <p>执行器已因达到设定的上限而暂停取数。如需继续，请先前往配置提高或取消已达到的上限。</p>
      <ul>{reachedLimits.map(limit => <li key={limit}>{limit}已达到</li>)}</ul>
      <p>多项上限同时达到时，需要全部调整。保存配置后仍保持暂停，请再次点击“继续运行”。</p>
    </Modal>
    {limitCalculatorOpen && <ExecutorProductionCalculator executor={executor} onClose={() => setLimitCalculatorOpen(false)} onConfigure={summary => { setLimitCalculatorOpen(false); setTrialSummary(summary); setSettingsOpen(true); }} />}
    {settingsOpen && <ExecutorConfiguration executor={executor} summary={trialSummary} onCancel={() => { setSettingsOpen(false); setTrialSummary(undefined); }} onSave={async values => {
      const current = readWorkspace(), latest = current.executors.find(item => item.id === id)!;
      const configured = configureExecutor(current, id, { ...values, count: latest.runtime?.started ? latest.inputCount! : values.count });
      const next = runtime?.started ? configured : setExecutorDelivery(configured, id, values.deliveryMode);
      if (!await writeWorkspace(next)) throw new Error('配置保存失败，原配置已保留，请重试');
      setSettingsOpen(false); setTrialSummary(undefined); setStorageError(''); msg.success('输入及执行器配置已保存到本机');
    }} />}
    <Modal title="执行器输入资源" open={inputPreviewOpen} onCancel={() => setInputPreviewOpen(false)} footer={<Button onClick={() => setInputPreviewOpen(false)}>关闭</Button>}><Typography.Paragraph copyable style={{ overflowWrap: 'anywhere' }}>{executor.input}</Typography.Paragraph><Typography.Text type="secondary">本次执行器的初始输入；后续批次使用前一步成功产出。</Typography.Text></Modal>
  </div>;
}
