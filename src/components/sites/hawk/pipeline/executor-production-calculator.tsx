'use client';

import { useState } from 'react';
import { Alert, Button, InputNumber, Modal, Segmented, Select, Slider, Space, Tag, Typography } from 'antd';
import { readWorkspace, writeWorkspace, type LocalExecutor } from '../data/local-workspace';
import { estimateStreamPlan, streamCostEvidence } from '../data/executor-stream-estimates';
import { setStreamLimits } from '../data/executor-streaming';
import { ExecutorDurationInput } from './executor-duration-input';
import { ExecutorSettingRow } from './executor-setting-row';

const money = (cents: number) => `¥ ${(cents / 100).toFixed(2)}`;
export function ExecutorProductionCalculator({ executor: e, onClose }: { executor: LocalExecutor; onClose: () => void }) {
  const s = e.stream!;
  const [mode, setMode] = useState<'capacity' | 'target'>('capacity');
  const [constraint, setConstraint] = useState<'budget' | 'time' | 'both'>('budget');
  const [spend, setSpend] = useState<number | null>(2000), [target, setTarget] = useState<number | null>(2100), [hours, setHours] = useState<number | null>(8);
  const [timeUnit, setTimeUnit] = useState<'hours' | 'days'>('hours');
  const [inputLimit, setInputLimit] = useState<number | undefined>(e.streamPolicy?.inputLimit);
  const [runtimeMs, setRuntimeMs] = useState<number | undefined>(e.streamPolicy?.runtimeLimitMs);
  const [limit, setLimit] = useState<number | undefined>(s.costLimitCents === undefined ? undefined : s.costLimitCents / 100);
  const [error, setError] = useState('');
  const evidence = streamCostEvidence(e);
  const plan = estimateStreamPlan(e, mode === 'target' ? { products: target ?? NaN } : { budgetYuan: spend ?? NaN });
  const minimumLimit = (s.costCents + 1) / 100;
  const upperLimit = Math.max(5000, Math.ceil(minimumLimit / 50) * 50, limit ?? 0);
  const invalid = mode === 'target' ? target === null || !Number.isSafeInteger(target) || target < 0 : (constraint !== 'time' && (spend === null || spend < 0)) || (constraint !== 'budget' && (hours === null || hours <= 0));
  const saveLimit = () => {
    try {
      if (limit !== undefined && (!Number.isFinite(limit) || limit < minimumLimit || limit > 100000)) throw new Error('总成本上限须高于当前累计费用，且不超过 ¥100,000；可清空取消上限。');
      writeWorkspace(setStreamLimits(readWorkspace(), e.id, { costLimitCents: limit === undefined ? undefined : Math.round(limit * 100), inputLimit, runtimeLimitMs: runtimeMs }));
      onClose();
    } catch (issue) { setError(issue instanceof Error ? issue.message : '保存失败'); }
  };
  return <Modal className="hawk-cost-calculator" title="成本与时间计算器" open centered width={840} okText="保存运行上限" cancelText="关闭" onCancel={onClose} onOk={saveLimit} okButtonProps={{ disabled: ['draining', 'completed'].includes(s.phase) }}>
    <div className="hawk-calculator-content">
    <div className="hawk-calculator-evidence"><strong>本地演示观测</strong><span>已收尾 {evidence.samples} / {evidence.threshold} 条</span><span>{evidence.outputs} 份成品</span><span>样本成本 {money(evidence.costCents)}</span><Tag>置信度：未校准</Tag></div>
    <Segmented block aria-label="预测方向" value={mode} onChange={value => setMode(value as typeof mode)} options={[{ value: 'capacity', label: '预算 / 时长 → 产量' }, { value: 'target', label: '目标产量 → 成本 / 时间' }]} />
    {mode === 'capacity' && <Segmented block aria-label="产量约束" value={constraint} onChange={value => setConstraint(value as typeof constraint)} options={[{ value: 'budget', label: '按预算' }, { value: 'time', label: '按时长' }, { value: 'both', label: '预算 + 时长' }]} />}
    <div className={`hawk-calculator-inputs ${mode === 'capacity' && constraint === 'both' ? 'has-two-columns' : ''}`}>
    {mode === 'capacity' && constraint !== 'time' && <div className="hawk-calculator-control">
      <label htmlFor="production-budget">计划追加投入</label><Space><InputNumber id="production-budget" aria-label="计划追加投入" min={0} max={100000} precision={2} value={spend} onChange={setSpend} /><span>元</span></Space>
      <Slider ariaLabelForHandle="调整追加投入" min={0} max={Math.max(5000, spend ?? 0)} step={.01} value={spend ?? 0} onChange={setSpend} marks={{ 0: '0', 2000: '2,000', 5000: '5,000' }} />
    </div>}
    {mode === 'capacity' && constraint !== 'budget' && <div className="hawk-calculator-control">
      <label htmlFor="production-hours">计划运行时长</label><Space.Compact><InputNumber id="production-hours" aria-label="计划运行时长" min={timeUnit === 'days' ? .01 : .25} max={timeUnit === 'days' ? 30 : 720} step={timeUnit === 'days' ? .25 : 1} value={hours === null ? null : Number((hours / (timeUnit === 'days' ? 24 : 1)).toFixed(4))} onChange={value => setHours(value === null ? null : value * (timeUnit === 'days' ? 24 : 1))} /><Select aria-label="计划运行时长单位" value={timeUnit} onChange={setTimeUnit} options={[{ value: 'hours', label: '小时' }, { value: 'days', label: '天' }]} /></Space.Compact>
      <Slider ariaLabelForHandle="调整计划运行时长" min={0} max={Math.max(timeUnit === 'days' ? 7 : 24, (hours ?? 0) / (timeUnit === 'days' ? 24 : 1))} step={timeUnit === 'days' ? .25 : 1} value={(hours ?? 0) / (timeUnit === 'days' ? 24 : 1)} onChange={value => setHours(value * (timeUnit === 'days' ? 24 : 1))} marks={timeUnit === 'days' ? { 0: '0', 3: '3', 7: '7' } : { 0: '0', 8: '8', 24: '24' }} />
    </div>}
    {mode === 'target' && <div className="hawk-calculator-control">
      <label htmlFor="production-target">目标新增成品</label><Space><InputNumber id="production-target" aria-label="目标新增成品" min={0} max={100000} precision={0} value={target} onChange={setTarget} /><span>份</span></Space>
      <Slider ariaLabelForHandle="调整目标新增成品" min={0} max={Math.max(10000, target ?? 0)} step={1} value={target ?? 0} onChange={setTarget} marks={{ 0: '0', 2100: '2,100', 10000: '10,000' }} />
    </div>}
    </div>
    {mode === 'capacity' && constraint !== 'budget' && <p className="hawk-calculator-time-help">平台支持全天候无人看管运行；实际有数据可处理多久取决于输入供给。这里填写累计实际处理时间，暂停、排队和无数据等待不计入。1 天按累计处理 24 小时计算。</p>}
    <div className="hawk-calculator-result" aria-live="polite">
      <span>{mode === 'target' ? '预计新增投入' : '预计新增可交付成品'}</span>
      <strong>{invalid ? '请填写有效数值' : mode === 'capacity' && constraint === 'budget' && plan.products ? `${plan.products.low.toLocaleString()} – ${plan.products.high.toLocaleString()} 份` : mode === 'target' && plan.cost ? `${money(plan.cost.low)} – ${money(plan.cost.high)}` : '数据不足，暂无法估算'}</strong>
      <small>{mode === 'capacity' && constraint !== 'budget' ? `预算与时长${constraint === 'both' ? '同时约束时取较低产量上限' : ''}；当前缺少真实吞吐、并发和资源等待数据，无法估算实际运行时长对应的产量。` : plan.reason ?? `基准 ${plan.products ? plan.products.base.toLocaleString() + ' 份' : money(plan.cost!.base)} · 同一批已收尾输入的费用与最终成品配对计算，包含失败、重试和多产物。`}</small>
    </div>
    {mode === 'target' && <div className="hawk-executor-setting-group">
      <ExecutorSettingRow title="预计任务处理工作量" description="按目标成品量、各阶段通过率与实测处理时长估算。">数据不足</ExecutorSettingRow>
      <ExecutorSettingRow title="预计实际运行时长" description="还需结合服务限速、可用并发及资源等待。">暂无法估算</ExecutorSettingRow>
    </div>}
    <details className="hawk-calculator-coverage"><summary>估算依据与适用范围</summary><p>模型：已收尾输入分组 v1 · 样本 {evidence.samples} 条 / {evidence.groups} 组。区间使用分组单位成本的四分位范围，不是统计置信区间或费用保证。</p><p>当前还可取入 {evidence.remainingInputs.toLocaleString()} 条原始输入。估算假设后续输入与样本分布相近，不保证剩余资源足以达到目标；目标为新增量，不含已交付成品，预计投入也不含已发生费用。</p><p>文件大小、视频时长与编码、资源池、有效 QPS、实际可用并发和生产账单尚未接入，长尾覆盖与预测误差均未验证。成本上限与预测输入独立，调整预测不会启动或修改生产。</p></details>
    <div className="hawk-calculator-limit"><div><strong>本次总成本上限</strong><small>达到后停止新增输入及重试，在途任务继续收尾，最终费用可能超出上限。</small></div><Space><InputNumber aria-label="本次总成本上限" min={minimumLimit} max={100000} precision={2} placeholder="不设上限" value={limit} onChange={value => { setLimit(value === null ? undefined : value); setError(''); }} /><span>元</span><Button type="link" onClick={() => { setLimit(undefined); setError(''); }}>取消上限</Button></Space><Slider ariaLabelForHandle="调整总成本上限" min={minimumLimit} max={upperLimit} step={.01} disabled={limit === undefined || ['draining', 'completed'].includes(s.phase)} value={limit ?? minimumLimit} onChange={setLimit} /></div>
    <div className="hawk-calculator-inputs has-two-columns hawk-calculator-additional-limits">
      <div className="hawk-calculator-control"><label htmlFor="runtime-input-limit">最多取入原始数据（条）</label><InputNumber id="runtime-input-limit" min={1} precision={0} placeholder="留空不限制" value={inputLimit} onChange={value => setInputLimit(value ?? undefined)} /></div>
      <div className="hawk-calculator-control"><label htmlFor="runtime-hours-limit">累计运行时长上限</label><ExecutorDurationInput id="runtime-hours-limit" value={runtimeMs} onChange={setRuntimeMs} /></div>
    </div>
    <p className="hawk-calculator-time-help">时长上限按执行器整体累计，并行环节只计一次。任一上限达到后停止取入新数据及自动重试，在途任务继续收尾。上方预测仅用于试算，运行上限在此单独保存。</p>
    {['draining', 'completed'].includes(s.phase) && <Alert type="info" showIcon message="当前正在收尾或已完成，可查看预测；运行上限此时不可修改。" />}
    {error && <Alert role="alert" type="error" showIcon message={error} />}
    <Typography.Paragraph type="secondary">本页用于原型交互验证。真实成本与时间预测待生产事件、资源元数据和计费口径接入后校准；开始生产不要求先跑样本或人工确认。</Typography.Paragraph>
    </div>
  </Modal>;
}
