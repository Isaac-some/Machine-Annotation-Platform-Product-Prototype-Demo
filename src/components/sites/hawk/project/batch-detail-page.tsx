"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/demo-navigation";
import { Alert, Breadcrumb, Button, Divider, Form, Input, InputNumber, message, Modal, Popover, Select, Space, Switch, Table, Tooltip, Typography } from "antd";
import { CaretRightOutlined, CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, ExpandOutlined, MinusOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusOutlined, RedoOutlined, RightOutlined, StopOutlined } from "@ant-design/icons";
import { NODE_STATUS, STATUS_PILL, type BatchNode, type BatchRow, type BatchStatus, type BatchSystemConfig } from "../data/mock-batches";
import { readWorkspace, useWorkspace, writeWorkspace } from "../data/local-workspace";
import { BatchDeliveryStatus, DeliveryControls, FinishControl, downloadDelivery } from './delivery-controls';
import { withDeliveryExamples } from '../data/delivery-examples';
import { enableSimulation, finishStandaloneBatch } from '../data/workspace-runtime';
import "./batch-detail.css";
import { hasBlockingBatchIssues, prepareBatchRetry } from '../data/batch-common';
import { BatchCommonControls } from './batch-common-controls';

const FIELD_OPTIONS = ["dir", "tos_path", "ext", "rowkey"];
const DEFAULT_CONFIG: BatchSystemConfig = {
  primaryKey: "rowkey", batchQps: 100, reusePod: false, emptyOutput: false,
  redis: { addr: "", password: "", db: 0 }, singleInstance: true, memoryBoost: false,
  memoryPercent: 0, streaming: false, circleOutput: true, customCid: "", jsonl: false,
  jsonlFields: [], jsonlFilename: "", json: false, jsonFields: [], jsonFilenameField: "", collectionType: "图片",
};
const NODE_W = 246;
const NODE_H = 84;
const position = (index: number) => ({ x: (index % 3) * 340, y: Math.floor(index / 3) * 164 });

function FlowNodeCard({ node, onCost, onRetry, retryEnabled = true }: { node: BatchNode; onCost: () => void; onRetry: () => void; retryEnabled?: boolean }) {
  const status = NODE_STATUS[node.status];
  return <div className="hawk-batch-node">
    <div className="hawk-batch-node-main">
      <span className="hawk-batch-node-number">{node.seq}</span>
      <span className="hawk-batch-node-name" title={node.name}>{node.name}</span>
      <div className="hawk-batch-node-status">
        <span style={{ color: status.color, background: status.bg }}>{node.status}</span>
        <Button type="text" size="small" disabled={!retryEnabled} icon={<RedoOutlined />} onClick={onRetry}>重试</Button>
      </div>
    </div>
    <div className="hawk-batch-node-cost"><strong>{node.cost}</strong><Button type="link" size="small" onClick={onCost}>成本详情</Button></div>
  </div>;
}

export function BatchDetailPage() {
  const workspace = useWorkspace();
  const query = useSearchParams();
  const params = { id: query.get("id") ?? "234", batchId: query.get("batchId") ?? "" };
  const router = useRouter();
  const projectId = Number(params.id), batchId = Number(params.batchId);
  const showExample = query.get('example') === 'delivery';
  useEffect(() => {
    if (!showExample) return;
    const current = readWorkspace(), next = withDeliveryExamples(current);
    if (next !== current) writeWorkspace(next);
  }, [showExample]);
  const batch = workspace.batches.find(item => item.id === batchId && item.projectId === projectId);
  if (!batch) return <div style={{ padding: 24 }}>批次不存在（本地项目：{params.id}，批次：{params.batchId}）</div>;
  const workbench = () => router.push('/hawk/pipeline/executor?id=' + encodeURIComponent(batch.executorId!));
  return <>{batch.executorId && <Alert type="info" message="此批次由执行器统一调度，前往工作台操作运行和输入。" action={<Button onClick={workbench}>打开执行器</Button>} />}<BatchDetailPanel key={batch.id} batch={batch} projectName={workspace.projects.find(item => item.id === projectId)?.name ?? '-'}
    execution={batch.executorId ? { runMode: workspace.executors.find(e => e.id === batch.executorId)?.runMode, inputSource: batch.inputFromBatchId ? `来自本执行器 Batch ${batch.inputFromBatchId}` : '本次输入', waiting: !batch.inputResource, canAction: () => false, onAction: workbench, onEditInput: workbench, inputEditable: false } : undefined}
    onUpdate={patch => { const current = readWorkspace(); writeWorkspace({ ...current, batches: current.batches.map(item => item.id === batch.id ? { ...item, ...patch } : item) }); }}
    breadcrumb={<Breadcrumb items={[{ title: <a onClick={() => router.push('/hawk/project')}>项目管理</a> }, { title: <a onClick={() => router.push('/hawk/project/detail/' + projectId)}>项目详情</a> }, { title: '批次详情' }]} />} /></>;
}

