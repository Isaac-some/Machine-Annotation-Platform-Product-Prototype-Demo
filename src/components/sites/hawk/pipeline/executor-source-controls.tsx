'use client';

import { useState } from 'react';
import { Alert, Button, InputNumber, Space, Tag, message } from 'antd';
import { readWorkspace, writeWorkspace, type LocalExecutor } from '../data/local-workspace';
import { recordStreamSourceEvent, tickStream, type StreamSourceEvent } from '../data/executor-streaming';

/** Explicit simulation controls, never presented as an actual storage connection. */
export function ExecutorSourceControls({ executor: e }: { executor: LocalExecutor }) {
  const [count, setCount] = useState<number | null>(10);
  const [msg, holder] = message.useMessage();
  const source = e.stream?.source;
  if (!source) return null;
  const send = async (signal: StreamSourceEvent) => {
    try {
      if (!await writeWorkspace(recordStreamSourceEvent(readWorkspace(), e.id, signal))) throw new Error('本地保存失败，操作未生效');
    } catch (issue) { msg.error(issue instanceof Error ? issue.message : '源事件保存失败'); }
  };
  const idle = async () => {
    try {
      const current = readWorkspace(), run = current.executors.find(x => x.id === e.id)!;
      if (!await writeWorkspace(tickStream(current, e.id, 0, run.stream!.source!.lastActivityAt + (run.streamPolicy?.idleTimeoutMs ?? 600000)))) throw new Error('本地保存失败');
    } catch (issue) { msg.error(issue instanceof Error ? issue.message : '操作失败'); }
  };
  const done = e.stream?.phase === 'completed';
  return <section className="hawk-stream-source" aria-label="输入源状态">
    {holder}<Space wrap><strong>输入源状态</strong><Tag>{source.closed ? '供数已结束' : source.error ? '检查失败' : e.stream?.phase === 'review' ? '取数已暂停' : source.waiting ? '等待新数据' : '持续接收'}</Tag></Space>
    {source.error && <Alert type="error" showIcon message={source.error} />}
    {e.stream?.reason && <p>{e.stream.reason}</p>}
    <details><summary>本地演示：模拟输入源事件</summary>
      <p>以下按钮仅模拟源消息，未连接真实存储服务。暂停后收到新数据或心跳不会自动继续；请在主界面操作。</p>
      <Space wrap>
        <InputNumber aria-label="模拟新增数据量" min={1} precision={0} value={count} onChange={setCount} disabled={source.closed || done} />
        <Button disabled={source.closed || done || count === null || count < 1} onClick={() => void send({ kind: 'data', count: count! })}>模拟新增数据</Button>
        <Button disabled={source.closed || done} onClick={() => void send({ kind: 'message' })}>源消息</Button>
        <Button disabled={source.closed || done} onClick={() => void send({ kind: 'heartbeat' })}>源心跳</Button>
        <Button disabled={source.closed || done} onClick={() => void send({ kind: 'progress' })}>传输进度</Button>
        <Button disabled={source.closed || done || e.runtime?.state !== 'running' || e.stream!.admitted < (e.inputCount ?? 0)} onClick={() => void idle()}>模拟无活动超时</Button>
        <Button disabled={source.closed || done} onClick={() => void send({ kind: 'error', message: '输入源检查失败（本地模拟）' })}>模拟检查失败</Button>
        <Button disabled={source.closed || done || !source.error} onClick={() => void send({ kind: 'recovered' })}>检查恢复成功</Button>
        <Button disabled={source.closed || done} onClick={() => void send({ kind: 'end' })}>明确供数结束</Button>
      </Space>
    </details>
  </section>;
}
