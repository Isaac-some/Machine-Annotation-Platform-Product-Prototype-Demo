"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/demo-navigation";
import { Breadcrumb, Button, Card, Descriptions, Input, message, Modal, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { DatabaseOutlined, EyeOutlined, InfoCircleOutlined, PlusOutlined, ReloadOutlined, StarFilled, StarOutlined, ThunderboltOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { CREATED_AT_OPTIONS } from "../data/mock-projects";
import { BATCH_STATUS_COLOR, WORKFLOW_OPTIONS, type BatchRow } from "../data/mock-batches";
import { ExecutorComposer } from "../pipeline/executor-composer";
import { publishedFlows, readWorkspace, saveExecutor, useWorkspace, writeWorkspace, matchesCreatedAt, WORKSPACE_KEY } from "../data/local-workspace";
import { BatchCreateDialog, CostDialog, ProjectEditDialog, ResourceDialogs } from "./project-dialogs";
import { ProjectExecutors } from './project-executors';

export function ProjectDetailPage() {
  const params = { id: useSearchParams().get("id") ?? "234" }; const router = useRouter(); const workspace = useWorkspace(); const projectId = Number(params.id);
  const query = useSearchParams();
  const activeTab = query.get('tab') === 'executors' ? 'executors' : 'batches';
  const project = workspace.projects.find(row => row.id === projectId);
  const [editOpen, setEditOpen] = useState(false); const [executorOpen, setExecutorOpen] = useState(false);
  const [keyword, setKeyword] = useState(""); const [createdAt, setCreatedAt] = useState("所有时间"); const [workflow, setWorkflow] = useState<string>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]); const [batchOpen, setBatchOpen] = useState(false); const [cloneSource, setCloneSource] = useState<BatchRow>();
  const [resourceOpen, setResourceOpen] = useState(false); const [historyOpen, setHistoryOpen] = useState(false); const [costOpen, setCostOpen] = useState(false); const [costBatch, setCostBatch] = useState<BatchRow>();
  const [operation, setOperation] = useState<{ ids: number[]; op: string } | null>(null); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [msg, holder] = message.useMessage();
  useEffect(() => {
    try {
      const current = readWorkspace();
      const saved = localStorage.getItem(WORKSPACE_KEY);
      if (saved && saved !== JSON.stringify(current)) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.projects) && Array.isArray(parsed.groups) && Array.isArray(parsed.executors) && Array.isArray(parsed.batches)) writeWorkspace(current);
      }
    } catch { msg.error('项目关联保存失败，请检查浏览器存储空间'); }
  }, [projectId, msg]);
  const rows = useMemo(() => workspace.batches.filter(row => !row.executorId && row.projectId === projectId && (!keyword.trim() || String(row.id).includes(keyword.trim()) || row.name.includes(keyword.trim())) && (!workflow || row.workflow === workflow) && matchesCreatedAt(row.createdAt, createdAt)), [workspace.batches, projectId, keyword, workflow, createdAt]);
  const allowed = (row: BatchRow, op: string) => !row.executorId && (op === "开始" ? row.status === "初始化" : op === "暂停" ? row.status === "运行中" : op === "启动" ? row.status === "已暂停" : op === "结束" ? ["运行中", "已暂停"].includes(row.status) : row.status === "部分失败");
  const numeric = (value: number) => value.toLocaleString();
  const columns: ColumnsType<BatchRow> = [
    { title: "批次ID", dataIndex: "id", width: 80 },
    { title: "批次名称", dataIndex: "name", width: 180, ellipsis: true },
    { title: "工作流", dataIndex: "workflow", width: 200, ellipsis: true },
    { title: "状态", dataIndex: "status", width: 90, render: (value: BatchRow["status"]) => <Tag color={BATCH_STATUS_COLOR[value]}>{value}</Tag> },
    { title: "总数量", dataIndex: "total", width: 100, render: numeric }, { title: "成功", dataIndex: "success", width: 100, render: numeric }, { title: "失败", dataIndex: "failed", width: 100, render: numeric }, { title: "已过滤", dataIndex: "filtered", width: 100, render: numeric },
    { title: "处理进度", dataIndex: "progress", width: 110, render: (value: number) => String(value) + "%" },
    { title: "预估成本", dataIndex: "cost", width: 110, render: (value: string, row) => <Space size={2}><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => { setCostBatch(row); setCostOpen(true); }} />{value}</Space> },
    { title: "创建时间", dataIndex: "createdAt", width: 180, sorter: (a, b) => a.createdAt.localeCompare(b.createdAt), showSorterTooltip: false },
    { title: "操作", fixed: "right", width: 270, render: (_, row) => <Space size={0}>{["开始", "暂停", "启动", "结束", "重试"].map(op => <Button type="link" size="small" key={op} style={{ paddingInline: 3, fontSize: 12 }} disabled={!allowed(row, op)} onClick={() => setOperation({ ids: [row.id], op })}>{op}</Button>)}<Button type="link" size="small" style={{ paddingInline: 3, fontSize: 12 }} onClick={() => router.push(row.executorId ? "/hawk/pipeline/executor?id=" + encodeURIComponent(row.executorId) : "/hawk/project/detail/" + projectId + "/batch/" + row.id)}>详情</Button><Button type="link" size="small" style={{ paddingInline: 3, fontSize: 12 }} onClick={() => { setCloneSource(row); setBatchOpen(true); }}>克隆</Button></Space> },
  ];
  if (!project) return <div style={{ padding: 20 }}><Card>项目不存在（本地演示数据 ID：{params.id}）</Card></div>;
  const totalCost = workspace.batches.filter(row => row.projectId === projectId).reduce((sum, row) => sum + (Number(row.cost.replace(/[^0-9.-]/g, "")) || 0), 0);
  return <div className="hawk-project-detail" style={{ padding: 20 }}>{holder}
    <Breadcrumb style={{ marginBottom: 8 }} items={[{ title: <a onClick={() => router.push("/hawk/project")}>项目管理</a> }, { title: "项目详情" }]} />
    <Typography.Title level={4} style={{ margin: "0 0 24px", fontSize: 20, lineHeight: "32px" }}>项目详情</Typography.Title>
    <Card variant="borderless" title="基本信息" extra={<Space><Button type="link" onClick={() => setEditOpen(true)}>编辑</Button><Button type="text" icon={project.favorite ? <StarFilled style={{ color: "#faad14" }} /> : <StarOutlined />} onClick={() => { try { writeWorkspace({ ...workspace, projects: workspace.projects.map(row => row.id === projectId ? { ...row, favorite: !row.favorite } : row) }); } catch { msg.error("关注状态保存失败，请重试"); } }} /></Space>}>
      <Descriptions column={3} size="small"><Descriptions.Item label="项目名称">{project.name}</Descriptions.Item><Descriptions.Item label="项目负责人"><Tag color="blue">{project.owner}</Tag></Descriptions.Item><Descriptions.Item label="项目研发负责人">{(project.researchOwners ?? (project.researchOwner ? [project.researchOwner] : [])).map(name => <Tag color="green" key={name}>{name}</Tag>)}{!project.researchOwner && !project.researchOwners?.length && "-"}</Descriptions.Item><Descriptions.Item label="项目参与者">{project.participants.length ? project.participants.map(name => <Tag color="purple" key={name}>{name}</Tag>) : "-"}</Descriptions.Item><Descriptions.Item label="创建时间">{project.createdAt}</Descriptions.Item><Descriptions.Item label="项目预估金额"><Space size={4}><Tooltip title="按供应商参考价及当前已记录用量估算"><InfoCircleOutlined style={{ color: "#1677ff" }} /></Tooltip><strong>¥ {totalCost.toFixed(2)}</strong><EyeOutlined /><Button type="link" size="small" onClick={() => { setCostBatch(undefined); setCostOpen(true); }}>查看详情</Button></Space></Descriptions.Item></Descriptions>
    </Card>
    <Card variant="borderless" style={{ marginTop: 14, background: "#f5f9ff", border: "1px solid #d8e7fb" }} styles={{ body: { padding: "14px 18px" } }}><div style={{ display: "flex", alignItems: "center", gap: 16 }}><div style={{ border: "1px solid #b8c9de", borderRadius: 8, width: 44, height: 44, display: "grid", placeItems: "center" }}><DatabaseOutlined style={{ fontSize: 24, color: "#1677ff" }} /></div><div style={{ flex: 1 }}><Typography.Title level={5} style={{ margin: 0 }}>资源信息录入</Typography.Title><Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>交付研发可以为项目录入资源信息，配置物料类型、批次关联和字段映射</Typography.Paragraph></div><Space><Button onClick={() => setHistoryOpen(true)}>查看记录</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setResourceOpen(true)}>资源信息录入</Button></Space></div></Card>
    <Card variant="borderless" style={{ marginTop: 16 }} tabList={[{ key: 'batches', tab: '批次列表' }, { key: 'executors', tab: '执行器' }]} activeTabKey={activeTab} onTabChange={key => { setSelectedRowKeys([]); router.replace(`/hawk/project/detail/${projectId}?tab=${key}`, { scroll: false }); }} tabBarExtraContent={<Space><Button type="primary" icon={<ThunderboltOutlined />} onClick={() => setExecutorOpen(true)}>新建执行器</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => { setCloneSource(undefined); setBatchOpen(true); }}>新增批次</Button></Space>}>
      {activeTab === 'executors' ? <ProjectExecutors projectId={projectId} /> : <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}><Space size={8}><span>关键词：</span><Input allowClear placeholder="批次ID/名称" style={{ width: 200 }} value={keyword} onChange={event => { setKeyword(event.target.value); setPage(1); }} /></Space><Space size={8}><span>创建时间：</span><Select value={createdAt} onChange={value => { setCreatedAt(value); setPage(1); }} style={{ width: 130 }} options={CREATED_AT_OPTIONS.map(value => ({ value }))} /></Space><Space size={8}><span>工作流：</span><Select allowClear placeholder="请选择工作流" style={{ width: 200 }} value={workflow} onChange={value => { setWorkflow(value); setPage(1); }} options={Array.from(new Set([...WORKFLOW_OPTIONS, ...workspace.batches.filter(row => row.projectId === projectId).map(row => row.workflow)])).map(value => ({ value }))} /></Space><Button disabled={!selectedRowKeys.length} onClick={() => setOperation({ ids: selectedRowKeys.map(Number), op: "暂停" })}>批量操作</Button><span style={{ flex: 1 }} /><Button onClick={() => { setKeyword(""); setCreatedAt("所有时间"); setWorkflow(undefined); setPage(1); }}>重 置</Button><Button type="primary" onClick={() => setPage(1)}>查 询</Button><Button icon={<ReloadOutlined />} onClick={() => { setSelectedRowKeys([]); setPage(1); }}>刷新</Button></div>
      <Table<BatchRow> rowKey="id" columns={columns} dataSource={rows} size="middle" rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys, getCheckboxProps: row => ({ disabled: Boolean(row.executorId) }) }} pagination={{ total: rows.length, current: Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize))), pageSize, showTotal: (total, range) => "第 " + range[0] + "-" + range[1] + " 条/总共 " + total + " 条", showSizeChanger: true, pageSizeOptions: [10, 20, 50], onChange: (nextPage, nextSize) => { setPage(nextSize === pageSize ? nextPage : 1); setPageSize(nextSize); } }} scroll={{ x: 1850 }} />
      </>}
    </Card>
    <ProjectEditDialog project={project} open={editOpen} onClose={() => setEditOpen(false)} />
    <ExecutorComposer open={executorOpen} flows={executorOpen ? publishedFlows() : []} onCancel={() => setExecutorOpen(false)} onCreated={executor => { saveExecutor({ ...executor, projectId }); router.push("/hawk/pipeline/executor?id=" + encodeURIComponent(executor.id)); }} />
    <BatchCreateDialog key={cloneSource?.id ?? "create"} open={batchOpen} projectId={projectId} source={cloneSource} onClose={() => setBatchOpen(false)} onCreated={() => { setPage(1); router.replace(`/hawk/project/detail/${projectId}?tab=batches`, { scroll: false }); }} />
    <CostDialog project={project} batch={costBatch} open={costOpen} onClose={() => setCostOpen(false)} />
    <ResourceDialogs projectId={projectId} open={resourceOpen} historyOpen={historyOpen} onClose={() => setResourceOpen(false)} onHistoryClose={() => setHistoryOpen(false)} />
    <BatchOperationDialog operation={operation} onClose={() => setOperation(null)} onSaved={() => { setSelectedRowKeys([]); setOperation(null); }} />
    <style jsx global>{".hawk-project-detail .ant-card-head{padding-inline:24px;border-bottom:0;min-height:56px}.hawk-project-detail .ant-card-body{padding:12px 24px 20px}.hawk-project-detail .ant-table-cell{padding-inline:8px!important}.hawk-project-detail .ant-table-cell-fix-right{white-space:nowrap}"}</style>
  </div>;
}

