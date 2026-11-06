'use client';
import { useState } from 'react';
import { Alert, Button, Descriptions, Input, InputNumber, Modal, Progress, Switch, Table, Tag, Typography, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useRouter } from '@/lib/demo-navigation';
import { readWorkspace, writeWorkspace, type LocalExecutor } from '../data/local-workspace';
import { cloneExecutor } from '../data/executor-runtime';
import { continueStreamManually, effectiveTargetOutputCount, retryStreamStage, setStreamCostLimit } from '../data/executor-streaming';
import './executor-stream-panel.css';
import { ExecutorProductionCalculator } from './executor-production-calculator';
import { ExecutorSettingRow } from './executor-setting-row';
const PHASES = { production: '连续生产', draining: '收尾中', review: '等待人工决定', completed: '本次输入已完成' };
const money = (cents: number) => `¥ ${(cents / 100).toFixed(2)}`;

export function ExecutorCloneButton({ executor }: { executor: LocalExecutor }) {
  const router = useRouter(), [open, setOpen] = useState(false), [name, setName] = useState(''), [config, setConfig] = useState(true), [input, setInput] = useState(false), [error, setError] = useState('');
  return <><Button aria-label="克隆执行器" icon={<CopyOutlined />} onClick={() => { setError(''); setOpen(true); setName(`${executor.name} · 克隆`); }}>克隆执行器</Button><Modal title="克隆配置预览" open={open} onCancel={() => setOpen(false)} okText="创建新执行器" onOk={() => {
    try { const w = readWorkspace(), next = cloneExecutor(w, executor.id, { name, includeInput: input, includeConfiguration: config }); writeWorkspace(next); setOpen(false); router.push(`/hawk/pipeline/executor/?id=${next.executors.at(-1)!.id}`); } catch (e) { setError(e instanceof Error ? e.message : '克隆失败'); }
  }}>
    {error && <Alert type="error" message={error} />}
    <Typography.Paragraph>新实例使用独立批次、结果与费用记录。启动前可重新设置成本预估和可选上限。</Typography.Paragraph>
    <Input aria-label="克隆名称" value={name} onChange={e => setName(e.target.value)} />
    <div className="hawk-executor-setting-group">
      <ExecutorSettingRow title="继承当前配置" description="保留执行器、工作流与节点的实际配置；关闭后使用来源发布版本。"><Switch aria-label="继承当前配置" checked={config} onChange={value => { setConfig(value); setError(''); }} /></ExecutorSettingRow>
      <ExecutorSettingRow title="带入本次输入资源" description="复制资源标识和输入数量，启动前仍需核对字段。"><Switch aria-label="带入本次输入资源" checked={input} onChange={value => { setInput(value); setError(''); }} /></ExecutorSettingRow>
    </div>
    <Descriptions size="small" column={1} bordered items={[
      { key: 'config', label: '配置来源', children: config ? '当前实例实际配置' : '来源发布版本原始配置；版本不可用则阻断' },
      { key: 'input', label: '输入与字段', children: input ? '带入资源；启动前按本次输入重新核对字段' : '待配置新输入；按新输入重算字段依赖' },
      { key: 'budget', label: '成本', children: config ? '继承单条成本预估；总成本上限需按本次输入重新设置' : '重新设置单条成本预估与总成本上限' },
      { key: 'reset', label: '不继承', children: '累计费用、进度、重试次数、结果、输出 CID、导出记录' },
    ]} />
    <Alert style={{ marginTop: 16 }} type="info" showIcon message="原型展示配置隔离；生产字段依赖校验与真实资源重新绑定仍需联调。" />
  </Modal></>;
}

