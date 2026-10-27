"use client";

/**
 * 工作流编排页（/hawk/pipeline）
 * 按项目分组的草稿卡片（Ant Collapse）· 新建 Pipeline 弹窗 · 搜索/项目筛选 · 打开草稿 → /hawk/pipeline/editor
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/lib/demo-navigation";
import {
  Button,
  Collapse,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, RightOutlined, SearchOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { type PipelineDraft } from "../data/mock-pipelines";
import { ExecutorComposer, type ExecutorDraft } from "./executor-composer";
import { saveExecutor, writeWorkspace, useWorkspace } from '../data/local-workspace';
import { groupProjectId } from '../data/workspace-projects';

function DraftCard({ draft, onDeleted, onEditDesc, onListed }: {
  draft: PipelineDraft;
  onDeleted: (id: string) => void;
  onEditDesc: (id: string, description: string) => void;
  onListed: (id: string, catalogue: { name: string; description: string; type: string; domain: string }) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [listingOpen, setListingOpen] = useState(false);
  const [listingForm] = Form.useForm();
  const editFinished = useRef(false);
  const [modal, modalContext] = Modal.useModal();
  const finishEdit = (cancel = false) => {
    if (editFinished.current) return;
    editFinished.current = true;
    setEditing(false);
    if (!cancel && description !== (draft.description ?? "")) onEditDesc(draft.id, description);
  };
  return (
    <div className={"hawk-pipeline-card" + (editing ? " is-editing" : "")}>
      {modalContext}
      <div className="hawk-pipeline-card-header">
        <div className="hawk-pipeline-card-title">
          <span className="hawk-pipeline-title" title={draft.name}>{draft.name}</span>
          <Tag color={draft.status === "published" ? "green" : "default"}>{draft.status === "published" ? "已发布" : "草稿"}</Tag>
        </div>
        <Space size={8} className="hawk-pipeline-card-actions">
          {draft.status === "published" && !draft.internalGroup && draft.catalogueOnline === false && <Button size="small" onClick={() => { listingForm.setFieldsValue({ name: draft.name, description: draft.description ?? "" }); setListingOpen(true); }}>正式上架</Button>}
          <Button type="primary" size="small" onClick={() => router.push("/hawk/pipeline/editor?draft=" + encodeURIComponent(draft.id))}>打开草稿</Button>
          <Button danger size="small" aria-label={"删除 " + draft.name} icon={<DeleteOutlined />} onClick={() => modal.confirm({
            title: "删除「" + draft.name + "」？",
            content: "删除后，该编排将从本机列表中移除。已保存的执行器版本不受影响。",
            okText: "删 除", okButtonProps: { danger: true }, cancelText: "取 消",
            onOk: () => onDeleted(draft.id),
          })} />
        </Space>
      </div>
      <div className="hawk-pipeline-card-description">
        {editing ? (
          <Input autoFocus aria-label={"编辑 " + draft.name + " 的描述"} value={description} maxLength={500}
            onChange={(event) => setDescription(event.target.value)} onPressEnter={() => finishEdit()}
            onKeyDown={(event) => { if (event.key === "Escape") finishEdit(true); }} onBlur={() => finishEdit()} />
        ) : (
          <span>{draft.description || "暂无描述"}<Button type="text" size="small" icon={<EditOutlined />}
            aria-label={"编辑 " + draft.name + " 的描述"} onClick={() => {
              editFinished.current = false; setDescription(draft.description ?? ""); setEditing(true);
            }} /></span>
        )}
      </div>
      <div className="hawk-pipeline-card-meta"><div className="hawk-pipeline-output">
        <span className="hawk-pipeline-output-label">输出</span>
        <span className="hawk-pipeline-output-values" title={draft.outputs.join(" · ")}>{draft.outputs.join(" · ") || "-"}</span>
      </div></div>
      <Modal title="正式上架通用能力" open={listingOpen} okText="确认上架" cancelText="取消" onCancel={() => setListingOpen(false)} onOk={() => listingForm.submit()}>
        <Form form={listingForm} layout="vertical" onFinish={values => { onListed(draft.id, values); setListingOpen(false); }}>
          <Form.Item name="name" label="能力名称" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="简介" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true, whitespace: true }]}><Input placeholder="例如：工作流" /></Form.Item>
          <Form.Item name="domain" label="领域" rules={[{ required: true, whitespace: true }]}><Input placeholder="例如：视频处理" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export function PipelinePage() {
  const router = useRouter();
  const workspace = useWorkspace();
  const baseGroups = workspace.groups;
  const [keyword, setKeyword] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<string[]>([]);
  const [executorInitialFlow, setExecutorInitialFlow] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return new URLSearchParams(window.location.search).get("flow") ?? undefined;
  });
  const [executorModalOpen, setExecutorModalOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("createExecutor") === "1";
  });
  const executors = workspace.executors;
  const [msg, contextHolder] = message.useMessage();
  const [form] = Form.useForm();


  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("createExecutor") === "1") {
      window.history.replaceState({}, "", "/hawk/pipeline");
    }
  }, []);

  const publishedFlows = useMemo(
    () => baseGroups.flatMap((group) => group.drafts.filter((draft) => draft.status === "published")),
    [baseGroups],
  );

  const openExecutorComposer = (flowId?: string) => {
    setExecutorInitialFlow(flowId);
    setExecutorModalOpen(true);
  };

  const openExecutorEditor = (executor: ExecutorDraft) => {
    router.push(`/hawk/pipeline/executor?id=${encodeURIComponent(executor.id)}`);
  };

  const groups = useMemo(() => {
    const all = baseGroups
      .filter((g) => g.drafts.length > 0);
    let list = all;
    if (projectFilter) list = list.filter((g) => g.project === projectFilter);
    if (keyword.trim()) {
      const k = keyword.trim();
      list = list.map((g) => ({ ...g, drafts: g.drafts.filter((d) => d.name.includes(k)) })).filter((g) => g.drafts.length > 0);
    }
    return list;
  }, [baseGroups, keyword, projectFilter]);

  const editDesc = (id: string, description: string) => {
    writeWorkspace({ ...workspace, groups: baseGroups.map(group => ({
      ...group, drafts: group.drafts.map(draft => draft.id === id ? { ...draft, description } : draft),
    })) });
    msg.success("描述已更新");
  };

  const listFlow = (id: string, catalogue: { name: string; description: string; type: string; domain: string }) => {
    writeWorkspace({ ...workspace, groups: baseGroups.map(group => ({ ...group, drafts: group.drafts.map(draft => draft.id === id ? { ...draft, catalogueOnline: true, catalogue } : draft) })) });
    msg.success("已正式上架到通用能力目录");
  };

  return (
    <div className="hawk-pipeline-page">
      {contextHolder}
      <div className="hawk-pipeline-page-header">
        <Typography.Title level={2}>工作流编排</Typography.Title>
        <Space size={12}>
          <Button icon={<ThunderboltOutlined />} onClick={() => openExecutorComposer()}>新建执行器</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新建 Pipeline</Button>
        </Space>
      </div>
      <div className="hawk-pipeline-search-bar">
        <Input allowClear prefix={<SearchOutlined />} placeholder="搜索 Pipeline" style={{ width: 400, maxWidth: "100%" }}
          value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="请选择所属项目" style={{ width: 240, maxWidth: "100%" }}
          value={projectFilter} onChange={setProjectFilter} options={baseGroups.map((g) => ({ value: g.project, label: g.project }))} />
      </div>

      <Collapse
        className="hawk-pipeline-collapse"
        activeKey={groups.filter(group => !collapsedProjects.includes(group.project)).map(group => group.project)}
        onChange={(keys) => {
          const active = Array.isArray(keys) ? keys : [keys];
          setCollapsedProjects(previous => [
            ...previous.filter(project => !groups.some(group => group.project === project)),
            ...groups.filter(group => !active.includes(group.project)).map(group => group.project),
          ]);
        }}
        expandIcon={({ isActive }) => <RightOutlined style={{ fontSize: 11 }} rotate={isActive ? 90 : 0} />}
        items={groups.map((g) => ({
          key: g.project,
          label: (
            <Space>
              <Typography.Text strong>{g.project}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {g.drafts.length} 个编排草稿
              </Typography.Text>
            </Space>
          ),
          children: (
            <div className="hawk-pipeline-card-list">
              {g.drafts.map((d) => (
                <DraftCard key={d.id} draft={d} onDeleted={(id) => writeWorkspace({ ...workspace, groups: baseGroups.map(group => ({ ...group, drafts: group.drafts.filter(draft => draft.id !== id) })) })} onEditDesc={editDesc} onListed={listFlow} />
              ))}
            </div>
          ),
        }))}
      />
      {groups.length === 0 && <Empty style={{ marginTop: 48 }} description="没有匹配的编排草稿" />}

      {executors.length > 0 && (
        <div style={{ marginTop: 20, background: "#fff", border: "1px solid #f0f0f0", borderRadius: 8, padding: 18 }}>
          <Space align="center" style={{ marginBottom: 10 }}>
            <ThunderboltOutlined style={{ color: "#1677ff" }} />
            <Typography.Text strong>本地执行器</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>保存在本机，可刷新后继续</Typography.Text>
          </Space>
          {executors.map((executor) => (
            <div key={executor.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid #f5f5f5" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography.Text strong>{executor.name}</Typography.Text>
                <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{executor.flows.map((flow) => flow.name).join(" → ")}</Typography.Text></div>
              </div>
              <Button type="primary" ghost onClick={() => openExecutorEditor(executor)}>打开执行器工作台</Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        title="新建 Pipeline"
        open={modalOpen}
        width={600}
        okText="创建 Pipeline"
        cancelText="取 消"
        onCancel={() => setModalOpen(false)}
        onOk={() => {
          form.validateFields().then((values) => {
            const project = workspace.projects.find(project => project.id === values.project);
            if (!project) { form.setFields([{ name: 'project', errors: ['请选择有效项目'] }]); return; }
            const created: PipelineDraft = { id: 'new-' + Date.now(), name: values.title, status: 'draft', description: values.intro || null, outputs: [] };
            const exists = baseGroups.some(group => groupProjectId(workspace, group) === project.id);
            writeWorkspace({ ...workspace, groups: exists ? baseGroups.map(group => groupProjectId(workspace, group) === project.id ? { ...group, projectId: project.id, drafts: [created, ...group.drafts] } : group) : [{ project: project.name, projectId: project.id, drafts: [created] }, ...baseGroups] });
            localStorage.setItem('annotation-demo.graph.' + created.id, JSON.stringify({ revision: 1, nodes: [
              { id: 'start', type: 'phase2', position: { x: 60, y: 180 }, data: { operatorId: 'control.start', label: '开始', kind: 'control', config: { 工作流输入字段: '[]' }, mappings: {}, validationCount: 0 } },
              { id: 'end', type: 'phase2', position: { x: 410, y: 180 }, data: { operatorId: 'control.result', label: '结束', kind: 'result', config: {}, mappings: {}, validationCount: 0 } }
            ], edges: [{ id: 'start-end', source: 'start', target: 'end', type: 'phase2' }] }));
            form.resetFields();
            setModalOpen(false);
            msg.success("Pipeline 已创建并保存到本机");
          });
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="project" label="创建到（项目）" rules={[{ required: true, message: "请选择所属项目" }]}>
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="请选择所属项目"
              options={workspace.projects.map(project => ({ value: project.id, label: project.name }))}
            />
          </Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input placeholder="请输入 Pipeline 标题" />
          </Form.Item>
          <Form.Item name="intro" label="编排内容简介">
            <Input.TextArea rows={4} maxLength={500} showCount placeholder="请输入编排内容简介（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      <style jsx global>{`
        .hawk-pipeline-page { padding: 20px; background: #fff; min-height: calc(100vh - 56px); }
        .hawk-pipeline-page-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .hawk-pipeline-page-header h2.ant-typography { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.4; }
        .hawk-pipeline-search-bar { display: flex; flex-wrap: wrap; gap: 16px; margin: 20px 0 24px; }
        .hawk-pipeline-collapse.ant-collapse { border: 0; background: transparent; }
        .hawk-pipeline-collapse.ant-collapse > .ant-collapse-item { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
        .hawk-pipeline-collapse.ant-collapse > .ant-collapse-item > .ant-collapse-header { min-height: 58px; padding: 16px 24px; align-items: center; background: #fafafa; }
        .hawk-pipeline-collapse .ant-collapse-content { border-top: 1px solid #e5e7eb; }
        .hawk-pipeline-collapse .ant-collapse-content > .ant-collapse-content-box { padding: 24px; }
        .hawk-pipeline-card-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
        .hawk-pipeline-card { min-width: 0; min-height: 160px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; transition: border-color .2s, box-shadow .2s; }
        .hawk-pipeline-card:hover, .hawk-pipeline-card.is-editing { border-color: #1890ff; box-shadow: 0 2px 8px rgb(0 0 0 / 8%); }
        .hawk-pipeline-card-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .hawk-pipeline-card-title { display: flex; align-items: center; flex: 1; min-width: 0; gap: 8px; }
        .hawk-pipeline-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 600; }
        .hawk-pipeline-card-title .ant-tag { margin-inline-end: 0; border-radius: 2px; font-size: 12px; line-height: 20px; }
        .hawk-pipeline-card-actions { flex-shrink: 0; }
        .hawk-pipeline-card-description { margin-top: 12px; font-size: 13px; line-height: 22px; overflow-wrap: anywhere; }
        .hawk-pipeline-card-description .ant-btn { color: #1890ff; height: 22px; padding-inline: 4px; vertical-align: baseline; }
        .hawk-pipeline-card-meta { margin-top: 16px; padding-top: 16px; border-top: 1px solid #f0f0f0; }
        .hawk-pipeline-output { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 4px; background: #fafafa; color: #888; font-size: 12px; line-height: 20px; }
        .hawk-pipeline-output-label { flex-shrink: 0; }
        .hawk-pipeline-output-values { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
        @media (max-width: 900px) { .hawk-pipeline-card-list { grid-template-columns: minmax(0, 1fr); } }
        @media (max-width: 600px) { .hawk-pipeline-page-header { align-items: flex-start; flex-wrap: wrap; } .hawk-pipeline-collapse .ant-collapse-content > .ant-collapse-content-box { padding: 16px; } }
`}</style>

      <ExecutorComposer
        open={executorModalOpen}
        initialFlowId={executorInitialFlow}
        flows={publishedFlows}
        onCancel={() => setExecutorModalOpen(false)}
        onCreated={(executor) => {
          saveExecutor(executor);
          setExecutorModalOpen(false);
          openExecutorEditor(executor);
        }}
      />
    </div>
  );
}
