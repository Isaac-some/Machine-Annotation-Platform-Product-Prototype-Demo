"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/demo-navigation";
import { Button, Card, Col, Form, Input, InputNumber, message, Modal, Popover, Radio, Row, Select, Space, Table, Tag, Typography } from "antd";
import { CrownOutlined, DownOutlined, PlusOutlined, SafetyCertificateOutlined, StarFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { CREATED_AT_OPTIONS, type ProjectRow } from "../data/mock-projects";
import { CURRENT_USER, HEROES } from "../data/names";
import { useWorkspace, writeWorkspace, matchesCreatedAt } from "../data/local-workspace";

const nameTagColor = { owner: "blue", research: "green", member: "purple" } as const;
const members = HEROES.map(name => ({ value: name, label: name === CURRENT_USER.name ? `${name}（${CURRENT_USER.account}）` : name }));
type ProjectForm = { name: string; notice: string; research?: string[]; owner: string; admins?: string[] };

function NameTag({ name, kind }: { name: string; kind: keyof typeof nameTagColor }) {
  return <Tag color={nameTagColor[kind]} style={{ marginInlineEnd: 0, whiteSpace: "normal", wordBreak: "break-all", lineHeight: 1.6 }}>{name}</Tag>;
}

export function ProjectPage() {
  const router = useRouter();
  const workspace = useWorkspace();
  const searchParams = useSearchParams();
  const [scope, setScope] = useState<"all" | "favorite">(searchParams.get("scope") === "favorite" ? "favorite" : "all");
  const [keyword, setKeyword] = useState("");
  const [batch, setBatch] = useState<number | null>(null);
  const [createdAt, setCreatedAt] = useState("所有时间");
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [msg, contextHolder] = message.useMessage();
  const [form] = Form.useForm<ProjectForm>();
  const allRows = workspace.projects;
  const rows = useMemo(() => {
    let list = allRows;
    if (scope === "favorite") list = list.filter(row => row.favorite);
    if (keyword.trim()) list = list.filter(row => row.name.includes(keyword.trim()));
    if (batch != null) list = list.filter(row => workspace.batches.some(item => item.id === batch && item.projectId === row.id));
    return list.filter(row => matchesCreatedAt(row.createdAt, createdAt));
  }, [allRows, scope, keyword, batch, createdAt, workspace.batches]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));

  const openProject = (project?: ProjectRow) => {
    setEditing(project ?? null);
    form.resetFields();
    form.setFieldsValue(project ? { name: project.name, notice: project.notice ?? "飞书消息", research: project.researchOwners ?? (project.researchOwner ? [project.researchOwner] : []), owner: project.owner, admins: project.participants } : { name: "", notice: "飞书消息", research: [], owner: CURRENT_USER.name, admins: [] });
    setModalOpen(true);
  };
  const saveProject = async () => {
    let values: ProjectForm;
    try { values = await form.validateFields(); } catch { return; }
    const project: ProjectRow = {
      ...(editing ?? { id: Math.max(0, ...allRows.map(row => row.id)) + 1, createdAt: new Date().toLocaleString("sv-SE", { hour12: false }), favorite: false }),
      name: values.name.trim(), notice: values.notice, owner: values.owner, researchOwner: values.research?.[0] ?? null, researchOwners: values.research ?? [], participants: values.admins ?? [],
    };
    try {
      writeWorkspace({ ...workspace, projects: editing ? allRows.map(row => row.id === project.id ? project : row) : [project, ...allRows] });
      setModalOpen(false);
      form.resetFields();
      if (!editing) setPage(1);
      msg.success(editing ? "项目已保存到本机" : "项目已创建并保存到本机");
    } catch { msg.error("本机存储失败，请保留表单并重试"); }
  };
  const toggleFav = (project: ProjectRow) => {
    try {
      writeWorkspace({ ...workspace, projects: allRows.map(row => row.id === project.id ? { ...row, favorite: !row.favorite } : row) });
      msg.success(project.favorite ? "已取消关注" : "已关注");
    } catch { msg.error("关注状态保存失败，请重试"); }
  };
  const columns: ColumnsType<ProjectRow> = [
    { title: "项目ID", dataIndex: "id", key: "id", width: 70 },
    { title: "项目名称", dataIndex: "name", key: "name", width: 250, render: (name: string, row) => <Space size={4}>{row.favorite && <StarFilled style={{ color: "#faad14", fontSize: 13 }} />}<Typography.Text ellipsis={{ tooltip: name }} style={{ maxWidth: 220, fontWeight: 400 }}>{name}</Typography.Text></Space> },
    { title: "项目负责人", dataIndex: "owner", key: "owner", width: 150, render: (name: string) => <NameTag name={name} kind="owner" /> },
    { title: "项目研发负责人", dataIndex: "researchOwner", key: "researchOwner", width: 200, render: (name: string | null, row) => <Space size={4} wrap>{(row.researchOwners ?? (name ? [name] : [])).map(value => <NameTag key={value} name={value} kind="research" />)}{!name && !row.researchOwners?.length && "-"}</Space> },
    { title: "项目参与者", dataIndex: "participants", key: "participants", width: 400, render: (list: string[]) => list.length ? <Space size={4} wrap>{list.map(name => <NameTag key={name} name={name} kind="member" />)}</Space> : "-" },
    { title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 180, sorter: (a, b) => a.createdAt.localeCompare(b.createdAt), render: (value: string) => <span style={{ whiteSpace: "nowrap" }}>{value}</span> },
    { title: "操作", key: "action", fixed: "right", width: 180, render: (_, row) => <Space size={0}><Button type="link" size="small" style={{ paddingInline: 8 }} onClick={() => openProject(row)}>编辑</Button><Button type="link" size="small" style={{ paddingInline: 8 }} onClick={() => router.push(`/hawk/project/detail/${row.id}`)}>查看</Button><Button type="link" size="small" style={{ paddingInline: 8 }} onClick={() => toggleFav(row)}>{row.favorite ? "取消关注" : "关注"}</Button></Space> },
  ];
  const roles = [
    { field: "research" as const, label: "项目研发", desc: "拥有对当前项目高级配置调整调整能力及代码控制能力", placeholder: "请选择项目交付研发负责人", icon: <CrownOutlined style={{ color: "#1677ff" }} />, multiple: true },
    { field: "owner" as const, label: "负责人", desc: "拥有完整控制权、资产删除及所有权移交权限", placeholder: "请选择负责人", icon: <CrownOutlined style={{ color: "#1677ff" }} />, multiple: false },
    { field: "admins" as const, label: "项目管理员", desc: "可管理成员、分配权限、创建/下载工作流批次", placeholder: "搜索并选择项目管理员", icon: <SafetyCertificateOutlined style={{ color: "#722ed1" }} />, multiple: true },
  ];

  return <div className="hawk-project-home" style={{ padding: "24px 20px 20px" }}>
    {contextHolder}
    <h1 style={{ margin: "0 0 24px", fontSize: 20, lineHeight: "32px", fontWeight: 600 }}>项目管理</h1>
    <Card style={{ marginBottom: 16, borderRadius: 6, boxShadow: "none" }} styles={{ body: { padding: 24 } }}>
      {!collapsed && <Form layout="inline" colon={false}>
        <Row gutter={24} style={{ width: "100%" }}>
          <Col xs={24} md={8}><Form.Item label="项目名称" style={{ margin: 0 }}><Input placeholder="请输入项目名称" value={keyword} onChange={event => { setKeyword(event.target.value); setPage(1); }} allowClear /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item label="批次检索" style={{ margin: 0 }}><InputNumber min={1} value={batch} onChange={value => { setBatch(value); setPage(1); }} placeholder="请输入批次" style={{ width: "100%" }} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item label="创建时间" style={{ margin: 0 }}><Select value={createdAt} onChange={value => { setCreatedAt(value); setPage(1); }} options={CREATED_AT_OPTIONS.map(value => ({ value, label: value }))} /></Form.Item></Col>
        </Row>
      </Form>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: collapsed ? 0 : 24 }}>
        <Space><Button onClick={() => { setKeyword(""); setBatch(null); setCreatedAt("所有时间"); setPage(1); }}>重 置</Button><Button type="primary" onClick={() => setPage(1)}>查 询</Button><Button type="link" style={{ paddingInline: 8 }} onClick={() => setCollapsed(!collapsed)}>{collapsed ? "展开" : "收起"}<DownOutlined style={{ fontSize: 10, transform: collapsed ? "none" : "rotate(180deg)" }} /></Button></Space>
      </div>
    </Card>
    <Card style={{ borderRadius: 6 }} styles={{ body: { padding: "16px 24px 24px" } }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <Radio.Group value={scope} onChange={event => { setScope(event.target.value); setPage(1); }} optionType="button" buttonStyle="solid" options={[{ value: "all", label: "所有项目" }, { value: "favorite", label: "我的关注" }]} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openProject()}>新建项目</Button>
      </div>
      <Table<ProjectRow> rowKey="id" columns={columns} dataSource={rows} size="middle" pagination={{ total: rows.length, current: currentPage, pageSize, size: "small", showTotal: (total, range) => `显示第 ${range[0]} 到 ${range[1]} 条记录，共 ${total} 条记录`, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showQuickJumper: true, onChange: (nextPage, nextSize) => { setPage(nextSize === pageSize ? nextPage : 1); setPageSize(nextSize); } }} scroll={{ x: 1432 }} />
    </Card>
    <Modal title={editing ? "编辑项目" : "新建项目"} open={modalOpen} width={960} okText={editing ? "保存项目" : "创建项目"} cancelText="取 消" onCancel={() => setModalOpen(false)} onOk={saveProject} styles={{ body: { paddingTop: 0, paddingBottom: 12 } }}>
      <Form form={form} layout="vertical" autoComplete="off">
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item name="name" label="项目名称" rules={[{ required: true, whitespace: true, message: "请输入项目名称" }]}><Input placeholder="请输入" allowClear /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="notice" label="通知强度" rules={[{ required: true, message: "请选择通知强度" }]}><Select options={[{ value: "飞书消息", label: "飞书消息" }, { value: "飞书加急", label: "飞书加急" }]} /></Form.Item></Col>
        </Row>
        {roles.map(role => <div key={role.field} style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <span style={{ fontSize: 16, lineHeight: "28px" }}>{role.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 22 }}><Typography.Text strong>{role.label}</Typography.Text><Popover title={`${role.label}权限`} content={role.desc} trigger="click"><Button type="link" style={{ padding: 0, height: 22 }}>查看权限</Button></Popover></div>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>{role.desc}</Typography.Paragraph>
            <Form.Item name={role.field} rules={role.field === "owner" ? [{ required: true, message: "请选择负责人" }] : []} style={{ marginBottom: 0 }}><Select aria-label={role.label} mode={role.multiple ? "multiple" : undefined} placeholder={role.placeholder} showSearch allowClear={role.multiple} disabled={role.field === "owner" && !editing} options={members} /></Form.Item>
          </div>
        </div>)}
      </Form>
    </Modal>
    <style jsx global>{`
      .hawk-project-home .ant-form-inline .ant-form-item-control { flex: 1; min-width: 0; }
      .hawk-project-home .ant-table-cell { padding-left: 8px !important; padding-right: 8px !important; }
      .hawk-project-home .ant-table-tbody > tr > td { height: 57px; }
      .hawk-project-home .ant-table-tbody > tr > td:last-child { white-space: nowrap; }
      .hawk-project-home .ant-pagination { margin-bottom: 0 !important; }
    `}</style>
  </div>;
}
