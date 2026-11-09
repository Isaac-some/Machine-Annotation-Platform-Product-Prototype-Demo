'use client';
import { useState } from 'react';
import { Alert, Button, InputNumber, Modal, Progress, Select, Space, Switch, Table, Typography } from 'antd';
import type { BatchRow } from '../data/mock-batches';
import { evaluateAlarm, newAlarm, prepareBatchRetry } from '../data/batch-common';
import { readWorkspace, writeWorkspace } from '../data/local-workspace';
export function BatchCommonControls({ batch, onUpdate }: { batch: BatchRow; onUpdate: (p: Partial<BatchRow>) => void }) {
  const [open, setOpen] = useState(false), [retry, setRetry] = useState(false), [node, setNode] = useState(batch.nodes[0]?.seq), [error, setError] = useState(''), [details, setDetails] = useState(false);
  const [ratio, setRatio] = useState<number | null>(20), [clock, setClock] = useState(0);
  const alarm = batch.alarmDemo ?? newAlarm();
  const updateAlarm = (delta: number) => { const now = clock + delta; setClock(now); onUpdate({ alarmDemo: evaluateAlarm(alarm, ratio ?? 0, true, now) }); };
  return <section style={{ padding: '12px 20px', borderBottom: '1px solid #eee', background: '#fff' }} aria-label="批次重试与告警">
    <Space wrap><Button onClick={() => setOpen(true)}>梯度告警</Button><Button disabled={!batch.failed && !batch.batchIssues?.length} onClick={() => setDetails(true)}>失败详情{batch.batchIssues?.length ? ` · ${batch.batchIssues.length} 项批次问题` : ''}</Button>{!batch.executorId && <Button disabled={!['已暂停', '部分失败'].includes(batch.status) || batch.failed < 1 || Boolean(batch.finish) || Boolean(batch.retryTask && batch.retryTask.phase !== 'done')} onClick={() => { setRetry(true); setError(''); }}>暂停后优先重试失败数据</Button>}<Typography.Text type="secondary">告警只通知；普通批次重试与执行器流式重试分别控制。</Typography.Text></Space>
    {batch.retryTask && <div style={{ marginTop: 12 }}><Alert type={batch.retryTask.phase === 'done' ? 'success' : 'info'} showIcon message={batch.retryTask.phase === 'preparing' ? '扫描准备完整输入中，rowkey 标记不代表可以即时重试' : batch.retryTask.phase === 'retrying' ? '失败数据优先处理，尚未开始的数据保持等待' : `失败补救完成 ${batch.retryTask.recovered} 条；可继续处理尚未开始的数据`} />{batch.retryTask.phase === 'preparing' && <Progress percent={batch.retryTask.preparation} />}</div>}
    <Modal title="梯度告警规则与窗口演示" width={680} open={open} onCancel={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>关闭</Button>}>
      <Space wrap><span>失败率梯度告警</span><Switch checked={batch.alarmEnabled !== false} onChange={alarmEnabled => onUpdate({ alarmEnabled })} /><Typography.Text type="secondary">与开始 / 结束通知独立</Typography.Text></Space>
      <Typography.Paragraph style={{ marginTop: 16 }}>默认处理量达到总量 10% 后起报；可改条数或百分比。失败率 20% 为飞书消息，50% / 80% 为飞书加急；默认不短信或电话。同批每档最多一次，最多三次。</Typography.Paragraph>
      <Space wrap><span>起报方式</span><Select aria-label="告警起报方式" value={batch.alarmGate?.kind ?? 'percent'} style={{ width: 150 }} options={[{ value: 'percent', label: '已处理占总量' }, { value: 'count', label: '已处理条数' }]} onChange={kind => onUpdate({ alarmGate: { kind, value: batch.alarmGate?.value ?? 10 } })} /><InputNumber aria-label="告警起报门槛" min={0} value={batch.alarmGate?.value ?? 10} onChange={value => onUpdate({ alarmGate: { kind: batch.alarmGate?.kind ?? 'percent', value: value ?? 10 } })} /></Space>
      <div style={{ marginTop: 16 }}>{[20,50,80].map(n => <Space key={n} style={{ marginRight: 12 }}><span>{n}%</span><Select aria-label={`${n}%档提醒方式`} value={batch.alarmChannels?.[n] ?? (n===20?'飞书消息':'飞书加急')} options={['飞书消息','飞书加急','短信','电话'].map(value=>({value,label:value}))} onChange={value=>onUpdate({alarmChannels:{...batch.alarmChannels,[n]:value}})} /></Space>)}</div>
      <Alert style={{ margin: '16px 0' }} type="info" showIcon message="下面使用合成失败率演示：首命中开启 1 分钟窗口，窗口内只保留最高档，升档不重计时。" description="生产过滤 / 重试的分母、运行结束时窗口发送等口径待研发评审。流式下游总量未知时，不计算虚构百分比。当前不发送真实通知。" />
      <Space wrap><span>演示失败率</span><InputNumber aria-label="演示失败率" min={0} max={100} value={ratio} onChange={setRatio} suffix="%" /><Button disabled={batch.alarmEnabled === false} onClick={() => updateAlarm(0)}>命中档位</Button><Button disabled={batch.alarmEnabled === false} onClick={() => updateAlarm(60_000)}>推进 1 分钟</Button></Space>
      <p>已发送最高档 {alarm.highestSent}% · 窗口内最高档 {alarm.pending}% · {alarm.windowUntil === undefined ? '无待发窗口' : '窗口倒计时中'}</p>
      <Table size="small" pagination={false} rowKey="level" dataSource={alarm.sent} columns={[{ title: '失败率档位', dataIndex: 'level', render: n => `${n}%` }, { title: '通知方式', dataIndex: 'level', key: 'channel', render: n => `${batch.alarmChannels?.[n] ?? (n === 20 ? '飞书消息' : '飞书加急')}（模拟）` }]} />
    </Modal>
    <Modal title="失败详情" open={details} width={1080} onCancel={() => setDetails(false)} footer={<Button onClick={() => setDetails(false)}>关闭</Button>}>
      <div className="hawk-batch-failure-detail">
        <section aria-labelledby="batch-issues-title">
          <div className="hawk-batch-failure-heading"><strong id="batch-issues-title">批次总体问题</strong><span>{batch.batchIssues?.length ?? 0} 项</span></div>
          {batch.batchIssues?.length ? <div className="hawk-batch-issue-list">{batch.batchIssues.map((issue, index) => <Alert key={`${issue.code}-${index}`} type={issue.blocking === false ? 'warning' : 'error'} showIcon message={issue.title} description={issue.message} />)}</div> : <div className="hawk-batch-failure-empty">当前没有批次级问题</div>}
          <Typography.Paragraph type="secondary">批次级问题会阻止开始或启动；修复后由校验结果清除。此原型展示合成信息，不代表已接入生产校验服务。</Typography.Paragraph>
        </section>
        <section aria-labelledby="row-failures-title">
          <div className="hawk-batch-failure-heading"><strong id="row-failures-title">逐条节点失败</strong><span>{batch.failureDetails?.length ?? 0} 条</span></div>
          <Typography.Paragraph type="secondary">节点列对应画布具体算子；只有可信关联才定位。</Typography.Paragraph>
          <Table size="small" pagination={false} scroll={{x:700}} rowKey={(_, index) => `${batch.id}-${index}`} dataSource={batch.failureDetails ?? []} columns={[{title:'节点',dataIndex:'nodeSeq',render:n=>{const node=batch.nodes.find(x=>x.seq===n);return node?`${n} · ${node.name}`:'无法定位';}},{title:'rowkey',dataIndex:'rowkey'},{title:'错误类别',dataIndex:'errorCode'},{title:'说明',dataIndex:'message'}]}/>
          {!batch.failureDetails?.length && <div className="hawk-batch-failure-empty">当前没有逐条节点失败记录</div>}
        </section>
      </div>
    </Modal>
    <Modal title="选择重试起始节点" open={retry} okText="准备失败输入" onCancel={() => setRetry(false)} onOk={() => { try { const w = readWorkspace(), b = w.batches.find(b => b.id === batch.id)!; const changed = prepareBatchRetry(b, node!); writeWorkspace({ ...w, batches: w.batches.map(x => x.id === b.id ? changed : x) }); setRetry(false); } catch (e) { setError(e instanceof Error ? e.message : '准备失败'); } }}>
      <Typography.Paragraph>按整个工作流最终失败记录确定范围，从所选算子重跑。排除全流程成功和正常过滤记录；失败优先，完成后可继续尚未开始的数据。</Typography.Paragraph><Select aria-label="重试起始节点" value={node} style={{ width: '100%' }} options={batch.nodes.map(n => ({ value: n.seq, label: `${n.seq} · ${n.name}` }))} onChange={setNode} />
      <Alert style={{ marginTop: 16 }} type="warning" message="输入可能需要全量扫描；本地仅模拟准备与数量恢复，不承诺生产即时恢复。" />{error && <Alert type="error" message={error} />}
    </Modal>
  </section>;
}
