"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/demo-navigation";
import { Alert, Button, Empty, message, Modal, Space, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, PauseOutlined, PlayCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { readWorkspace, useWorkspace, writeWorkspace } from '../data/local-workspace';
import { canExecutorAction, changeExecutorState, executorBatches, initializeExecutor, configureExecutor, tickExecutor, type ExecutorAction, type PublishedGraph } from '../data/executor-runtime';
import type { PipelineDraft } from '../data/mock-pipelines';
import { STATUS_PILL, type BatchRow } from '../data/mock-batches';
import { BatchDetailPanel } from '../project/batch-detail-page';
import { ExecutorConfiguration } from './executor-configuration';
import { executorSettings, batchSuccessRate } from '../data/executor-settings';
import './executor-workbench.css';

const STATES = { ready: '待执行', running: '运行中', paused: '已暂停', waiting: '待人工确认', completed: '已完成', ended: '已结束' } as const;
const BATCH_ACTIONS: Record<string, ExecutorAction> = { 开始: 'start', 暂停: 'pause', 启动: 'resume', 结束: 'end' };

function readPublishedGraphs(flows: PipelineDraft[]): Record<string, PublishedGraph | undefined> {
  return Object.fromEntries(flows.map(flow => {
    const key = flow.graphKey ?? `annotation-demo.published.${flow.id}.v${flow.version ?? 1}`;
    try { return [key, JSON.parse(localStorage.getItem(key) ?? 'null') as PublishedGraph | undefined]; }
    catch { throw new Error('发布版本快照损坏，请检查本机数据'); }
  }));
}

export function ExecutorWorkbench() {
  const router = useRouter();
  const id = useSearchParams().get('id') ?? '';
  const workspace = useWorkspace();
  const executor = workspace.executors.find(item => item.id === id);
  const runtime = executor?.runtime;
  const [viewedBatchId, setViewedBatchId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inputPreviewOpen, setInputPreviewOpen] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [msg, holder] = message.useMessage();
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

  useEffect(() => {
    if (runtime?.state !== 'running') return;
    const timer = window.setInterval(() => {
      try {
        const current = readWorkspace();
        const next = tickExecutor(current, id);
        if (next !== current) writeWorkspace(next);
      } catch { window.clearInterval(timer); setStorageError('浏览器存储失败，模拟已停止推进。修复存储空间后刷新可恢复。'); }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [id, runtime?.state]);

  if (!executor) return <div className="hawk-executor-empty"><Empty description="未找到本地执行器"><Button onClick={() => router.push('/hawk/pipeline')}>返回工作流列表</Button></Empty></div>;
  const batches = executorBatches(workspace, executor);
  const current = batches[runtime?.currentIndex ?? 0];
  const viewed = batches.find(batch => batch.id === viewedBatchId) ?? current;
  const viewedIndex = viewed ? batches.findIndex(batch => batch.id === viewed.id) : 0;
  const back = executor.projectId ? `/hawk/project/detail/${executor.projectId}?tab=${executor.purpose === 'trial' ? 'others' : 'executors'}` : '/hawk/pipeline';
  const openInput = () => setSettingsOpen(true);
  const settings = executorSettings(executor.settings);
  const currentRate = current ? batchSuccessRate(current, settings.filterRule) : null;
  const runAction = (action: ExecutorAction) => {
    try {
      writeWorkspace(changeExecutorState(readWorkspace(), id, action)); setStorageError('');
      if (action === 'start' || action === 'resume') setViewedBatchId(null);
    } catch (error) { msg.error(error instanceof Error ? error.message : '本地状态保存失败，当前进度已保留'); }
  };
  const updateBatch = (patch: Partial<BatchRow>) => {
    if (!viewed) return;
    const currentWorkspace = readWorkspace();
    writeWorkspace({ ...currentWorkspace, batches: currentWorkspace.batches.map(batch => batch.id === viewed.id ? { ...batch, ...patch } : batch) });
  };
  const primaryAction: ExecutorAction = runtime?.state === 'running' ? 'pause' : runtime?.state === 'paused' ? 'resume' : runtime?.state === 'waiting' ? 'confirm' : 'start';
  const primaryLabel = runtime?.state === 'running' ? '暂停运行' : runtime?.state === 'paused' ? '继续运行' : runtime?.state === 'waiting' ? '确认结束并继续' : runtime?.state === 'completed' ? '运行完成' : runtime?.state === 'ended' ? '执行已结束' : '一键运行';
  const batchAction = (action: string): ExecutorAction | undefined => action === '结束' && runtime?.state === 'waiting' ? 'confirm' : BATCH_ACTIONS[action];

  return <div className="hawk-executor-workbench">
    {holder}
    <header className="hawk-executor-header"><Space><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push(back)}>{executor.projectId ? '返回项目' : '返回工作流列表'}</Button><strong>{executor.name}</strong>{executor.purpose === 'trial' && <Tag color="purple">试跑执行器</Tag>}<Tag color={runtime?.state === 'running' ? 'processing' : runtime?.state === 'completed' ? 'success' : 'default'}>{STATES[runtime?.state ?? 'ready']}</Tag></Space><span>本地模拟 · 浏览器保存</span></header>
    {storageError && <Alert type="error" showIcon message={storageError} />}
    <div className="hawk-executor-layout">
      <aside className="hawk-executor-sidebar" aria-label="执行器控制栏">
        <section className="hawk-executor-information">
          <div className="hawk-executor-section-heading"><strong>执行器信息</strong><Button type="text" size="small" icon={<SettingOutlined />} aria-label="输入及执行器配置" disabled={runtime?.state === 'running'} onClick={openInput}>输入及执行器配置</Button></div>
          <div className="hawk-executor-summary"><Tag color="blue">{{ default: '默认模式', rigorous: '严谨模式', target: '目标模式' }[settings.mode]}</Tag>{executor.input ? <Typography.Link href="#executor-input" className="hawk-executor-input-link" title={executor.input} onClick={event => { event.preventDefault(); setInputPreviewOpen(true); }}>{executor.input}</Typography.Link> : <Button type="link" size="small" onClick={openInput}>待配置输入</Button>}</div>
        </section>
        <section className="hawk-executor-queue"><div className="hawk-executor-section-heading"><strong>运行关联</strong><span>{batches.filter(batch => batch.status === '已导出').length} / {batches.length} 已完成</span></div>
          <ol>{batches.map((batch, index) => <li key={batch.id} className={(batch.id === viewed?.id ? 'is-selected ' : '') + (batch.id === current?.id ? 'is-current' : '')}><button aria-label={`查看第${index + 1}步 ${batch.name}`} aria-current={batch.id === viewed?.id ? 'step' : undefined} onClick={() => setViewedBatchId(batch.id)}><span className="hawk-executor-step-number">{batch.status === '已导出' ? <CheckCircleOutlined /> : index + 1}</span><span className="hawk-executor-step-content"><strong>{batch.name}</strong><small>批次 {batch.id}{batch.id === current?.id && !['completed', 'ended'].includes(runtime?.state ?? '') ? ' · 当前执行项' : ''}</small><code>{batch.workflow}</code></span><span className="hawk-executor-step-status" style={{ color: STATUS_PILL[batch.status].color, background: STATUS_PILL[batch.status].bg }}>{batch.status}</span></button></li>)}</ol>
          {!batches.length && <Typography.Text type="secondary">正在准备关联批次…</Typography.Text>}
        </section>
        <footer className="hawk-executor-sidebar-footer">{runtime?.state === 'waiting' && current?.failed > 0 && <Button block onClick={() => runAction('retry')}>重试失败数据（{current.failed} 条）</Button>}<Button block type="primary" size="large" icon={runtime?.state === 'running' ? <PauseOutlined /> : <PlayCircleOutlined />} disabled={Boolean(storageError) || !canExecutorAction(workspace, executor, primaryAction)} onClick={() => runAction(primaryAction)}>{primaryLabel}</Button><p>{runtime?.state === 'waiting' ? '核对当前结果后，确认结束并接续下一步。' : runtime?.state === 'paused' ? '当前进度已保留，继续后接着处理。' : runtime?.state === 'completed' ? '全部批次已完成本地模拟，结果可按批次查看。' : runtime?.started ? '按本次执行模式判断是否自动接续。' : '先配置本次输入，再按既定顺序一键运行。'}</p></footer>
      </aside>
      <main className="hawk-executor-main" aria-label="执行器批次详情">
        {runtime?.state === 'waiting' && <Alert className="hawk-executor-waiting" type={runtime.urgent ? 'error' : 'warning'} showIcon message={runtime.urgent ? '加急 · 需要人工处理（本地提醒）' : '等待人工确认'} description={runtime.reason} />}
        {runtime?.phase === 'retrying' && <Alert type="info" showIcon message={`仅重试当前批次失败数据 · 第 ${runtime.retryCounts?.[current?.id] ?? 1} 次（本地模拟）`} />}
        {viewed ? <><div className="hawk-executor-viewing"><span>查看批次 {viewedIndex + 1} / {batches.length}{runtime?.state === 'running' && runtime.phase === 'exporting' && viewed.id === current?.id ? ' · 本地模拟导出中' : ''}{settings.mode === 'target' && currentRate !== null ? ` · 当前批次成功率 ${currentRate.toFixed(1)}%` : ''}</span></div><BatchDetailPanel key={viewed.id} batch={viewed} projectName={workspace.projects.find(project => project.id === executor.projectId)?.name ?? '未关联项目'} onUpdate={updateBatch} execution={{
          inputSource: viewedIndex ? `来自本执行器第 ${viewedIndex} 步 · Batch ${batches[viewedIndex - 1].id}` : '本次输入',
          showInputSource: false,
          waiting: viewedIndex > 0 && !viewed.inputResource,
          inputEditable: viewedIndex === 0 && !runtime?.started,
          onEditInput: openInput,
          canAction: action => Boolean(batchAction(action) && viewed.id === current?.id && canExecutorAction(workspace, executor, batchAction(action)!)),
          onAction: action => { const resolved = batchAction(action); if (resolved) runAction(resolved); },
        }} /></> : <Empty description={storageError ? '关联批次未能载入' : '正在准备关联批次'} />}
        <p className="hawk-executor-prototype-note">本地模拟仅演示状态与接续；不调用算子或模型，不生成真实交付。下载内容为本地记录元数据。</p>
      </main>
    </div>
    {settingsOpen && <ExecutorConfiguration executor={executor} onCancel={() => setSettingsOpen(false)} onSave={values => {
      writeWorkspace(configureExecutor(readWorkspace(), id, values));
      setSettingsOpen(false); setStorageError(''); msg.success('输入及执行器配置已保存到本机');
    }} />}
    <Modal title="执行器输入资源" open={inputPreviewOpen} onCancel={() => setInputPreviewOpen(false)} footer={<Button onClick={() => setInputPreviewOpen(false)}>关闭</Button>}><Typography.Paragraph copyable style={{ overflowWrap: 'anywhere' }}>{executor.input}</Typography.Paragraph><Typography.Text type="secondary">本次执行器的初始输入；后续批次使用前一步成功产出。</Typography.Text></Modal>
  </div>;
}
