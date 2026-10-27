"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/demo-navigation";
import { Button, Empty, Form, Input, Modal, Popconfirm, Select, Switch, Table, Tag, Tooltip, Typography, message } from "antd";
import { EditOutlined, ExportOutlined, LeftOutlined, PlusOutlined, PoweroffOutlined, RightOutlined, SaveOutlined, SearchOutlined } from "@ant-design/icons";
import { AudioLines, Boxes, CircleDollarSign, Database, FileText, Gauge, Grid2X2, Image as ImageIcon, Layers, Map, Network, Package, ScanLine, ShieldCheck, Sparkles, Table2, Video, Workflow } from "lucide-react";
import { OPERATOR_DETAIL, OPERATORS, OPERATOR_FILTERS, type OperatorRow } from "../data/mock-operators";
import { readWorkspace, useWorkspace, WORKSPACE_EVENT, writeWorkspace } from "../data/local-workspace";
import type { PipelineDraft } from "../data/mock-pipelines";
import styles from "./stage-map.module.css";

type Metadata = { unitCost?: string; resourceLevel?: string; duration?: string; resourceType?: string; pressure?: string; usage?: string; prerequisite?: string; risks?: string; };
type LocalOperator = OperatorRow & Metadata;
type MapStore = { operators: Record<string, Partial<LocalOperator>>; flowUsage: Record<string, string>; flowAvailability: Record<string, boolean>; };
type GraphNode = { id: string; type?: string; data?: { label?: string; op?: string; operatorId?: string; kind?: string; config?: Record<string, unknown>; inputs?: unknown[]; outputs?: { key?: string; name?: string; }[]; }; };
type Graph = { nodes?: GraphNode[]; };
const MAP_KEY = "hawk.stage-map.v1";
const MAP_EVENT = "hawk-stage-map-change";
const INITIAL_MAP = JSON.stringify({ operators: {}, flowUsage: {}, flowAvailability: {} });
const subscribe = (listener: () => void) => {
  window.addEventListener(MAP_EVENT, listener); window.addEventListener("storage", listener); window.addEventListener(WORKSPACE_EVENT, listener);
  return () => { window.removeEventListener(MAP_EVENT, listener); window.removeEventListener("storage", listener); window.removeEventListener(WORKSPACE_EVENT, listener); };
};
function useMapStore() {
  const raw = useSyncExternalStore(subscribe, () => localStorage.getItem(MAP_KEY) ?? INITIAL_MAP, () => INITIAL_MAP);
  return useMemo(() => { try { return { ...JSON.parse(INITIAL_MAP), ...JSON.parse(raw) } as MapStore; } catch { return JSON.parse(INITIAL_MAP) as MapStore; } }, [raw]);
}
function createGraphStore(keys: string[]) {
  const read = () => typeof window === 'undefined' ? '[]' : JSON.stringify(keys.map(key => localStorage.getItem(key)));
  let current = read();
  return { snapshot: () => current, subscribe: (listener: () => void) => {
    const refresh = () => { const next = read(); if (next !== current) { current = next; listener(); } };
    const cleanup = subscribe(refresh); refresh(); return cleanup;
  } };
}
function saveMap(store: MapStore) { localStorage.setItem(MAP_KEY, JSON.stringify(store)); window.dispatchEvent(new Event(MAP_EVENT)); }
function useGraph(key?: string) {
  const raw = useSyncExternalStore(subscribe, () => key ? localStorage.getItem(key) ?? "null" : "null", () => "null");
  return useMemo(() => { try { return JSON.parse(raw) as Graph | null; } catch { return null; } }, [raw]);
}
const domains = ["AI 打标与模型", "视频处理", "图片处理", "文档处理", "3D 处理", "表格与字段处理", "校验与过滤", "其他", "预览与交付", "音频处理", "存储与取数"];
const domainIcons = [Sparkles, Video, ImageIcon, FileText, Package, Table2, ShieldCheck, Grid2X2, ScanLine, AudioLines, Database];
const categoryDescriptions: Record<string, string> = {
  "IO / 读写交付": "读取、写入或交付数据与资源。", "Enrich / 补充字段": "为已有数据补充属性、标签或结果字段。", "Transform / 数据转换": "转换、规范化或重组已有数据。", "Filter / 校验过滤": "校验、筛选并保留符合要求的数据。", "Fanout / 拆分分发": "将一个输入拆分或分发为多个处理结果。",
};
function Status({ online, draft = false }: { online: boolean; draft?: boolean }) { return <span className={online ? styles.online : styles.offline}>{online ? "已上线" : draft ? "待发布" : "已下线"}</span>; }
function FieldTable({ fields }: { fields: string[] }) {
  return <Table size="small" pagination={false} rowKey="field" dataSource={fields.map(field => ({ field, type: "text", desc: "-" }))} columns={[{ title: "字段", dataIndex: "field" }, { title: "类型", dataIndex: "type", width: 110 }, { title: "说明", dataIndex: "desc", width: 160 }]} />;
}
function isProcess(node: GraphNode) { return node.type !== "start" && node.type !== "end" && node.data?.kind !== "start" && node.data?.kind !== "end" && !["control.start", "control.result"].includes(node.data?.operatorId ?? node.data?.op ?? "") && !["开始", "结束"].includes(node.data?.label ?? ""); }

