'use client';
import { useState } from 'react';
import { Alert, Button, Checkbox, Descriptions, Input, InputNumber, Modal, Progress, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useRouter } from '@/lib/demo-navigation';
import { readWorkspace, writeWorkspace, type LocalExecutor } from '../data/local-workspace';
import { cloneExecutor } from '../data/executor-runtime';
import { confirmStreamBudget, prepareStreamRecovery, takeOverStream, continueStreamManually } from '../data/executor-streaming';
import './executor-stream-panel.css';
import { ExecutorCostControls } from './executor-cost-controls';
const PHASES = { sample: '样本运行', budget: '等待预算确认', production: '流式生产', draining: '预算 / 接管收尾', review: '待人工补救', completed: '运行完成' };
const money = (cents: number) => `¥ ${(cents / 100).toFixed(2)}`;
export function ExecutorCloneButton({ executor }: { executor: LocalExecutor }) {
  const router = useRouter(), [open, setOpen] = useState(false), [name, setName] = useState(''), [config, setConfig] = useState(true), [input, setInput] = useState(false), [error, setError] = useState('');
  return <><Button icon={<CopyOutlined />} onClick={() => { setOpen(true); setName(`${executor.name} · 克隆`); }}>克隆执行器</Button><Modal title="克隆配置预览" open={open} onCancel={() => setOpen(false)} okText="创建新执行器" onOk={() => {
    try { const w = readWorkspace(), next = cloneExecutor(w, executor.id, { name, includeInput: input, includeConfiguration: config }); writeWorkspace(next); setOpen(false); router.push(`/hawk/pipeline/executor/?id=${next.executors.at(-1)!.id}`); } catch (e) { setError(e instanceof Error ? e.message : '克隆失败'); }
  }}>
    {error && <Alert type="error" message={error} />}
    <Typography.Paragraph>新实例使用独立批次、结果与费用记录。首次启动前重新核对输入依赖和预算。</Typography.Paragraph>
    <Input aria-label="克隆名称" value={name} onChange={e => setName(e.target.value)} />
    <Space direction="vertical" style={{ margin: '20px 0' }}><Checkbox checked={config} onChange={e => setConfig(e.target.checked)}>继承执行器、工作流与节点的实际配置</Checkbox><Checkbox checked={input} onChange={e => setInput(e.target.checked)}>同时带入本次输入资源</Checkbox></Space>
    <Descriptions size="small" column={1} bordered items={[
      { key: 'config', label: '配置来源', children: config ? '当前实例实际配置' : '来源发布版本原始配置；版本不可用则阻断' },
      { key: 'input', label: '输入与字段', children: input ? '带入资源；启动前按本次输入重新核对字段' : '待配置新输入；按新输入重算字段依赖' },
      { key: 'budget', label: '预算', children: '只保留适用的单价意图；重新跑样本并确认公式，不带入固定总额' },
      { key: 'reset', label: '不继承', children: '费用、进度、重试次数、结果、输出 CID、导出记录' },
    ]} />
    <Alert style={{ marginTop: 16 }} type="info" showIcon message="原型展示配置隔离；生产字段依赖校验与真实资源重新绑定仍需联调。" />
  </Modal></>;
}
export function ExecutorStreamPanel({ executor: e }: { executor: LocalExecutor }) {
  const s = e.stream, [budgetOpen, setBudgetOpen] = useState(false), [quantity, setQuantity] = useState<number | null>(null), [unit, setUnit] = useState<number | null>(null), [error, setError] = useState(''), [msg, holder] = message.useMessage();
  const act = (fn: (w: ReturnType<typeof readWorkspace>, id: string) => ReturnType<typeof readWorkspace>) => { try { writeWorkspace(fn(readWorkspace(), e.id)); } catch (issue) { msg.error(issue instanceof Error ? issue.message : '操作失败'); } };
  if (!s) return null;
  const pending = s.predicted !== undefined && s.budget && s.predicted !== s.budget.quantity;
  return <section className="hawk-stream-panel" aria-label="流式运行与成本">
    {holder}<div className="hawk-stream-heading"><div><Tag color="blue">流式运行</Tag><Tag color={s.control === 'manual' ? 'orange' : 'green'}>{s.control === 'manual' ? '人工控制' : '自动控制'}</Tag><strong>{PHASES[s.phase]}</strong></div><Space wrap><ExecutorCostControls executor={e} />{s.control === 'automatic' && !['completed', 'draining'].includes(s.phase) && <Button onClick={() => act(takeOverStream)}>人工接管</Button>}{s.control === 'manual' && s.phase === 'review' && s.admitted < (e.inputCount ?? 0) && <Button onClick={() => Modal.confirm({ title: '人工继续剩余输入', content: '不受自动预算和自动重试次数拦截，费用仍累计且可能超过原预算。平台权限与故障校验仍有效。', okText: '确认继续', onOk: () => act(continueStreamManually) })}>人工继续剩余输入</Button>}{s.control === 'manual' && s.phase === 'review' && s.failures.length > 0 && <Button type="primary" onClick={() => Modal.confirm({ title: '在原执行器补救失败数据', content: '先扫描准备输入，再从失败阶段恢复。已有成功产物保留；费用继续累计，可能超过原预算。', okText: '确认准备补救', onOk: () => act(prepareStreamRecovery) })}>准备失败数据补救（{s.failures.length}）</Button>}</Space></div>
    <div className="hawk-stream-metrics"><Statistic title="实际累计费用（含样本）" value={money(s.costCents)} /><Statistic title="已确认公式预算" value={s.budget ? money(s.budget.cents) : '待确认'} /><Statistic title="当前预计最终成品" value={s.predicted ?? '待估算'} suffix="份" /><Statistic title="实际最终成品" value={s.stages.at(-1)?.outputs ?? 0} suffix="份" /><Statistic title="当前每份成品累计费用" value={s.stages.at(-1)!.outputs > 0 ? `¥ ${(s.costCents / 100 / s.stages.at(-1)!.outputs).toFixed(4)}` : '不可计算'} /></div>
    {s.reason && <Alert type={s.phase === 'draining' || s.phase === 'review' ? 'warning' : 'info'} showIcon message={s.reason} />}
    {s.reminded && <Alert type="warning" showIcon message={`已发出预算 ${e.streamPolicy?.reminderRatio}% 提前提醒（本地）；提醒本身不停止运行`} />}
    <div className="hawk-stream-budget-row"><span>样本输入 {e.streamPolicy?.sampleSize} · 已取入 {s.admitted} / {e.inputCount} · 自动重试 {s.retryRound} / {e.streamPolicy?.maxRetries} 轮（不含首轮）</span>{s.control === 'automatic' && !['sample', 'completed', 'draining'].includes(s.phase) && <Button type={s.budget ? 'default' : 'primary'} disabled={!s.sampleOutputs} onClick={() => { setQuantity(s.predicted ?? null); setUnit(e.streamPolicy?.targetUnitCost ?? null); setError(''); setBudgetOpen(true); }}>{s.budget ? '重算并确认预算' : '确认公式预算'}</Button>}</div>
    {pending && <Typography.Paragraph type="secondary">预测已更新为 {s.predicted} 份；当前生效预算仍为 {s.budget?.quantity} × ¥{s.budget?.unitCost}，确认重算前不变。</Typography.Paragraph>}
    {s.triggerCostCents !== undefined && <Descriptions size="small" bordered column={3} items={[{ key: 'trigger', label: '触发费用', children: money(s.triggerCostCents) }, { key: 'extra', label: '收尾新增费用', children: money((s.drainFinalCents ?? s.costCents) - s.triggerCostCents) }, { key: 'total', label: s.drainFinalCents === undefined ? '收尾当前费用' : '收尾最终费用', children: money(s.drainFinalCents ?? s.costCents) }]} />}
    {s.preparation !== undefined && <div><Typography.Text>输入扫描准备 · 演示进度，不承诺生产耗时</Typography.Text><Progress percent={s.preparation} /></div>}
    <Table size="small" pagination={false} scroll={{ x: 620 }} rowKey="key" dataSource={s.stages.map((stage, i) => ({ ...stage, key: i, name: e.flows[i]?.name, queued: s.queues[i].length }))} columns={[{ title: '环节', dataIndex: 'name' }, { title: '已处理输入', dataIndex: 'processed' }, { title: '失败待补救', dataIndex: 'failed' }, { title: '可读成功产物', dataIndex: 'outputs' }, { title: '处理中 / 排队', dataIndex: 'queued' }, { title: '环节费用', dataIndex: 'costCents', render: money }]} />
    <Typography.Paragraph type="secondary">成功且可读结果持续下传；一份输入可产生多份成品。主动导出只生成交付快照，不驱动下游。CID 与费用服务为模拟。</Typography.Paragraph>
    <details><summary>运行与预算确认记录（{s.events.length}）</summary>{s.events.map((x, i) => <p key={i}>{new Date(x.at).toLocaleTimeString('zh-CN')}　{x.text}</p>)}</details>
    <Modal title={s.budget ? '人工确认重算预算' : '样本结果与公式预算确认'} open={budgetOpen} okText="确认并继续生产" onCancel={() => setBudgetOpen(false)} onOk={() => { try { writeWorkspace(confirmStreamBudget(readWorkspace(), e.id, quantity!, unit!)); setBudgetOpen(false); } catch (issue) { setError(issue instanceof Error ? issue.message : '确认失败'); } }}>
      <Typography.Paragraph>本次样本 {e.streamPolicy?.sampleSize} 条，最终产物 {s.sampleOutputs} 份；已累计 {money(s.costCents)}。请核对样本代表性，必要时修正预计最终成品量。</Typography.Paragraph>
      <Space direction="vertical" style={{ width: '100%' }}><label>预计最终成品数 <InputNumber aria-label="预计最终成品数" min={0.01} value={quantity} onChange={setQuantity} /></label><label>期望最终成品单价（元） <InputNumber aria-label="期望最终成品单价" min={0.0001} precision={4} value={unit} onChange={setUnit} /></label><strong>公式预算 = {quantity ?? '待填'} × ¥{unit ?? '待填'} = ¥{quantity && unit ? (quantity * unit).toFixed(2) : '待确认'}</strong></Space>
      <Alert style={{ marginTop: 16 }} type="warning" showIcon message="达到预算停止新增取入和新增重试；已取入数据继续处理，最终费用可能超过预算。预计成品量不作为够量停止条件。" />{error && <Alert role="alert" type="error" message={error} />}
    </Modal>
  </section>;
}