export function ExecutorStreamPanel({ executor: e }: { executor: LocalExecutor }) {
  const [open, setOpen] = useState(false), [limitOpen, setLimitOpen] = useState(false), [limit, setLimit] = useState<number | null>(null), [calculatorOpen, setCalculatorOpen] = useState(false), [msg, holder] = message.useMessage();
  const act = (fn: (w: ReturnType<typeof readWorkspace>, id: string) => ReturnType<typeof readWorkspace>) => { try { writeWorkspace(fn(readWorkspace(), e.id)); } catch (issue) { msg.error(issue instanceof Error ? issue.message : '操作失败'); } };
  const s = e.stream;
  const stages = e.flows.map((flow, index) => ({ key: index, name: flow.name, ...(s?.stages[index] ?? { processed: 0, failed: 0, outputs: 0, costCents: 0 }), queued: (s?.queues[index]?.length ?? 0) + (s?.stageRecovery?.queues[index]?.length ?? 0) }));
  const finalOutputs = stages.at(-1)?.outputs ?? 0, observed = s?.settledInputs ?? 0, total = e.inputCount ?? 0;
  const cost = s?.costCents ?? 0, cap = s?.costLimitCents ?? e.streamPolicy?.costLimitCents;
  const costLimitBlocks = Boolean(cap && cost >= cap && (e.streamPolicy?.costLimitAction ?? 'drain') !== 'continue');
  const retry = (index: number) => {
    const failed = s?.failures.filter(token => token.stage === index).length ?? 0;
    if (s?.stageRecovery) { msg.info('已有失败数据正在重试，请等待本轮结束'); return; }
    if (!failed) { msg.info('该环节没有失败数据'); return; }
    if (e.runtime?.state === 'running') { msg.info('请先暂停执行器，再重试该环节失败数据'); return; }
    Modal.confirm({ title: `重试「${e.flows[index].name}」的 ${failed} 条失败数据？`, content: '仅重试失败环节，成功后继续下游；原有正常队列和成功结果保留，重试结束后保持暂停。费用继续累计。', okText: '确认重试', cancelText: '取消', onOk: () => act(w => retryStreamStage(w, e.id, index)) });
  };
  return <>
    {holder}<button type="button" className="hawk-executor-cost-summary" aria-label="累计费用与运行详情" onClick={() => setOpen(true)}>
      <span>累计费用</span><span className="hawk-executor-cost-link">运行详情 ↗</span><strong>{money(cost)}</strong><small>{cap ? `成本上限 ${money(cap)} · 触顶${(e.streamPolicy?.costLimitAction ?? 'drain') === 'continue' ? '仅提醒继续' : '停止新增'}` : '未设成本上限'}</small>
    </button>
    <Modal title="累计费用与运行详情" className="hawk-stream-detail-modal" centered open={open} onCancel={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>关闭</Button>} width={1120}>
      <section className="hawk-stream-panel" aria-label="执行器成本与运行">
        <div className="hawk-stream-heading"><div className="hawk-stream-title"><strong>{s ? e.runtime?.state === 'paused' ? '已暂停' : PHASES[s.phase] : '等待开始运行'}</strong>{s && <Tag>{s.stageRecovery ? '失败数据重试中' : s.control === 'manual' ? '人工控制' : '自动连续'}</Tag>}</div><span className="hawk-stream-data-source">本地模拟数据</span></div>
        <div className="hawk-stream-bento">
          <div className="hawk-stream-spend"><span>实际累计费用</span><strong>{money(cost)}</strong><div><span>{cap ? `成本上限 ${money(cap)}` : '未设置成本上限'}</span>{s && !['draining', 'completed'].includes(s.phase) && <Button type="text" size="small" onClick={() => { setLimit(cap ? cap / 100 : null); setLimitOpen(true); }}>调整成本上限</Button>}</div>{cap && <Progress percent={Math.min(100, Number((cost / cap * 100).toFixed(1)))} showInfo={false} strokeColor="#273444" />}<small>{s?.retryRound ?? 0} / {e.streamPolicy?.maxRetries ?? 0} 轮自动重试 · 费用包含失败与重试</small>{s && <Button className="hawk-stream-estimate-button" onClick={() => setCalculatorOpen(true)}>投入与产量试算</Button>}</div>
          <div className="hawk-stream-output"><span>可交付成品</span><strong>{finalOutputs.toLocaleString()}<small> 份</small></strong>{effectiveTargetOutputCount(e.streamPolicy ?? { maxRetries: 0 }, e.inputCount ?? 0) && <span>目标 {effectiveTargetOutputCount(e.streamPolicy ?? { maxRetries: 0 }, e.inputCount ?? 0)?.toLocaleString()} 份{e.streamPolicy?.targetOutputPercent !== undefined ? `（本轮输入 ${e.streamPolicy.targetOutputPercent.toFixed(1)}%）` : ''}</span>}<span>实际单份成本 {finalOutputs ? `¥ ${(cost / finalOutputs / 100).toFixed(4)}` : '—'}</span></div>
          <div className="hawk-stream-completion"><div><span>已完成输入</span><strong>{observed.toLocaleString()} <small>/ {total.toLocaleString()} 条</small></strong></div><Progress percent={total ? Math.round(observed / total * 100) : 0} strokeColor="#1d5fbf" /></div>
          </div>
        {s?.reason && <Alert type={s.phase === 'draining' || s.phase === 'review' ? 'warning' : 'info'} showIcon message={s.reason} />}
        {s?.reminded && <Alert type="warning" showIcon message={`费用已达到成本上限的 ${e.streamPolicy?.reminderRatio}%，触发提前提醒；提醒不会暂停运行。`} />}
        {s?.triggerCostCents !== undefined && <Descriptions size="small" bordered column={3} items={[{ key: 'trigger', label: '触发费用', children: money(s.triggerCostCents) }, { key: 'extra', label: s.triggerCostAction === 'continue' ? '触顶后新增费用' : '收尾新增费用', children: money((s.drainFinalCents ?? cost) - s.triggerCostCents) }, { key: 'total', label: s.drainFinalCents === undefined ? '当前费用' : '收尾最终费用', children: money(s.drainFinalCents ?? cost) }]} />}
        {s?.phase === 'review' && s.admitted < total && !(effectiveTargetOutputCount(e.streamPolicy ?? { maxRetries: 0 }, e.inputCount ?? 0) && finalOutputs >= effectiveTargetOutputCount(e.streamPolicy ?? { maxRetries: 0 }, e.inputCount ?? 0)!) && <div className="hawk-stream-review-action"><span>{s.stopReason || costLimitBlocks ? '已取入数据全部收尾；请先调整已达到的运行上限，再手动继续。' : '已取入数据全部收尾，可继续处理剩余输入。'}</span><Button type="primary" disabled={Boolean(s.stopReason || costLimitBlocks)} onClick={() => act(continueStreamManually)}>人工继续生产</Button></div>}
        {(s?.stageRecovery?.preparation ?? s?.preparation) !== undefined && <div><Typography.Text>失败输入准备进度</Typography.Text><Progress percent={s?.stageRecovery?.preparation ?? s?.preparation} /></div>}
        <div className="hawk-stream-table-heading"><h3>生产环节</h3><span>按批次重试失败数据，成功后继续下游</span></div>
        <Table size="small" pagination={false} rowKey="key" dataSource={stages} scroll={{ x: 960 }} columns={[
          { title: '生产环节', dataIndex: 'name', width: 175 },
          { title: '已处理输入', dataIndex: 'processed', align: 'right', render: (value: number) => value.toLocaleString() },
          { title: '失败量', dataIndex: 'failed', align: 'right', render: (value: number) => <span className={value ? 'hawk-stream-failure' : ''}>{value.toLocaleString()}</span> },
          { title: '通过率 / 产出比', key: 'yield', align: 'right', render: (_, row) => row.processed ? `${(((row.processed - row.failed) / row.processed) * 100).toFixed(1)}% / ${(row.outputs / row.processed).toFixed(2)}×` : '—' },
          { title: '成功产物', dataIndex: 'outputs', align: 'right', render: (value: number) => value.toLocaleString() },
          { title: '处理中 / 排队', dataIndex: 'queued', align: 'right' },
          { title: '环节费用', dataIndex: 'costCents', align: 'right', render: money },
          { title: '操作', key: 'action', width: 130, render: (_, row) => <Button size="small" onClick={() => retry(row.key)}>重试失败数据</Button> },
        ]} />
      </section>
    </Modal>
    {calculatorOpen && s && <ExecutorProductionCalculator executor={e} onClose={() => setCalculatorOpen(false)} />}
    <Modal title="调整总成本上限" open={limitOpen} onCancel={() => setLimitOpen(false)} okText="保存上限" cancelText="取消" onOk={() => { try { writeWorkspace(setStreamCostLimit(readWorkspace(), e.id, limit === null ? undefined : Math.round(limit * 100))); setLimitOpen(false); } catch (error) { msg.error(error instanceof Error ? error.message : '保存失败'); } }}>
      <p>累计费用 {money(cost)}；新的上限须高于累计费用。清空表示取消上限，保存后仍需手动继续。</p><InputNumber aria-label="本次总成本上限" value={limit} onChange={setLimit} min={0.01} precision={2} prefix="¥" placeholder="留空取消上限" style={{ width: '100%' }} />
    </Modal>
  </>;
}