export interface BatchExecutionContext {
  runMode?: 'batch' | 'stream';
  activeRunMs?: number;
  showRunClock?: boolean;
  inputSource: string;
  showInputSource?: boolean;
  showBatchCaption?: boolean;
  waiting: boolean;
  canAction: (action: string) => boolean;
  onAction: (action: string) => void;
  onEditInput: () => void;
  inputEditable: boolean;
}

/** Shared by the project batch route and the executor workbench. */
export function BatchDetailPanel({ batch, projectName, onUpdate, breadcrumb, execution }: {
  batch: BatchRow; projectName: string; onUpdate: (patch: Partial<BatchRow>) => void;
  breadcrumb?: ReactNode; execution?: BatchExecutionContext;
}) {
  const batchId = batch.id;
  const [msg, contextHolder] = message.useMessage();
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [draftFields, setDraftFields] = useState<Array<string | undefined>>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [failureDetailsOpen, setFailureDetailsOpen] = useState(false);
  const [configForm] = Form.useForm<BatchSystemConfig>();
  const [costTarget, setCostTarget] = useState<"batch" | number | null>(null);
  const [inputOpen, setInputOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 1000, height: 520 });
  const graphRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const nodeCount = batch?.nodes.length ?? 0;
  const graphWidth = Math.min(3, Math.max(nodeCount, 1)) * 340 - 94;
  const graphHeight = Math.ceil(Math.max(nodeCount, 1) / 3) * 164 - 80;
  const embedded = Boolean(execution);
  const fitGraph = (width: number, height: number) => {
    const top = embedded ? 40 : 70, bottom = embedded ? 16 : 70;
    const next = Math.max(0.25, Math.min(1, (width - (embedded ? 48 : 120)) / graphWidth, (height - top - bottom) / graphHeight));
    return { scale: next, offset: { x: (width - graphWidth * next) / 2, y: top + (height - top - bottom - graphHeight * next) / 2 } };
  };

  useEffect(() => {
    const element = graphRef.current;
    if (!element) return;
    const fit = () => {
      const width = element.clientWidth, height = element.clientHeight;
      const { scale: nextScale, offset: nextOffset } = fitGraph(width, height);
      setViewport({ width, height });
      setScale(nextScale);
      setOffset(nextOffset);
    };
    fit();
    const observer = new ResizeObserver(fit); observer.observe(element);
    return () => observer.disconnect();
  // Only graph dimensions and embedding change the initial fit, not status ticks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphWidth, graphHeight, batchId, embedded]);

  const updateBatch = (patch: Partial<BatchRow>): boolean => {
    try {
      onUpdate(patch);
      return true;
    } catch {
      msg.error("本地保存失败，请检查浏览器存储空间后重试。修改内容仍保留在窗口中。");
      return false;
    }
  };
  const n = (value: number) => value < 0 ? "-" : value.toLocaleString();
  const pill = STATUS_PILL[batch.status];
  const availableFields = [...new Set([...FIELD_OPTIONS, ...(batch.outputFields ?? [])])];
  const zoom = (value: number) => {
    const next = Math.min(2, Math.max(0.25, value));
    setOffset(previous => ({ x: viewport.width / 2 - (viewport.width / 2 - previous.x) * next / scale, y: viewport.height / 2 - (viewport.height / 2 - previous.y) * next / scale }));
    setScale(next);
  };
  const fitView = () => {
    const next = fitGraph(viewport.width, viewport.height);
    setScale(next.scale); setOffset(next.offset);
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); msg.success("已复制"); } catch { msg.error("复制失败，请选择资源文字复制"); }
  };
  const download = (kind: string) => {
    if (kind === 'delivery') {
      const job = readWorkspace().exportJobs?.find(item => item.resource === batch.deliveryResource && item.status === 'succeeded');
      if (job) { downloadDelivery(job); return; }
    }
    const data = { localPrototype: true, exportedAt: new Date().toISOString(), kind, batchId: batch.id, batchName: batch.name,
      inputResource: batch.inputResource, deliveryResource: batch.deliveryResource ?? null, status: batch.status,
      failed: batch.failed, filtered: batch.filtered, outputFields: batch.outputFields ?? [] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "batch-" + batch.id + "-" + kind + "-metadata.json"; anchor.click(); URL.revokeObjectURL(url);
    msg.success("已导出本地批次元数据 JSON");
  };
  const changeStatus = (status: BatchStatus, action: string) => {
    if (execution) { execution.onAction(action); return; }
    try {
      if (action === '结束') { writeWorkspace(finishStandaloneBatch(readWorkspace(), batch.id)); return; }
      if ((action === '开始' || action === '启动') && hasBlockingBatchIssues(batch)) { msg.error('请先修复批次总体问题并重新校验'); return; }
      const target = { ...batch, nodes: batch.nodes.map(node => ({ ...node, status: action === '暂停' && node.status !== '已完成' ? '已暂停' as const : node.status })), status, updatedAt: new Date().toISOString() };
      if (action === '开始' || action === '启动' || action === '重试') {
        enableSimulation(target);
        if (target.total < 1) { msg.warning('请先配置有效的输入数量'); return; }
      }
      updateBatch(target);
    } catch (error) { msg.error(error instanceof Error ? error.message : '操作失败，请重试'); }
  };
  const actions = [
    { title: "开始", icon: <PlayCircleOutlined />, enabled: batch.status === "初始化" && !hasBlockingBatchIssues(batch), status: "运行中" },
    { title: "暂停", icon: <PauseCircleOutlined />, enabled: batch.status === "运行中", status: "已暂停" },
    { title: "启动", icon: <PlayCircleOutlined />, enabled: batch.status === "已暂停" && !hasBlockingBatchIssues(batch), status: "运行中" },
    { title: "结束", icon: <StopOutlined />, enabled: !batch.finish && ["运行中", "已暂停", "部分失败", "已完成"].includes(batch.status), status: "已结束" },
    { title: "重试", icon: <RedoOutlined />, enabled: !batch.finish && ["部分失败", "已结束"].includes(batch.status), status: "运行中" },
  ] as const;
  const costNode = typeof costTarget === "number" ? batch.nodes.find(node => node.seq === costTarget) : undefined;
  const costRows = typeof costTarget === "number" ? batch.nodeCostResources?.[costTarget] ?? [] : batch.costResources ?? [];
  const costAmount = costRows.length ? costNode?.cost ?? batch.cost : "¥ 0.00";
  const info = [["批次 ID", String(batch.id)], ["工作流名称", batch.workflow], ["批次名称", batch.name], ["交付数据量", n(batch.total)], ["成功数量", n(batch.success)], ["失败数量", n(batch.failed)], ["已过滤数量", n(batch.filtered)], ["交付素材", batch.material], ["创建时间", batch.createdAt], ["更新时间", batch.updatedAt], ["项目名称", projectName], ["MasterIP", "-"]];

  return <div className={'hawk-batch-page' + (execution ? ' hawk-batch-embedded' : '')}>
    {contextHolder}
    {breadcrumb}
    <div className={`hawk-batch-header${execution?.showRunClock ? ' has-run-clock' : ''}`}>
      <div className="hawk-batch-header-top">
        <div className="hawk-batch-heading">批次详情<span style={{ color: pill.color, background: pill.bg }}>{batch.status}</span></div>
        <Space size={10} wrap>
          <Select aria-label="通知强度" value={batch.notice} open={noticeOpen} onOpenChange={setNoticeOpen} prefix="通知强度:" style={{ width: 190 }} onChange={notice => { setNoticeOpen(false); if (updateBatch({ notice })) msg.success("通知强度已保存到本机"); }} popupRender={menu => <>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="text" block onClick={() => { setNoticeOpen(false); setAlarmOpen(true); }}>梯度告警</Button></>} classNames={{ popup: { root: "hawk-notice-menu" } }} options={["飞书消息", "飞书加急", "短信加急", "电话加急"].map(value => ({ value, label: value }))} />
          <Button onClick={() => { setDraftFields([...(batch.outputFields ?? [])]); setFieldsOpen(true); }}>输出字段</Button>
          <Button onClick={() => { configForm.setFieldsValue({ ...DEFAULT_CONFIG, ...batch.systemConfig, redis: { ...DEFAULT_CONFIG.redis, ...batch.systemConfig?.redis } }); setConfigOpen(true); }}>配 置</Button>
        </Space>
      </div>
      {execution && execution.showBatchCaption !== false && <div className="hawk-batch-executor-caption"><strong>{batch.name}</strong><span>批次 ID {batch.id} · {batch.workflow}</span></div>}
      <div className="hawk-batch-metrics-cost">
        <div className="hawk-batch-metrics">{[[n(batch.total), "总数", "#111827"], [n(batch.success), "成功", "#52c41a"], [n(batch.failed), "失败", "#ff4d4f"], [n(batch.filtered), "已过滤", "#faad14"]].map(([value, label, color]) => <div key={label}><strong style={{ color }}>{value}</strong><span>{label}</span></div>)}</div>
        <div className="hawk-batch-runtime-cost">
        {execution?.showRunClock && <div className="hawk-batch-runtime"><span>实际运行时长</span><strong aria-label="批次实际运行时长">{execution.activeRunMs === undefined ? '—' : [Math.floor(execution.activeRunMs / 3600000), Math.floor(execution.activeRunMs / 60000) % 60, Math.floor(execution.activeRunMs / 1000) % 60].map(value => String(value).padStart(2, '0')).join(':')}</strong></div>}
        <div className="hawk-batch-estimate"><span>批次预估成本</span><div><strong>{batch.cost === "-" ? "¥ 0.00" : batch.cost}</strong><Button type="link" onClick={() => setCostTarget("batch")}>查看成本详情 <RightOutlined /></Button></div></div>
        </div>
      </div>
      <div className="hawk-batch-header-bottom">
        <div className="hawk-batch-progress">{[[batch.success, "#52c41a"], [batch.filtered, "#faad14"], [batch.failed, "#ff4d4f"]].map(([value, color]) => <span key={color} style={{ background: color as string, width: batch.total > 0 ? Math.max(0, Number(value)) / batch.total * 100 + "%" : "0%" }} />)}</div>
        <Space className="hawk-batch-actions" size={10} wrap>{actions.filter(action => execution?.runMode !== 'stream' || ['暂停','启动','重试'].includes(action.title)).map(action => action.title === "结束" ? <FinishControl key={action.title} batchId={batch.id} disabled={execution ? !execution.canAction(action.title) : !action.enabled} onFinish={() => changeStatus(action.status, action.title)} /> : <Button key={action.title} icon={action.icon} disabled={execution ? !execution.canAction(action.title) : !action.enabled} onClick={() => changeStatus(action.status, action.title)}>{action.title}</Button>)}</Space>
      </div>
    </div>
    <BatchCommonControls batch={batch} onUpdate={updateBatch} alarmOpen={alarmOpen} onAlarmOpenChange={setAlarmOpen} detailsOpen={failureDetailsOpen} onDetailsOpenChange={setFailureDetailsOpen} />
    <div className="hawk-batch-graph" ref={graphRef} onPointerDown={event => {
      if ((event.target as HTMLElement).closest("button, a, .hawk-batch-minimap")) return;
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }; event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => { const current = drag.current; if (current?.pointerId === event.pointerId) setOffset({ x: current.offsetX + event.clientX - current.x, y: current.offsetY + event.clientY - current.y }); }} onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; }}>
      <Popover title={null} trigger="click" placement="bottomLeft" content={<div className="hawk-batch-info">{info.map(([label, value]) => <div key={label}><span>{label}</span><span>{value}</span></div>)}</div>}><Button className="hawk-batch-info-button">批次信息 <CaretRightOutlined /></Button></Popover>
      {!batch.nodes.length && <div className="hawk-batch-graph-empty">此发布版本仅保留摘要，暂无节点快照</div>}
      <div className="hawk-batch-scene" style={{ width: graphWidth, height: graphHeight, transform: "translate(" + offset.x + "px," + offset.y + "px) scale(" + scale + ")" }}>
        <svg className="hawk-batch-edges" width={graphWidth} height={graphHeight}>{batch.nodes.slice(0, -1).map((node, index) => {
          const current = position(index), next = position(index + 1); const sameRow = current.y === next.y;
          const startX = sameRow ? current.x + NODE_W : current.x + NODE_W / 2, startY = sameRow ? current.y + NODE_H / 2 : current.y + NODE_H;
          const endX = sameRow ? next.x : next.x + NODE_W / 2, endY = sameRow ? next.y + NODE_H / 2 : next.y;
          const d = sameRow ? "M" + startX + " " + startY + " H" + endX : "M" + startX + " " + startY + " V" + (startY + 40) + " H" + endX + " V" + endY;
          return <g key={node.seq}><path d={d} fill="none" stroke="#475569" strokeWidth="1.4" strokeDasharray="4 4" strokeLinejoin="round" /><circle cx={startX} cy={startY} r={4.5} fill="#334155" /><circle cx={endX} cy={endY} r={4.5} fill="#334155" /></g>;
        })}</svg>
        {batch.nodes.map((node, index) => <div key={node.seq} style={{ position: "absolute", left: position(index).x, top: position(index).y }}><FlowNodeCard node={node} retryEnabled={!execution && !batch.finish && batch.failed > 0 && ["已暂停", "部分失败"].includes(batch.status)} onCost={() => setCostTarget(node.seq)} onRetry={() => { try { const w = readWorkspace(), current = w.batches.find(b => b.id === batch.id)!; const target = prepareBatchRetry(current, node.seq); writeWorkspace({ ...w, batches: w.batches.map(b => b.id === batch.id ? target : b) }); } catch (e) { msg.error(e instanceof Error ? e.message : "重试准备失败"); } }} /></div>)}
      </div>
      <div className="hawk-batch-zoom"><Button aria-label="缩小画布" type="text" size="small" icon={<MinusOutlined />} onClick={() => zoom(scale - 0.1)} /><span>{Math.round(scale * 100)}%</span><Button aria-label="放大画布" type="text" size="small" icon={<PlusOutlined />} onClick={() => zoom(scale + 0.1)} /><Button aria-label="适应画布" type="text" size="small" icon={<ExpandOutlined />} onClick={fitView} /></div>
      <button className="hawk-batch-minimap" aria-label="小地图：适应画布" onClick={fitView}><svg viewBox={"-30 -30 " + (graphWidth + 60) + " " + (graphHeight + 60)}>{batch.nodes.map((node, index) => <rect key={node.seq} x={position(index).x} y={position(index).y} width={NODE_W} height={NODE_H} rx={8} fill="#fff" stroke="#cbd5e1" strokeWidth={4} />)}<rect x={-offset.x / scale} y={-offset.y / scale} width={viewport.width / scale} height={viewport.height / scale} fill="none" stroke="#91caff" strokeWidth={3} /></svg></button>
    </div>
    {execution && execution.showInputSource !== false && <div className="hawk-batch-binding"><span>输入来源：{execution.inputSource}</span><span>{execution.waiting ? '等待前置批次产出，当前批次不可提前启动' : '按执行器固定关系接续'}</span></div>}
    <div className="hawk-batch-resources">
      <div className="hawk-batch-resource-input"><span>输入资源</span><Typography.Text ellipsis={{ tooltip: batch.inputResource }}>{batch.inputResource || (execution?.waiting ? '等待前置批次产出' : execution ? '待配置输入' : '-')}</Typography.Text><Tooltip title="复制输入资源"><Button aria-label="复制输入资源" type="text" size="small" icon={<CopyOutlined />} disabled={!batch.inputResource} onClick={() => copy(batch.inputResource)} /></Tooltip><Tooltip title="导出本地资源元数据 JSON"><Button aria-label="导出输入资源元数据" type="text" size="small" icon={<DownloadOutlined />} onClick={() => download("input")} /></Tooltip><Button aria-label="编辑输入资源" type="text" size="small" icon={<EditOutlined />} disabled={Boolean(execution && !execution.inputEditable)} onClick={() => { if (execution) { execution.onEditInput(); return; } setInputValue(batch.inputResource); setInputOpen(true); }} /></div>
      <div className="hawk-batch-resource-delivery"><span>交付文件</span><Typography.Text ellipsis={{ tooltip: batch.deliveryResource }}>{batch.deliveryResource || "-"}</Typography.Text>{batch.deliveryResource && <><Button aria-label="复制交付资源" type="text" size="small" icon={<CopyOutlined />} onClick={() => copy(batch.deliveryResource!)} /><Tooltip title="下载交付文件；旧资源仅提供原有元数据"><Button aria-label="下载交付文件" type="text" size="small" icon={<DownloadOutlined />} onClick={() => download("delivery")} /></Tooltip></>}<DeliveryControls batchId={batch.id} /></div>
      <Button className="hawk-batch-resource-failed" onClick={() => setFailureDetailsOpen(true)}>失败&amp;被过滤记录</Button>
    </div>
    <BatchDeliveryStatus batchId={batch.id} />
    <Modal title="输出字段" open={fieldsOpen} width={560} okText="保 存" cancelText="取 消" onCancel={() => setFieldsOpen(false)} onOk={() => { if (draftFields.some(value => !value)) { msg.warning("请选择输出字段或删除空行"); return; } if (!updateBatch({ outputFields: draftFields as string[] })) return; setFieldsOpen(false); msg.success("输出字段已保存到本机"); }}>
      <Typography.Text type="secondary">共 {draftFields.length} 项</Typography.Text>
      <div className="hawk-batch-fields">{draftFields.map((field, index) => <div key={index}><Select aria-label={"输出字段 " + (index + 1)} showSearch value={field} placeholder="请选择输出字段" options={availableFields.filter(value => value === field || !draftFields.includes(value)).map(value => ({ value, label: value }))} onChange={value => setDraftFields(previous => previous.map((item, i) => i === index ? value : item))} /><Button aria-label={"删除输出字段 " + (index + 1)} danger type="text" icon={<DeleteOutlined />} onClick={() => setDraftFields(previous => previous.filter((_, i) => i !== index))} /></div>)}</div>
      <Button type="dashed" block icon={<PlusOutlined />} disabled={draftFields.length >= availableFields.length} onClick={() => setDraftFields(previous => [...previous, undefined])}>新增输出字段</Button>
    </Modal>
    <Modal title="系统配置" className="hawk-batch-config" open={configOpen} width={560} okText="保存配置" cancelText="取 消" onCancel={() => setConfigOpen(false)} onOk={() => configForm.validateFields().then(systemConfig => { if (!updateBatch({ systemConfig })) return; setConfigOpen(false); msg.success("系统配置已保存到本机"); })}>
      <Typography.Text type="secondary">系统配置请谨慎修改</Typography.Text>
      <Form form={configForm} labelCol={{ flex: "144px" }} wrapperCol={{ flex: 1 }} labelAlign="left" colon={false}>
        <Form.Item name="primaryKey" label="主键" rules={[{ required: true }]}><Select options={availableFields.map(value => ({ value, label: value }))} /></Form.Item>
        <Form.Item name="batchQps" label="批次QPS"><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="reusePod" label="复用POD" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="emptyOutput" label="使用空输出" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item label="redis"><div className="hawk-batch-config-group"><Form.Item name={["redis", "addr"]} label="地址"><Input /></Form.Item><Form.Item name={["redis", "password"]} label="密码"><Input.Password /></Form.Item><Form.Item name={["redis", "db"]} label="数据库"><InputNumber min={0} /></Form.Item><Form.Item name="singleInstance" label="使用单实例" valuePropName="checked"><Switch /></Form.Item></div></Form.Item>
        <Form.Item name="memoryBoost" label="内存加速" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="memoryPercent" label="内存加速百分比"><InputNumber min={0} max={100} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="streaming" label="流式处理" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="circleOutput" label="输出到圈选集" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="customCid" label="用户自定义cid名称"><Input placeholder="请输入用户自定义cid名称" /></Form.Item>
        <Form.Item label="输出JSONL"><div className="hawk-batch-config-group"><Form.Item name="jsonl" valuePropName="checked" label="启用"><Switch /></Form.Item><Form.Item name="jsonlFields" label="字段"><Select mode="multiple" options={availableFields.map(value => ({ value, label: value }))} /></Form.Item><Form.Item name="jsonlFilename" label="文件名"><Input /></Form.Item></div></Form.Item>
        <Form.Item label="输出JSON"><div className="hawk-batch-config-group"><Form.Item name="json" valuePropName="checked" label="启用"><Switch /></Form.Item><Form.Item name="jsonFields" label="字段"><Select mode="multiple" options={availableFields.map(value => ({ value, label: value }))} /></Form.Item><Form.Item name="jsonFilenameField" label="文件名字段"><Select allowClear options={availableFields.map(value => ({ value, label: value }))} /></Form.Item></div></Form.Item>
        <Form.Item name="collectionType" label="圈选集类型"><Select options={["图片", "视频", "音频", "文本", "其他"].map(value => ({ value, label: value }))} /></Form.Item>
      </Form>
    </Modal>
    <Modal className="hawk-batch-cost-modal" title={<div>{costTarget === "batch" ? "批次成本详情" : "工作流节点成本详情"}<div className="hawk-batch-cost-title-detail">{costNode?.name ?? batch.name}</div></div>} open={costTarget !== null} width={1100} onCancel={() => setCostTarget(null)} footer={<Button type="primary" onClick={() => setCostTarget(null)}>知道了</Button>}>
      <div className="hawk-batch-cost-layout">
        <aside className="hawk-batch-cost-summary"><span>预估成本</span><strong>{costAmount}</strong><b>按供应商参考价估算</b><p>金额随已记录用量动态更新，仅用于辅助了解当前项目成本。</p></aside>
        <div className="hawk-batch-cost-details"><div className="hawk-batch-cost-caption"><strong>资源明细</strong><span>{costRows.length} 项资源</span></div>
          <Table size="middle" pagination={false} rowKey="name" dataSource={costRows} columns={[{ title: "资源", dataIndex: "name" }, { title: "用量", dataIndex: "usage" }, { title: "单价 (micro_yuan)", dataIndex: "price" }, { title: "预估成本", dataIndex: "cost" }]} />
        </div>
      </div>
      <div className="hawk-batch-cost-note">ⓘ　以上金额根据供应商参考价格及当前用量估算，仅供成本参考，最终金额以实际结算结果为准。</div>
    </Modal>
    <Modal title="编辑输入资源" open={inputOpen} okText="保 存" cancelText="取 消" onCancel={() => setInputOpen(false)} onOk={() => { if (!updateBatch({ inputResource: inputValue.trim() })) return; setInputOpen(false); msg.success("输入资源已保存到本机"); }}><Input value={inputValue} onChange={event => setInputValue(event.target.value)} placeholder="请输入 CID 或资源地址" /><Typography.Text type="secondary">仅更新本地原型中的资源引用。</Typography.Text></Modal>
  </div>;
}
