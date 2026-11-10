'use client';

import { useState } from 'react';
import { Alert, Button, InputNumber, Modal, Segmented, Select, Slider, Space, Tag } from 'antd';
import { type LocalExecutor } from '../data/local-workspace';
import { estimateStreamPlan, estimateStreamProductsByTime, streamCostEvidence } from '../data/executor-stream-estimates';
import { estimateStreamTimeAddition, streamForecastSupply, TIME_ESTIMATE_DEFAULTS } from '../data/executor-time-estimates';

const money = (cents: number) => `¥ ${(cents / 100).toFixed(2)}`;
const duration = (hours: number) => `${Math.ceil(hours * 60 - 1e-8).toLocaleString()} 分钟`;
const observedDuration = (hours: number) => hours > 0 && hours * 3600 < .1 ? '不足 0.1 秒' : hours < 1 / 60 ? `${(hours * 3600).toFixed(1)} 秒` : `${(hours * 60).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 分钟`;
// Labels span the displayed domain, including after a unit change or a large input.
const sliderMarks = (max: number) => Object.fromEntries([0, max / 2, max].map(value => [value, value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })]));
function TimeResult({ label, value, reason }: { label: string; value?: { base: number; low?: number; high?: number }; reason?: string }) {
  return <div className="hawk-calculator-time-result"><span>{label}</span><strong>{value ? duration(value.base) : '暂无法估算'}</strong>{value && <small>{value.low === undefined ? '粗估：观测段不足，暂不能确定预留范围。' : value.high === undefined ? `按近期波动至少 ${duration(value.low)}；存在零产出时段，暂不能确定时间上界。` : `按近期波动估算的参考范围：${duration(value.low)} – ${duration(value.high)}`}</small>}{!value && <small>{reason}</small>}</div>;
}
export function ExecutorProductionCalculator({ executor: e, onClose }: { executor: LocalExecutor; onClose: () => void }) {
  const [mode, setMode] = useState<'capacity' | 'target'>('capacity');
  const [constraint, setConstraint] = useState<'budget' | 'time' | 'both'>('budget');
  const [spend, setSpend] = useState<number | null>(2000), [target, setTarget] = useState<number | null>(2100), [hours, setHours] = useState<number | null>(8);
  const [timeUnit, setTimeUnit] = useState<'minutes' | 'hours' | 'days'>('minutes');
  const [showExtra, setShowExtra] = useState(false), [extra, setExtra] = useState<number | null>(0);
  const evidence = streamCostEvidence(e);
  const plan = estimateStreamPlan(e, mode === 'target' ? { products: target ?? NaN } : { budgetYuan: spend ?? NaN });
  const timePlan = estimateStreamProductsByTime(e, hours ?? NaN);
  const timeAddition = estimateStreamTimeAddition(e, target ?? NaN, extra ?? NaN);
  const timeEvidence = timeAddition.current.evidence;
  const combinedCost = showExtra ? estimateStreamPlan(e, { products: (target ?? NaN) + (extra ?? NaN) }) : undefined;
  const supply = streamForecastSupply(e);
  const showCostEvidence = mode === 'target' || constraint !== 'time';
  const showTimeEvidence = mode === 'target' || constraint !== 'budget';
  const timeFactor = timeUnit === 'days' ? 24 : timeUnit === 'minutes' ? 1 / 60 : 1;
  const displayedTime = hours === null ? null : Number((hours / timeFactor).toFixed(4));
  const timeMax = Math.max(timeUnit === 'days' ? 7 : timeUnit === 'minutes' ? 1440 : 24, displayedTime ?? 0);
  const budgetMax = Math.max(5000, spend ?? 0), targetMax = Math.max(10000, target ?? 0);
  const timeProducts = constraint === 'both'
    ? plan.products && timePlan.products !== undefined ? Math.min(plan.products.base, timePlan.products) : undefined
    : timePlan.products;
  const invalid = mode === 'target' ? target === null || !Number.isSafeInteger(target) || target < 0 || target > 100000 : (constraint !== 'time' && (spend === null || !Number.isFinite(spend) || spend < 0 || spend > 100000)) || (constraint !== 'budget' && (hours === null || !Number.isFinite(hours) || hours <= 0 || hours > 720));
  const timeBasis = timePlan.evidence?.ready ? `按观测吞吐 ${timePlan.rate!.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 份/小时测算（时间样本 ${timePlan.observedOutputs} 份 / ${observedDuration(timePlan.observedHours!)}）` : timePlan.reason;
  const costBasis = plan.reason ?? (plan.products ? `成本基准产能 ${plan.products.base.toLocaleString()} 份` : plan.cost ? `基准新增投入 ${money(plan.cost.base)}` : evidence.reason);
  return <Modal className="hawk-cost-calculator" title="成本与时间计算器" open centered width={840} onCancel={onClose} footer={<Button onClick={onClose}>关闭</Button>}>
    <div className="hawk-calculator-content">
    <div className="hawk-calculator-evidence-group">
      {showCostEvidence && <div className="hawk-calculator-evidence" aria-label="成本观测依据"><strong>成本观测</strong><span>成本样本 {evidence.samples.toLocaleString()} 条输入</span><span>样本成品 {evidence.outputs.toLocaleString()} 份</span><span>样本费用 {money(evidence.costCents)}</span><Tag>{evidence.ready ? '可用于成本试算' : '等待成本样本'}</Tag>{!evidence.ready && <small>{evidence.reason}</small>}</div>}
      {showTimeEvidence && <div className="hawk-calculator-evidence" aria-label="时间观测依据"><strong>时间观测</strong>{timeEvidence.ready ? <><span>已观测成品 {timeEvidence.observedOutputs} 份</span><span>有效处理 {observedDuration(timeEvidence.observedHours)}</span><Tag>{timeEvidence.completeSegments < TIME_ESTIMATE_DEFAULTS.minimumSegments ? '粗估' : '经验范围 · 未校准'}</Tag></> : <span>{timeEvidence.reason}</span>}</div>}
    </div>
    <Segmented block aria-label="预测方向" value={mode} onChange={value => setMode(value as typeof mode)} options={[{ value: 'capacity', label: '预算 / 时长 → 产量' }, { value: 'target', label: '目标产量 → 成本 / 时间' }]} />
    {mode === 'capacity' && <Segmented block aria-label="产量约束" value={constraint} onChange={value => setConstraint(value as typeof constraint)} options={[{ value: 'budget', label: '按预算' }, { value: 'time', label: '按时长' }, { value: 'both', label: '预算 + 时长' }]} />}
    <div className={`hawk-calculator-inputs ${mode === 'capacity' && constraint === 'both' ? 'has-two-columns' : ''}`}>
    {mode === 'capacity' && constraint !== 'time' && <div className="hawk-calculator-control">
      <label htmlFor="production-budget">计划追加投入</label><Space><InputNumber id="production-budget" aria-label="计划追加投入" min={0} max={100000} precision={2} value={spend} onChange={setSpend} /><span>元</span></Space>
      <Slider ariaLabelForHandle="调整追加投入" min={0} max={budgetMax} step={.01} value={spend ?? 0} onChange={setSpend} marks={sliderMarks(budgetMax)} />
    </div>}
    {mode === 'capacity' && constraint !== 'budget' && <div className="hawk-calculator-control">
      <label htmlFor="production-hours">计划运行时长</label><Space.Compact><InputNumber id="production-hours" aria-label="计划运行时长" min={timeUnit === 'days' ? .01 : .25} max={timeUnit === 'days' ? 30 : timeUnit === 'minutes' ? 43200 : 720} step={timeUnit === 'days' ? .25 : 1} value={displayedTime} onChange={value => setHours(value === null ? null : value * timeFactor)} /><Select aria-label="计划运行时长单位" value={timeUnit} onChange={setTimeUnit} options={[{ value: 'minutes', label: '分钟' }, { value: 'hours', label: '小时' }, { value: 'days', label: '天' }]} /></Space.Compact>
      <Slider ariaLabelForHandle="调整计划运行时长" min={0} max={timeMax} step={timeUnit === 'days' ? .25 : 1} value={displayedTime ?? 0} onChange={value => setHours(value * timeFactor)} marks={sliderMarks(timeMax)} />
    </div>}
    {mode === 'target' && <div className="hawk-calculator-control">
      <label htmlFor="production-target">目标新增成品</label><Space><InputNumber id="production-target" aria-label="目标新增成品" min={0} max={100000} precision={0} value={target} onChange={setTarget} /><span>份</span></Space>
      <Slider ariaLabelForHandle="调整目标新增成品" min={0} max={targetMax} step={1} value={target ?? 0} onChange={setTarget} marks={sliderMarks(targetMax)} />
      <div className="hawk-calculator-extra"><Button type="link" onClick={() => setShowExtra(value => !value)}>{showExtra ? '收起追加试算' : '再多做多少份'}</Button>{showExtra && <><label htmlFor="production-extra">额外追加成品</label><Space><InputNumber id="production-extra" aria-label="额外追加成品" min={0} max={100000} precision={0} value={extra} onChange={setExtra} /><span>份</span></Space><small>当前方案 {target?.toLocaleString() ?? '—'} 份 + 额外追加 {extra?.toLocaleString() ?? '—'} 份 = 从现在再产出 {target !== null && extra !== null ? (target + extra).toLocaleString() : '—'} 份，不含已有成品。</small></>}</div>
    </div>}
    </div>
    {mode === 'capacity' && constraint !== 'budget' && <p className="hawk-calculator-time-help">平台支持全天候无人看管运行；实际有数据可处理多久取决于输入供给。这里填写累计实际处理时间，暂停、排队和无数据等待不计入。1 天按累计处理 24 小时计算。</p>}
    <div className="hawk-calculator-result" aria-live="polite">
      <span>{mode === 'target' ? '预计新增投入' : supply.status === 'exhausted' ? '当前输入可新增成品' : '预计产能（供数充足时）'}</span>
      <strong>{invalid ? '请填写有效数值' : mode === 'capacity' && constraint === 'budget' && plan.products ? `${plan.products.low.toLocaleString()} – ${plan.products.high.toLocaleString()} 份` : mode === 'capacity' && constraint !== 'budget' && timeProducts !== undefined ? `${timeProducts.toLocaleString()} 份` : mode === 'target' && plan.cost ? `${money(plan.cost.low)} – ${money(plan.cost.high)}` : '数据不足，暂无法估算'}</strong>
      <small>{invalid ? '请填写范围内的有效数值后再试算。' : mode === 'capacity' && constraint !== 'budget' ? `${constraint === 'both' && !plan.products ? plan.reason : timeBasis ?? supply.message}${constraint === 'both' ? '；预算与时长同时约束时取较低产能。' : '。'}` : costBasis}</small>
    </div>
    {!invalid && <Alert className="hawk-calculator-supply" showIcon type={supply.status === 'waiting' ? 'warning' : 'info'} message={supply.message} />}
    {mode === 'target' && <section className="hawk-calculator-time" aria-label="目标成品时间估算">
      <div className="hawk-calculator-time-heading"><strong>预计还需有效处理时间</strong><Tag>{timeEvidence.ready ? timeEvidence.completeSegments < TIME_ESTIMATE_DEFAULTS.minimumSegments ? '粗估' : '经验范围 · 未校准' : '等待观测'}</Tag></div>
      <p>以下时间均从现在起算。暂停、排队和无数据等待不计入，不代表具体交付时刻。</p>
      <div className={`hawk-calculator-time-grid ${showExtra ? 'has-extra' : ''}`}>
        <TimeResult label={`当前方案 · 再产出 ${target?.toLocaleString() ?? '—'} 份`} value={timeAddition.current.hours} reason={timeAddition.current.reason} />
        {showExtra && <><TimeResult label={`追加部分 · 多做 ${extra?.toLocaleString() ?? '—'} 份`} value={timeAddition.incremental} reason={timeAddition.reason ?? timeAddition.combined.reason} /><TimeResult label="追加后累计 · 从现在起" value={timeAddition.reason ? undefined : timeAddition.combined.hours} reason={timeAddition.reason ?? timeAddition.combined.reason} /></>}
      </div>
      {timeEvidence.ready && <small className="hawk-calculator-time-basis">{timeEvidence.source === 'synthetic-demo' ? '预置演示观测' : '本地运行观测'} · {timeEvidence.method === 'resource' ? '按资源特征估算' : '按整批产出速度估算'} · {timeEvidence.observedOutputs.toLocaleString()} 份 / {observedDuration(timeEvidence.observedHours)} · 已有 {timeEvidence.completeSegments} 个完整观测段（{TIME_ESTIMATE_DEFAULTS.minimumSegments} 个起显示范围）。{timeEvidence.note}</small>}
      {timeEvidence.ready && timeEvidence.updatedAt !== undefined && <small>{timeEvidence.source === 'synthetic-demo' ? '演示观测生成时间' : '观测更新时间'}：{new Date(timeEvidence.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）</small>}
      {showExtra && combinedCost?.cost && <small>追加后累计预计新增投入：{money(combinedCost.cost.low)} – {money(combinedCost.cost.high)}，不含已发生费用。</small>}
      {(showExtra ? timeAddition.combined.supplyWarning : timeAddition.current.supplyWarning) && <small>{showExtra ? timeAddition.combined.supplyWarning : timeAddition.current.supplyWarning}</small>}
    </section>}
    <details className="hawk-calculator-coverage"><summary>估算依据</summary><p>按同一批已收尾输入的实际费用与最终成品计算，包含失败、重试和多产物。首次按输入量 5%（最多 1,000 条），此后按 2%（最多 400 条）刷新；未知总量按 500 / 200 条。时间按有效处理速度估算，排除暂停和等待。</p><p>范围来自近期观测波动；样本不足或零产出时不提供无依据的预测。试算不改变运行配置。</p></details>
    <p className="hawk-calculator-time-help">原型模拟估算，仅供参考。</p>
    </div>
  </Modal>;
}
