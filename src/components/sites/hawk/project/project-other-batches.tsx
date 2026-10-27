'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Input, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from '@/lib/demo-navigation';
import { useWorkspace } from '../data/local-workspace';
import { trialVisible } from '../data/trial-instances';
type Entry = { id: string; name: string; kind: 'trial' | 'executor'; state: string; time: number; detail: string; href: string };
const states = { ready: '待执行', running: '运行中', paused: '已暂停', waiting: '待人工确认', completed: '已完成', ended: '已结束' };
export function ProjectOtherBatches({ projectId }: { projectId: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  const workspace = useWorkspace(); const router = useRouter(); const [keyword, setKeyword] = useState('');
  const rows: Entry[] = [
    ...(workspace.trialRuns ?? []).filter(run => run.projectId === projectId && trialVisible(run, now)).map(run => ({ id: run.id, name: run.name + ' · 第 ' + run.sequence + ' 次试跑', kind: 'trial' as const, state: ({ running: '运行中', passed: '已完成', failed: '未完成' })[run.phase], time: run.createdAt, detail: '草稿版本 ' + run.revision + (run.scope ? ' · ' + run.scope : '') + (run.kept ? ' · 已保留' : ''), href: '/hawk/pipeline/editor?draft=' + encodeURIComponent(run.draftId) + '&trial=' + encodeURIComponent(run.id) })),
    ...workspace.executors.filter(executor => executor.projectId === projectId && executor.purpose === 'trial').map(executor => ({ id: executor.id, name: executor.name, kind: 'executor' as const, state: states[executor.runtime?.state ?? 'ready'], time: Date.parse(executor.updatedAt ?? '') || 0, detail: executor.flows.length + ' 个顺序工作流 · ' + workspace.batches.filter(batch => batch.executorId === executor.id && batch.status === '已导出').length + ' 个已完成', href: '/hawk/pipeline/executor?id=' + encodeURIComponent(executor.id) })),
  ].filter(row => (row.name + row.id).toLowerCase().includes(keyword.trim().toLowerCase())).sort((a, b) => b.time - a.time);
  const columns: ColumnsType<Entry> = [
    { title: '实例名称', render: (_, row) => <><Typography.Text strong>{row.name}</Typography.Text><div><Typography.Text type="secondary">{row.id}</Typography.Text></div></> },
    { title: '类型', width: 140, render: (_, row) => <Tag color={row.kind === 'trial' ? 'blue' : 'purple'}>{row.kind === 'trial' ? '草稿试跑批次' : '试跑执行器'}</Tag> },
    { title: '状态', dataIndex: 'state', width: 120 }, { title: '执行范围', dataIndex: 'detail', width: 280 },
    { title: '时间', width: 190, render: (_, row) => row.time ? new Date(row.time).toLocaleString('zh-CN', { hour12: false }) : '-' },
    { title: '操作', width: 140, render: (_, row) => <Button type="link" onClick={() => router.push(row.href)}>{row.kind === 'trial' ? '查看试跑' : '打开执行器'}</Button> },
  ];
  return <section aria-label="其他批次列表"><Alert type="info" showIcon message="草稿试跑与试跑执行器的执行实例统一放在这里" description="草稿试跑沿用当前草稿的历史规则：最多 10 条；未保留记录从启动起 7 天回收，运行中不回收。" style={{ marginBottom: 16 }} /><Input.Search allowClear aria-label="搜索其他批次" placeholder="搜索名称或实例 ID" value={keyword} onChange={event => setKeyword(event.target.value)} style={{ width: 300, marginBottom: 16 }} /><Table<Entry> rowKey="id" columns={columns} dataSource={rows} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 1120 }} locale={{ emptyText: '当前项目暂无试跑实例' }} /></section>;
}
