'use client';

import { useState } from 'react';
import { useRouter } from "@/lib/demo-navigation";
import { Button, Input, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useWorkspace, type LocalExecutor } from '../data/local-workspace';
import { executorSettings } from '../data/executor-settings';

const states = { ready: '待执行', running: '运行中', paused: '已暂停', waiting: '待人工确认', completed: '已完成', ended: '已结束' };

export function ProjectExecutors({ projectId }: { projectId: number }) {
  const router = useRouter();
  const workspace = useWorkspace();
  const [keyword, setKeyword] = useState('');
  const rows = workspace.executors.filter(executor => executor.purpose !== 'trial' && executor.projectId === projectId && `${executor.name} ${executor.id}`.toLowerCase().includes(keyword.trim().toLowerCase()));
  const columns: ColumnsType<LocalExecutor> = [
    { title: '执行器名称', width: 220, render: (_, executor) => <><Typography.Text strong>{executor.name}</Typography.Text><div><Typography.Text type="secondary" style={{ fontSize: 11 }}>{executor.id}</Typography.Text></div></> },
    { title: '执行顺序', width: 320, render: (_, executor) => <span title={executor.flows.map(flow => flow.name).join(' → ')}>{executor.flows.map(flow => flow.name).join(' → ')}</span> },
    { title: '状态', width: 120, render: (_, executor) => <Tag color={executor.runtime?.state === 'running' ? 'processing' : executor.runtime?.state === 'completed' ? 'success' : executor.runtime?.state === 'waiting' ? 'warning' : 'default'}>{states[executor.runtime?.state ?? 'ready']}</Tag> },
    { title: '执行模式', width: 100, render: (_, executor) => ({ default: '默认', rigorous: '严谨', target: '目标' })[executorSettings(executor.settings).mode] },
    { title: '运行进度', width: 170, render: (_, executor) => {
      const completed = workspace.batches.filter(batch => batch.executorId === executor.id && batch.status === '已导出').length;
      return <Space direction="vertical" size={0}><span>{completed} / {executor.flows.length} 已完成</span>{executor.runtime?.started && !['completed', 'ended'].includes(executor.runtime.state) && <Typography.Text type="secondary" style={{ fontSize: 11 }}>当前第 {executor.runtime.currentIndex + 1} 步</Typography.Text>}</Space>;
    } },
    { title: '更新时间', width: 170, render: (_, executor) => {
      const times = [executor.updatedAt, ...workspace.batches.filter(batch => batch.executorId === executor.id).map(batch => batch.updatedAt)].filter((time): time is string => Boolean(time)).map(time => new Date(time).getTime()).filter(Number.isFinite);
      return times.length ? new Date(Math.max(...times)).toLocaleString('zh-CN', { hour12: false }) : '-';
    } },
    { title: '操作', fixed: 'right', width: 140, render: (_, executor) => <Button type="link" onClick={() => router.push('/hawk/pipeline/executor?id=' + encodeURIComponent(executor.id))}>打开执行器</Button> },
  ];
  return <section aria-label="项目执行器列表"><Input.Search allowClear aria-label="搜索项目执行器" placeholder="搜索执行器名称或 ID" value={keyword} onChange={event => setKeyword(event.target.value)} style={{ width: 300, maxWidth: '100%', marginBottom: 16 }} /><Table<LocalExecutor> rowKey="id" dataSource={rows} columns={columns} scroll={{ x: 1240 }} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: '当前项目还没有执行器' }} /></section>;
}