export function StageMapPage() {
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams();
  const flowMode = pathname.replace(/\/$/, "").endsWith("/flows");
  const workspace = useWorkspace(); const mapStore = useMapStore();
  const [keyword, setKeyword] = useState(""); const [domain, setDomain] = useState("全部算子");
  const [days, setDays] = useState<30 | 7>(30); const [status, setStatus] = useState("all"); const [offlineOnly, setOfflineOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(() => searchParams.get("id") ?? String(OPERATORS[0].id));
  const [editOpen, setEditOpen] = useState(false); const [flowIndex, setFlowIndex] = useState(0);
  const [form] = Form.useForm(); const [msg, contextHolder] = message.useMessage();
  const operators = useMemo(() => OPERATORS.map(op => ({ ...op, ...mapStore.operators[String(op.id)] })), [mapStore]);
  const flows = useMemo(() => workspace.groups.flatMap(group => group.drafts.map(flow => ({ ...flow, project: group.project }))), [workspace.groups]);
  const graphStore = useMemo(() => createGraphStore(flows.map(flow => flow.graphKey ?? 'annotation-demo.graph.' + flow.id)), [flows]);
  const graphSnapshot = useSyncExternalStore(graphStore.subscribe, graphStore.snapshot, () => '[]');
  const savedGraphs = useMemo(() => { try { return (JSON.parse(graphSnapshot) as (string | null)[]).map(raw => { try { return JSON.parse(raw ?? "null") as Graph | null; } catch { return null; } }); } catch { return []; } }, [graphSnapshot]);
  const flowOnline = (flow: PipelineDraft) => flow.status === "published" && mapStore.flowAvailability[flow.id] !== false;
  const referenceIndex = useMemo(() => {
    const index = new globalThis.Map<string, typeof flows>();
    flows.forEach((flow, row) => {
      if (flow.status !== 'published' || mapStore.flowAvailability[flow.id] === false) return;
      const codes = new Set(savedGraphs[row]?.nodes?.map(node => node.data?.operatorId ?? node.data?.op).filter((code): code is string => Boolean(code)));
      codes.forEach(code => index.set(code, [...(index.get(code) ?? []), flow]));
    });
    return index;
  }, [flows, savedGraphs, mapStore.flowAvailability]);
  const references = (op: LocalOperator) => referenceIndex.get(op.code) ?? [];
  const filteredOperators = operators.filter(op => {
    const text = [op.name, op.code, op.category, ...op.tags].join(" ").toLowerCase();
    const domainMatch = domain === "全部算子" || op.tags.includes(domain) || (domain === "AI 打标与模型" && op.tags.includes("模型调用")) || (domain === "表格与字段处理" && op.tags.includes("字段处理"));
    return text.includes(keyword.trim().toLowerCase()) && domainMatch && (status === "all" || op.online === (status === "online")) && (!offlineOnly || (op.online && references(op).length === 0));
  });
  const filteredFlows = flows.filter((flow, index) => [flow.name, flow.id, flow.description ?? "", flow.project, ...(savedGraphs[index]?.nodes?.filter(isProcess).map(node => node.data?.label ?? node.data?.operatorId) ?? [])].join(" ").toLowerCase().includes(keyword.trim().toLowerCase()) && (status === "all" || flowOnline(flow) === (status === "online")) && (!offlineOnly || flowOnline(flow)));
  const selectedOp = filteredOperators.find(op => String(op.id) === selectedId) ?? filteredOperators[0];
  const selectedFlow = filteredFlows.find(flow => flow.id === selectedId) ?? filteredFlows[0];
  const activeFlow = flowMode ? selectedFlow : undefined;
  const graph = useGraph(activeFlow ? activeFlow.graphKey ?? "annotation-demo.graph." + activeFlow.id : undefined);
  const steps = graph?.nodes?.filter(isProcess) ?? [];
  const start = graph?.nodes?.find(node => node.data?.operatorId === "control.start" || node.data?.op === "control.start" || node.type === "start" || node.data?.kind === "start" || node.data?.label === "开始");
  const entryFields = (() => { try { const fields = JSON.parse(String(start?.data?.config?.["工作流输入字段"] ?? "[]")) as { key?: string; }[]; return Array.isArray(fields) ? fields.map(field => field.key ?? "").filter(Boolean) : []; } catch { return []; } })();
  const title = flowMode ? selectedFlow?.name : selectedOp?.name;
  const code = flowMode ? selectedFlow?.id : selectedOp?.code;
  const online = flowMode ? !!selectedFlow && flowOnline(selectedFlow) : selectedOp?.online ?? false;
  const description = flowMode ? selectedFlow?.description ?? "暂无简介" : selectedOp?.description;
  const linkedFlows = selectedOp ? references(selectedOp) : [];
  const linkedFlow = linkedFlows[flowIndex % Math.max(1, linkedFlows.length)];
  const metric = (op: OperatorRow) => days === 30 ? op.calls30d.toLocaleString("en-US") : Math.floor(op.calls30d * 7 / 30).toLocaleString("en-US");
  const selectItem = (id: string) => { setSelectedId(id); setFlowIndex(0); router.replace("/hawk/stage-map" + (flowMode ? "/flows" : "") + "?id=" + encodeURIComponent(id), { scroll: false }); };
  const switchMode = (mode: "op" | "flow") => { setKeyword(""); setDomain("全部算子"); setStatus("all"); setOfflineOnly(false); router.push("/hawk/stage-map" + (mode === "flow" ? "/flows" : "")); };
  const openEdit = () => {
    form.resetFields();
    if (flowMode && selectedFlow) form.setFieldsValue({ name: selectedFlow.name, description: selectedFlow.description ?? "", usage: mapStore.flowUsage[selectedFlow.id] ?? "" });
    else if (selectedOp) form.setFieldsValue({ ...selectedOp, tags: selectedOp.tags });
    setEditOpen(true);
  };
  const saveEdit = async () => {
    try {
      const values = await form.validateFields();
      if (flowMode && selectedFlow) {
        const current = readWorkspace();
        writeWorkspace({ ...current, groups: current.groups.map(group => ({ ...group, drafts: group.drafts.map(flow => flow.id === selectedFlow.id ? { ...flow, name: values.name, description: values.description } : flow) })) });
        saveMap({ ...mapStore, flowUsage: { ...mapStore.flowUsage, [selectedFlow.id]: values.usage ?? "" } });
      } else if (selectedOp) saveMap({ ...mapStore, operators: { ...mapStore.operators, [selectedOp.id]: { ...mapStore.operators[selectedOp.id], ...values } } });
      setEditOpen(false); msg.success("已保存到本地原型");
    } catch (error) { if (error instanceof Error) msg.error("保存失败，请检查本地存储后重试"); }
  };
  const changeOnline = () => {
    try {
      if (flowMode && selectedFlow) {
        if (selectedFlow.status !== "published") return;
        saveMap({ ...mapStore, flowAvailability: { ...mapStore.flowAvailability, [selectedFlow.id]: !online } });
      } else if (selectedOp) saveMap({ ...mapStore, operators: { ...mapStore.operators, [selectedOp.id]: { ...mapStore.operators[selectedOp.id], online: !online } } });
      msg.success("已" + (online ? "下线" : "上线") + "（本地）");
    } catch { msg.error("保存失败，请检查本地存储后重试"); }
  };
  const openFlow = (flow: PipelineDraft) => router.push("/hawk/pipeline/editor?draft=" + encodeURIComponent(flow.id) + "&title=" + encodeURIComponent(flow.name));

  return <div className={styles.page}>{contextHolder}<div className={styles.root}>
    <header className={styles.header}><div className={styles.heading}><span className={styles.mapIcon}><Map size={24} /></span><h2>算子地图</h2></div><div className={styles.modeSwitch}><button className={!flowMode ? styles.activeMode : ""} onClick={() => switchMode("op")}><Layers size={14} />算子</button><button className={flowMode ? styles.activeMode : ""} onClick={() => switchMode("flow")}><Workflow size={14} />工作流</button></div></header>
    <div className={styles.layout}>
      <aside className={styles.sidebar}><div className={styles.filters}>
        <div className={styles.search}><Input allowClear prefix={<SearchOutlined />} placeholder={flowMode ? "搜索 Flow 名称、ID、步骤..." : "搜索算子名称、ID、领域..."} value={keyword} onChange={event => setKeyword(event.target.value)} /></div>
        {!flowMode && <div className={styles.domains}><button className={domain === "全部算子" ? styles.activeDomain : ""} onClick={() => setDomain("全部算子")}><Boxes size={14} /><span>全部算子</span></button>{domains.map((name, index) => { const Icon = domainIcons[index]; return <Tooltip key={name} title={name}><button aria-label={name} className={domain === name ? styles.activeDomain : ""} onClick={() => setDomain(name)}><Icon size={14} /></button></Tooltip>; })}</div>}
        <div className={styles.filterMeta}><span className={styles.count}>{flowMode ? filteredFlows.length : filteredOperators.length} 项</span><Tooltip title={days === 7 ? "本地演示：按近 30 天调用量的 7/30 折算，非真实 7 天统计" : "本地演示调用量"}><div className={styles.metricSwitch}><button className={days === 30 ? styles.activeMetric : ""} onClick={() => setDays(30)}>近 30 天</button><button className={days === 7 ? styles.activeMetric : ""} onClick={() => setDays(7)}>近 7 天</button></div></Tooltip><Select aria-label="上线状态" value={status} onChange={setStatus} options={[{ value: "all", label: "全部" }, { value: "online", label: "已上线" }, { value: "offline", label: "已下线" }]} className={styles.statusSelect} /><span className={styles.offlineFilter}>仅看可下线<Switch size="small" checked={offlineOnly} onChange={setOfflineOnly} /></span></div>
      </div><div className={styles.list}>
        {!flowMode ? filteredOperators.map(op => <button key={op.id} className={styles.listItem + " " + (op.id === selectedOp?.id ? styles.selectedItem : "")} onClick={() => selectItem(String(op.id))}><span className={styles.itemIcon}>{op.code.slice(0, 1)}</span><div className={styles.itemHeader}><div className={styles.itemTitle}><strong title={op.name}>{op.name}</strong><Status online={op.online} /></div><span className={styles.itemArrow}>›</span></div><div className={styles.itemCode}>{op.code}</div><div className={styles.itemSub}>{op.category}</div><div className={styles.itemTags}><span className={styles.categoryTag}>{op.category}</span><span className={styles.callStat}>⌁ 近 {days} 天 {metric(op)}</span></div><p className={styles.itemDescription}>{op.description}</p><div className={styles.itemDomain}>{op.tags.join(",")}</div></button>) : filteredFlows.map(flow => <button key={flow.id} className={styles.listItem + " " + styles.flowItem + " " + (flow.id === selectedFlow?.id ? styles.selectedItem : "")} onClick={() => selectItem(flow.id)}><span className={styles.itemIcon + " " + styles.flowItemIcon}><Workflow size={14} /></span><div className={styles.itemHeader}><div className={styles.itemTitle}><strong title={flow.name}>{flow.name}</strong><Status online={flowOnline(flow)} draft={flow.status !== "published"} /></div><span className={styles.itemArrow}>›</span></div><div className={styles.itemCode}>{flow.id}</div><div className={styles.itemSub}>{savedGraphs[flows.findIndex(item => item.id === flow.id)] ? (savedGraphs[flows.findIndex(item => item.id === flow.id)]?.nodes?.filter(isProcess).length ?? 0) + " 个步骤" : "未保存画布"}</div><div className={styles.itemTags}><span className={styles.callStat}>⌁ 近 {days} 天 —</span></div><p className={styles.itemDescription}>{flow.description || "暂无简介"}</p></button>)}
        {(flowMode ? filteredFlows : filteredOperators).length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={"没有匹配的" + (flowMode ? "工作流" : "算子")} />}
      </div></aside>
      <main className={styles.detail}>{title ? <>
        <div className={styles.detailHeader}><span className={styles.detailIcon + " " + (flowMode ? styles.flowDetailIcon : "")}>{flowMode ? <Workflow size={24} /> : <Layers size={24} />}</span><div className={styles.detailTitleWrap}><div className={styles.kicker}>{flowMode ? "FLOW / 工作流" : "HANDLER / 算子"}<Status online={online} draft={flowMode && selectedFlow?.status !== "published"} /></div><h3>{title}</h3><Typography.Text className={styles.detailCode} copyable={{ text: code }}>{code}</Typography.Text><div className={styles.capabilityLabel}>能力描述</div><p className={styles.detailDescription}>{description}</p></div></div>
        <div className={styles.actionBar}><Button icon={<EditOutlined />} onClick={openEdit}>编辑</Button><Popconfirm title={"确认" + (online ? "下线" : "上线") + (flowMode ? "工作流" : "算子") + "？"} description="仅修改本地原型状态。" onConfirm={changeOnline} okText="确认" cancelText="取消"><Button icon={<PoweroffOutlined />} disabled={flowMode && selectedFlow?.status !== "published"}>{online ? "下线" : "上线"}</Button></Popconfirm></div>
        {flowMode && selectedFlow ? <>
          <section className={styles.section}><div className={styles.flowInfo}><div><span>服务场景</span><p>{mapStore.flowUsage[selectedFlow.id] || "-"}</p></div><div><span>最近运行</span><p>-</p></div><div><span>步骤数</span><p>{graph ? steps.length + " 个" : "未保存画布"}</p></div></div></section>
          <section className={styles.section}><h4 className={styles.smallHeading}><Workflow size={14} />处理链路</h4>{steps.length ? steps.map((node, index) => <div className={styles.processItem} key={node.id}><span className={styles.processIndex}>{index + 1}</span><div><button className={styles.processLink} onClick={() => openFlow(selectedFlow)}>{node.data?.label || node.id}<ExportOutlined /></button><div className={styles.processCode}>{node.data?.operatorId || node.data?.op || node.id}</div></div><Button size="small" icon={<EditOutlined />} onClick={() => openFlow(selectedFlow)}>编辑</Button></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无本地画布快照" />}<Button onClick={() => openFlow(selectedFlow)} icon={<ExportOutlined />}>查看编排画布</Button></section>
          <section className={styles.section}><h3 className={styles.fieldsHeading}><ExportOutlined />入口字段</h3><div className={styles.fieldTags}>{entryFields.length ? entryFields.map(field => <Tag key={field}>{field}</Tag>) : <span className={styles.muted}>暂无入口字段定义</span>}</div></section><section className={styles.section}><h3 className={styles.fieldsHeading}><ExportOutlined />输出字段</h3><div className={styles.fieldTags}>{selectedFlow.outputs.length ? selectedFlow.outputs.map(field => <Tag key={field}>{field}</Tag>) : <span className={styles.muted}>暂无输出字段</span>}</div></section>
        </> : selectedOp && <>
          <div className={styles.stats}><div><span><CircleDollarSign size={14} />单次成本</span><strong>{selectedOp.unitCost || "-"}</strong></div><div><span><Network size={14} />资源占用等级</span><strong>{selectedOp.resourceLevel || "-"}</strong></div><div><span><Gauge size={14} />耗时</span><strong>{selectedOp.duration || "-"}</strong></div></div>
          <section className={styles.section}><h4>消费属性</h4><div className={styles.consumption}><div><span>算力资源类型</span><p>{selectedOp.resourceType || "-"}</p></div><div><span>主要压力因素</span><p>{selectedOp.pressure || "-"}</p></div></div></section>
          <section className={styles.section + " " + styles.classification}><div className={styles.classificationTags}>{selectedOp.tags.map(tag => <span key={tag} className={styles.domainTag}>{tag}</span>)}<span className={styles.categoryTag}>{selectedOp.category}</span></div><p>{categoryDescriptions[selectedOp.category]}</p></section>
          <section className={styles.section}><div className={styles.flowPanel}><div className={styles.flowPanelHeader}><div><h4>当前参与的 Flow</h4><p>仅展示已上线的 Flow。</p></div><span>{linkedFlows.length} 条</span><Button aria-label="上一个 Flow" icon={<LeftOutlined />} disabled={linkedFlows.length < 2} onClick={() => setFlowIndex(index => (index - 1 + linkedFlows.length) % linkedFlows.length)} /><Button aria-label="下一个 Flow" icon={<RightOutlined />} disabled={linkedFlows.length < 2} onClick={() => setFlowIndex(index => index + 1)} /></div>{linkedFlow ? <div className={styles.linkedFlow}><button onClick={() => { router.push("/hawk/stage-map/flows?id=" + linkedFlow.id); setSelectedId(linkedFlow.id); }}>{linkedFlow.name}<ExportOutlined /></button><p>{linkedFlow.description || "暂无简介"}</p><span>{linkedFlow.outputs.join(", ")}</span></div> : <div className={styles.flowEmpty}>暂无已收录的参与记录。</div>}</div></section>
          <section className={styles.section}><h4>历史参与的 Flow</h4><p className={styles.muted}>仅供演示超管追溯，不代表当前可用。</p><div className={styles.historyEmpty}>暂无<br /><span>暂无已收录的参与记录。</span></div></section>
          <section className={styles.section}><h4>适合什么时候使用</h4><p>{selectedOp.usage || "-"}</p><h4>使用前先确认</h4><p>{selectedOp.prerequisite || "-"}</p></section>
          <section className={styles.section}><h3 className={styles.fieldsHeading}>输入</h3><FieldTable fields={OPERATOR_DETAIL.inputs.map(field => field.field)} /></section>
          <section className={styles.section}><h3 className={styles.fieldsHeading}>配置</h3>{(["src", "dst"] as const).map(side => <div className={styles.configGroup} key={side}><strong>{side}</strong><div>{OPERATOR_DETAIL.config[side].map(field => <label key={field.key}><span>{field.key}</span><Input placeholder={field.placeholder || "-"} readOnly /></label>)}</div></div>)}</section>
          <section className={styles.section}><h3 className={styles.fieldsHeading}>输出</h3><FieldTable fields={OPERATOR_DETAIL.outputFields} /></section><section className={styles.section}><h4>使用提醒</h4><p className={styles.muted}>{selectedOp.risks || "暂无使用提醒"}</p></section>
        </>}
      </> : <Empty className={styles.noSelection} description="请选择左侧条目" />}</main>
    </div>
  </div><Modal open={editOpen} width={960} title={<div className={styles.modalTitle}><span><PlusOutlined /></span>{flowMode ? "编辑工作流" : "编辑算子"}</div>} className={styles.editModal} onCancel={() => setEditOpen(false)} onOk={() => void saveEdit()} okText="保存" cancelText="取消" okButtonProps={{ icon: <SaveOutlined /> }} forceRender>
    <Form form={form} layout="vertical" preserve={false}><div className={styles.formGrid}><Form.Item name="name" label="名称" rules={[{ required: true, whitespace: true, message: "请输入名称" }]}><Input placeholder="请输入名称" /></Form.Item><Form.Item label="正式 ID" required><Input disabled value={code} /></Form.Item></div><Form.Item name="description" label="简介" rules={[{ required: !flowMode, whitespace: true, message: "请输入简介" }]}><Input.TextArea placeholder="请输入简介" autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item>
      {!flowMode ? <><div className={styles.formGrid}><Form.Item name="tags" label="领域" rules={[{ required: true, message: "请选择领域" }]}><Select mode="tags" options={domains.map(value => ({ value, label: value }))} /></Form.Item><Form.Item name="category" label="行为类别" rules={[{ required: true }]}><Select options={OPERATOR_FILTERS.slice(1).map(value => ({ value, label: value }))} /></Form.Item></div><div className={styles.formGrid}><Form.Item name="unitCost" label="单次成本"><Input placeholder="例如 0.046" /></Form.Item><Form.Item name="resourceLevel" label="资源占用等级"><Select allowClear placeholder="请选择资源占用等级" options={["低", "中", "高"].map(value => ({ value, label: value }))} /></Form.Item><Form.Item name="duration" label="耗时"><Input placeholder="例如 慢速 · 8-20 秒" /></Form.Item><Form.Item name="resourceType" label="算力资源类型"><Select allowClear placeholder="请选择算力资源类型" options={["CPU", "GPU", "外部 API", "存储 IO"].map(value => ({ value, label: value }))} /></Form.Item></div><Form.Item name="pressure" label="主要压力因素"><Input placeholder="例如 并发 + QPS" /></Form.Item><Form.Item name="usage" label="适合用于"><Input.TextArea placeholder="请输入适合用于的场景" autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item><Form.Item name="prerequisite" label="使用前提"><Input.TextArea placeholder="请输入使用前提" autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item><Form.Item name="risks" label="风险说明 每行一条"><Input.TextArea rows={3} /></Form.Item></> : <Form.Item name="usage" label="服务场景"><Input.TextArea placeholder="请输入服务场景" rows={3} /></Form.Item>}
    </Form>
  </Modal></div>;
}