function BatchOperationDialog({ operation, onClose, onSaved }: { operation: { ids: number[]; op: string } | null; onClose: () => void; onSaved: () => void }) {
  const workspace = useWorkspace(); const [op, setOp] = useState<string | null>(null); const [msg, holder] = message.useMessage();
  const selectedOp = op ?? operation?.op ?? "暂停";
  return <Modal title={operation && operation.ids.length > 1 ? "批量操作" : "确认操作"} open={!!operation} onCancel={() => { setOp(null); onClose(); }} okText="保存本地状态" cancelText="取消" onOk={() => {
    if (!operation) return;
    if (workspace.batches.some(row => operation.ids.includes(row.id) && row.executorId)) { msg.error("执行器批次请前往工作台统一操作"); return; }
    const statuses: Record<string, BatchRow["status"]> = { "开始": "运行中", "启动": "运行中", "暂停": "已暂停", "结束": "已结束", "重试": "运行中" };
    try { const timestamp = new Date().toLocaleString("sv-SE", { hour12: false }); writeWorkspace({ ...workspace, batches: workspace.batches.map(row => operation.ids.includes(row.id) ? { ...row, status: statuses[selectedOp], updatedAt: timestamp } : row) }); setOp(null); onSaved(); msg.success("本地状态已保存，未执行真实任务"); } catch { msg.error("状态保存失败，请重试"); }
  }}>{holder}<Typography.Paragraph>已选择 {operation?.ids.length ?? 0} 个批次。本操作仅演示状态变化，不连接后端或生成处理结果。</Typography.Paragraph><Select value={selectedOp} onChange={setOp} options={["开始", "暂停", "启动", "结束", "重试"].map(value => ({ value }))} style={{ width: "100%" }} /></Modal>;
}
