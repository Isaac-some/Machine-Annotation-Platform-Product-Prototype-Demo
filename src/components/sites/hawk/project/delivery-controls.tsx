'use client';

import { useRef, useState } from 'react';
import { Alert, Button, ConfigProvider, Drawer, Dropdown, Empty, InputNumber, Modal, Progress, Radio, Select, Space, Table, Tag, Typography, message } from 'antd';
import { CalendarOutlined, CheckOutlined, DatabaseOutlined, DownOutlined, DownloadOutlined, ExportOutlined, HistoryOutlined, OrderedListOutlined, StopOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { readWorkspace, useWorkspace, writeWorkspace } from '../data/local-workspace';
import { DELIVERY_LABELS, EXPORT_PHASES, beijingTime, createExportJob, deliveryLocked, exportCsv, hasDownstream, rangeLabel, retryExportJob, selectResults, setDeliveryMode, type DeliveryMode, type ExportJob, type ExportRange } from '../data/delivery';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import { ExportDateTimePicker } from './export-date-time-picker';
import { deliveredWindow, latestDeliveredEnd, recentExportRange } from '../data/export-window';
import { CURRENT_USER } from '../data/names';
import './delivery.css';
import './settings-dialog.css';

export function DeliveryOrderSwitch({ value, onChange, label }: { value: 'sorted' | 'unsorted'; onChange: (value: 'sorted' | 'unsorted') => void; label: string }) {
  return <Radio.Group className="hawk-order-switch" aria-label={label} value={value} onChange={event => onChange(event.target.value)} optionType="button" options={[
    { value: 'sorted', label: <span><OrderedListOutlined aria-hidden="true" />排序</span> },
    { value: 'unsorted', label: <span><UnorderedListOutlined aria-hidden="true" />不排序</span> },
  ]} />;
}

export function downloadDelivery(job: ExportJob) {
  const url = URL.createObjectURL(new Blob([exportCsv(job)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${job.id}-batch-${job.batchId}.csv`; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FinishControl({ batchId, disabled, onFinish }: { batchId: number; disabled: boolean; onFinish: () => void }) {
  const workspace = useWorkspace(), batch = workspace.batches.find(item => item.id === batchId)!;
  const [msg, holder] = message.useMessage(), [modal, modalHolder] = Modal.useModal();
  const mode = batch.deliveryMode ?? 'sorted', downstream = hasDownstream(workspace, batchId) && workspace.executors.find(e => e.id === batch.executorId)?.runMode !== 'stream';
  const save = (next: DeliveryMode) => {
    const commit = () => {
      try { writeWorkspace(setDeliveryMode(readWorkspace(), batchId, next)); msg.success('结束配置已保存'); }
      catch (error) { msg.error(error instanceof Error ? error.message : '保存失败，请重试'); }
    };
    if (next === 'none') modal.confirm({ title: '结束时不生成交付文件？', content: '处理结果仍会保留，之后可以主动导出。本次结束不会自动生成可下载文件。', okText: '确认不生成', cancelText: '取消', onOk: commit });
    else commit();
  };
  return <>{holder}{modalHolder}<Space.Compact className="hawk-finish-control">
    <Button aria-label="结束" icon={<StopOutlined />} disabled={disabled} onClick={onFinish}>结束</Button>
    <Dropdown trigger={['click']} placement="bottomRight" disabled={deliveryLocked(batch)} menu={{
      className: 'hawk-finish-menu', selectable: true, selectedKeys: [mode], onClick: ({ key }) => save(key as DeliveryMode),
      items: (['sorted', 'unsorted', 'none'] as const).map(value => ({ key: value, disabled: value === 'none' && downstream,
        label: <div className="hawk-finish-option"><div><strong>{DELIVERY_LABELS[value]}</strong><small>{value === 'sorted' ? '默认' : value === 'unsorted' ? '较快' : '极快'}</small>{mode === value && <CheckOutlined />}</div><p>{value === 'sorted' ? '按输入顺序整理并生成文件' : value === 'unsorted' ? '保留完整数据，跳过排序' : downstream ? '后续批次依赖该文件，不能关闭生成' : '保留必要处理和下游所需结果'}</p></div>,
      })),
    }}><Button aria-label="结束配置" icon={<DownOutlined />} /></Dropdown>
  </Space.Compact></>;
}

function JobStatus({ job }: { job: ExportJob }) {
  return <Tag color={job.status === 'succeeded' ? 'success' : job.status === 'failed' ? 'error' : 'processing'}>{job.status === 'succeeded' ? '导出成功' : job.status === 'failed' ? '导出失败' : EXPORT_PHASES[job.phase]}</Tag>;
}
function JobActions({ job, onError }: { job: ExportJob; onError: (message: string) => void }) {
  const attempt = (fn: () => void) => { try { fn(); } catch (error) { onError(error instanceof Error ? error.message : '操作失败，请重试'); } };
  return <Space>{job.status === 'succeeded' && <Button aria-label="下载文件" size="small" icon={<DownloadOutlined />} onClick={() => attempt(() => downloadDelivery(job))}>下载文件</Button>}{job.status === 'failed' && <Button size="small" onClick={() => attempt(() => writeWorkspace(retryExportJob(readWorkspace(), job.id)))}>重试导出</Button>}</Space>;
}
export function BatchDeliveryStatus({ batchId }: { batchId: number }) {
  const workspace = useWorkspace(), [msg, holder] = message.useMessage();
  const batch = workspace.batches.find(item => item.id === batchId);
  const jobs = (workspace.exportJobs ?? []).filter(item => item.batchId === batchId).toReversed();
  const visible = jobs.filter(item => item.status !== 'succeeded');
  return <>{holder}{batch?.finish?.phase === 'draining' && <Alert className="hawk-delivery-notice" type="info" showIcon message={`停止新派发，等待 ${batch.finish.inFlight} 条在途数据收尾；之后${DELIVERY_LABELS[batch.finish.mode]}`} />}
    {batch?.finish?.note && <Alert className="hawk-delivery-notice" type="info" showIcon message={batch.finish.note} />}
    {visible.slice(0, 2).map(job => <section key={job.id} className="hawk-export-activity" aria-label="导出进度">
      <div><JobStatus job={job} /><span>{job.trigger === 'finish' ? '结束生成' : '主动导出'} · {job.members.length} 条 · {job.sorted ? '有序' : '不排序'}</span><JobActions job={job} onError={text => msg.error(text)} /></div>
      {job.status === 'generating' && <Progress percent={job.progress} size="small" status="active" aria-label={`导出进度 ${job.progress}%`} />}
      {job.error && job.status === 'failed' && <p role="alert">{job.error}；只重试文件生成，不重新处理数据。</p>}
    </section>)}
  </>;
}

function ExportTimeline({ jobs, firstResultAt, now, range }: { jobs: ExportJob[]; firstResultAt: number; now: number; range: ExportRange }) {
  const windows = jobs.map(job => ({ ...deliveredWindow(job, firstResultAt), job }));
  const selectedStart = range.kind === 'interval' && Number.isFinite(range.start) ? range.start : now;
  const origin = Math.min(firstResultAt, selectedStart, ...windows.map(window => window.start));
  const span = Math.max(1, now - origin);
  const position = (time: number) => Math.max(0, Math.min(100, (time - origin) / span * 100));
  const style = (start: number, end: number) => ({ left: `${position(start)}%`, width: `${Math.max(.3, position(end) - position(start))}%` });
  return <div className="hawk-export-timeline" aria-label="导出时间轴">
    <div className="hawk-export-timeline-heading"><strong>导出时间轴</strong><span><i className="is-delivered" />已成功导出 <i className="is-selected" />本次选择</span></div>
    <div className="hawk-export-timeline-track" aria-label="历史成功导出区间">{windows.map(window => <span key={window.job.id} className="is-delivered" style={style(window.start, window.end)} title={`${window.job.id} · ${rangeLabel(window.job.range)}`} />)}</div>
    <div className="hawk-export-timeline-track" aria-label="本次选择区间">{range.kind === 'interval' && Number.isFinite(range.start) && Number.isFinite(range.end) && range.start < range.end && <span className="is-selected" style={style(range.start, range.end)} />}</div>
    <div className="hawk-export-timeline-labels"><span>{beijingTime(origin)}</span><span>{beijingTime(now)} · 截止点</span></div>
    {!windows.length && <p>暂无成功导出区间，选择时间后可预览本次范围。</p>}
    {windows.length > 0 && <details><summary>查看成功区间（{windows.length}）</summary>{windows.map(window => <p key={window.job.id}>{window.job.id} · {rangeLabel(window.job.range)}</p>)}</details>}
  </div>;
}

export function DeliveryControls({ batchId, executorId }: { batchId?: number; executorId?: string }) {
  const workspace = useWorkspace(), [msg, holder] = message.useMessage();
  const [open, setOpen] = useState(false), [historyOpen, setHistoryOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | undefined>(batchId);
  const [scope, setScope] = useState<'all' | 'time'>('all');
  const [timeMode, setTimeMode] = useState<'absolute' | 'recent'>('absolute');
  const [start, setStart] = useState<number | null>(null), [end, setEnd] = useState<number | null>(null), [sorted, setSorted] = useState(true);
  const [duration, setDuration] = useState<number | null>(1), [unit, setUnit] = useState(60), [anchor, setAnchor] = useState(0);
  const [error, setError] = useState('');
  const requestId = useRef(''), submitting = useRef(false);
  const ids = workspace.executors.find(item => item.id === executorId)?.runtime?.batchIds ?? [];
  const candidates = batchId !== undefined ? workspace.batches.filter(item => item.id === batchId) : ids.map(id => workspace.batches.find(item => item.id === id)).filter(item => item !== undefined);
  const selected = candidates.find(item => item.id === selectedId);
  const jobs = (workspace.exportJobs ?? []).filter(item => batchId !== undefined ? item.batchId === batchId : item.executorId === executorId).toReversed();
  const range: ExportRange = scope === 'all' ? { kind: 'all' } : timeMode === 'recent' ? recentExportRange(duration && duration > 0 ? duration * unit : 1, anchor) : { kind: 'interval', start: start ?? NaN, end: end ?? NaN };
  const selectedJobs = jobs.filter(job => job.batchId === selectedId && job.status === 'succeeded');
  const firstResultAt = (selected?.results ?? []).reduce((first, row) => Math.min(first, row.completedAt), anchor);
  const previousEnd = latestDeliveredEnd(selectedJobs, firstResultAt);
  let count = 0, validation = '';
  try { if (selected) count = selectResults(selected, range).length; }
  catch (issue) { validation = issue instanceof Error ? issue.message : '请检查时间范围'; }
  if (scope === 'time' && timeMode === 'recent' && (!duration || duration <= 0)) validation = '请填写大于 0 的时长';
  const show = () => {
    setSelectedId(batchId ?? ids.at(-1)); setScope('all'); setTimeMode('absolute'); setStart(null); setEnd(null); setDuration(1); setUnit(60); setAnchor(Date.now()); setSorted(true); setError(''); requestId.current = crypto.randomUUID(); submitting.current = false; setOpen(true);
  };
  const submit = () => {
    if (submitting.current || selectedId === undefined) return;
    submitting.current = true;
    try {
      writeWorkspace(createExportJob(readWorkspace(), { requestId: requestId.current, batchId: selectedId, range, sorted, actor: `${CURRENT_USER.name}（${CURRENT_USER.account}）` }));
      setOpen(false); msg.success('导出任务已创建，可在导出记录中查看进度');
    } catch (issue) { setError(issue instanceof Error ? issue.message : '本地保存失败，请重试'); }
    finally { submitting.current = false; }
  };
  return <>{holder}<div className="hawk-delivery-actions"><Button aria-label={batchId !== undefined ? '导出' : '导出结果'} type={batchId !== undefined ? 'link' : 'default'} icon={<ExportOutlined />} onClick={show}>{batchId !== undefined ? '导出' : '导出结果'}</Button><Button aria-label={batchId !== undefined ? `记录（${jobs.length}）` : `导出记录（${jobs.length}）`} type={batchId !== undefined ? 'link' : 'default'} icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>{batchId !== undefined ? `记录（${jobs.length}）` : `导出记录（${jobs.length}）`}</Button></div>
    <Modal title={<div className="hawk-settings-heading"><span>导出处理结果</span><p>选择本次交付的结果范围与文件顺序</p></div>} open={open} centered width={680} className="hawk-settings-modal hawk-export-modal" okText="生成交付文件" cancelText="取消" onCancel={() => setOpen(false)} onOk={submit} okButtonProps={{ disabled: Boolean(validation) || !count }}>
      <div className="hawk-export-form">
        <section className="hawk-settings-section hawk-export-origin">
          <div className="hawk-settings-section-heading"><h3><DatabaseOutlined />导出来源</h3></div>
          {batchId === undefined && <label>导出环节<Select aria-label="导出环节" value={selectedId} onChange={id => { setSelectedId(id); setStart(null); setEnd(null); setError(''); }} options={candidates.map((batch, index) => ({ value: batch.id, label: `第 ${index + 1} 步 · ${batch.name}${index === candidates.length - 1 ? '（最终结果）' : '（中间结果）'}` }))} /></label>}
          {selected && <div className="hawk-export-source"><strong>{selected.name}</strong><span>批次 {selected.id}{hasDownstream(workspace, selected.id) ? ' · 中间结果，尚未经过全部后续处理' : ' · 最终结果'}</span></div>}
        </section>
        <section className="hawk-settings-section">
          <div className="hawk-settings-section-heading"><h3><CalendarOutlined />导出范围</h3><span>北京时间 · UTC+8</span></div>
          <Radio.Group className="hawk-export-range-switch" aria-label="导出范围" optionType="button" value={scope} onChange={event => { setScope(event.target.value); setError(''); }} options={[{ value: 'all', label: '全部已完成' }, { value: 'time', label: '按时间导出' }]} />
          {scope === 'all' && <p className="hawk-export-help">导出当前已完成的成功结果；仍在运行的批次可随时导出。</p>}
          {scope === 'time' && <>
            <Radio.Group className="hawk-export-time-mode" aria-label="时间选择方式" value={timeMode} onChange={event => { setTimeMode(event.target.value); setError(''); }} options={[{ value: 'absolute', label: '指定起止时间' }, { value: 'recent', label: '从现在往前' }]} />
            {timeMode === 'absolute' ? <ConfigProvider locale={zhCN}><div className="hawk-export-times">
              <label>开始时间（含）<ExportDateTimePicker label="开始时间（北京时间）" placeholder="选择开始日期和时间" value={start} onChange={value => { setStart(value); setError(''); }} /></label>
              <label>结束时间（不含）<ExportDateTimePicker label="结束时间（北京时间）" placeholder="选择结束日期和时间" value={end} onChange={value => { setEnd(value); setError(''); }} /></label>
            </div></ConfigProvider> : <div className="hawk-export-relative">
              <span>最近</span><InputNumber aria-label="往前时长" min={0.01} value={duration} onChange={setDuration} /><Select aria-label="时长单位" value={unit} onChange={setUnit} options={[{ value: 1, label: '分钟' }, { value: 60, label: '小时' }, { value: 1440, label: '天' }]} />
              <p>截止点：{beijingTime(anchor)}<Button type="link" size="small" onClick={() => setAnchor(Date.now())}>更新为现在</Button></p>
            </div>}
            <ExportTimeline jobs={selectedJobs} firstResultAt={firstResultAt} now={anchor} range={range} />
            <div className="hawk-export-continuation"><Button size="small" disabled={previousEnd === undefined || previousEnd >= anchor} onClick={() => { setTimeMode('absolute'); setStart(previousEnd!); setEnd(anchor); setError(''); }}>接着上次成功导出</Button><span>{previousEnd === undefined ? '暂无成功导出记录' : `上次截止：${beijingTime(previousEnd)}`}</span></div>
            <p className="hawk-export-help">按结果完成时间筛选，含开始、不含结束。历史区间仅供参考，重叠范围仍完整导出。</p>
          </>}

        </section>
        <section className="hawk-settings-section hawk-export-order-section">
          <div className="hawk-settings-row"><div className="hawk-settings-row-label"><strong>文件顺序</strong><p>{sorted ? '与输入顺序保持一致，适合逐条对应核对。' : '无需保持输入顺序时选择，跳过排序，文件生成更快。'}</p></div><DeliveryOrderSwitch label="文件顺序" value={sorted ? 'sorted' : 'unsorted'} onChange={value => setSorted(value === 'sorted')} /></div>
        </section>
        <div className="hawk-export-preview"><strong>{count.toLocaleString()}</strong><span>条可导出结果</span><p>提交时固定本次结果，之后新完成的数据留给下次。导出不会暂停处理或启动下游。</p></div>
        {selected?.results === undefined && <Alert type="info" showIcon message="历史批次缺少逐条结果与完成时间，不能创建新的范围导出；原交付文件仍可查看。" />}
        {(error || validation) && <Alert type="error" role="alert" message={error || validation} />}
        {!validation && selected?.results !== undefined && !count && <Alert type="info" message="所选范围内暂无可导出的成功结果。" />}
      </div>
    </Modal>
    <Drawer title={batchId !== undefined ? '批次导出记录' : '执行器导出记录'} open={historyOpen} onClose={() => setHistoryOpen(false)} width={880} className="hawk-export-history">
      <p className="hawk-export-help">保留每次导出的范围与结果快照。重新下载不新增记录；重试只生成文件。</p>
      {!jobs.length && <Empty description="暂无导出记录" />}
      {jobs.map(job => <article className="hawk-export-record" key={job.id}>
        <header><div><strong>{job.batchName}</strong><Tag>{job.intermediate ? '中间结果' : '最终结果'}</Tag><JobStatus job={job} /></div><JobActions job={job} onError={text => msg.error(text)} /></header>
        <p>{rangeLabel(job.range)}</p>
        <div className="hawk-export-record-meta"><span>{job.id} · 批次 {job.batchId}{job.step > 0 ? ` · 第 ${job.step} 步` : ''}</span><span>{job.members.length} 条 · {job.sorted ? '按输入顺序' : '不排序'} · {job.trigger === 'finish' ? '结束生成' : '主动导出'}</span><span>快照：{beijingTime(job.snapshotAt)}（北京时间）</span><span>发起人：{job.actor}{job.executorId ? ` · 执行器 ${job.executorId}` : ''}</span></div>
        {job.status === 'generating' && <Progress percent={job.progress} status="active" />}
        {job.status === 'failed' && <Alert type="error" message={job.error} />}
        {job.resource && <Typography.Paragraph copyable className="hawk-export-resource">{job.resource}</Typography.Paragraph>}
        <details><summary>查看快照与尝试记录（{job.attempts.length} 次）</summary>
          {job.attempts.map((attempt, index) => <p className="hawk-export-help" key={index}>第 {index + 1} 次：{beijingTime(attempt.startedAt)} → {attempt.finishedAt ? beijingTime(attempt.finishedAt) : '生成中'}{attempt.error ? ` · ${attempt.error}` : ''}</p>)}
          <Table size="small" rowKey="id" scroll={{ x: 540 }} dataSource={job.members} pagination={{ pageSize: 10, size: 'small' }} columns={[{ title: '结果标识', dataIndex: 'id' }, { title: '输入顺序', dataIndex: 'inputOrder' }, { title: '完成时间（北京时间）', dataIndex: 'completedAt', render: value => beijingTime(value) }]} />
        </details>
      </article>)}
    </Drawer>
  </>;
}
