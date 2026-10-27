"use client";

import { useMemo, useRef, useState } from "react";
import { Button, Empty, Input, List, Modal, Space, Typography } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { publishedFlowId, type PipelineDraft } from "../data/mock-pipelines";

import type { LocalExecutor } from '../data/local-workspace';
import './executor-composer.css';
export type ExecutorDraft = LocalExecutor;

export type SplitPublication = { name: string; parts: { name: string; description: string }[] };
export type SplitComposer = {
  requestId: string;
  title: string;
  projectName?: string;
  parts: { name: string; description: string; labels: string[] }[];
  error?: string;
  onPublish: (publication: SplitPublication) => void;
};

function ExecutorComposerDialog({
  open,
  initialFlowId,
  flows,
  onCancel,
  onCreated,
  split,
}: {
  open: boolean;
  initialFlowId?: string;
  flows: PipelineDraft[];
  onCancel: () => void;
  onCreated: (executor: ExecutorDraft) => void;
  split?: SplitComposer;
}) {
  const [name, setName] = useState(split ? `${split.title}执行器` : '');
  const [parts, setParts] = useState(split?.parts ?? []);
  const [description, setDescription] = useState("");
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState('');
  const [attempted, setAttempted] = useState(false);
  const submitted = useRef(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialFlowId && flows.some((flow) => flow.id === initialFlowId) ? [initialFlowId] : [],
  );

  const selected = useMemo(
    () => selectedIds.map((id) => flows.find((flow) => flow.id === id)).filter((flow): flow is PipelineDraft => Boolean(flow)),
    [flows, selectedIds],
  );
  const available = flows.filter((flow) => !selectedIds.includes(flow.id) && `${flow.name} ${publishedFlowId(flow)} ${flow.description ?? ''}`.toLowerCase().includes(keyword.trim().toLowerCase()));

  const add = (id: string) => setSelectedIds((current) => (current.includes(id) ? current : [...current, id]));
  const remove = (index: number) => setSelectedIds((current) => current.filter((_, row) => row !== index));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selectedIds.length) return;
    setSelectedIds((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <Modal
      title={
        <Space>
          <ThunderboltOutlined style={{ color: "#1677ff" }} />
          <span>{split ? '发布并创建执行器' : '创建执行器'}</span>
        </Space>
      }
      open={open}
      width={split ? 640 : 920}
      centered
      className={`hawk-executor-composer${split ? ' is-split' : ''}`}
      destroyOnHidden
      okText={split ? '发布工作流并创建执行器' : '创建执行器'}
      cancelText="取 消"
      onCancel={onCancel}
      onOk={() => {
        setAttempted(true);
        if (split) {
          if (!name.trim() || parts.some(part => !part.name.trim())) return;
          split.onPublish({ name: name.trim(), parts: parts.map(part => ({ name: part.name.trim(), description: part.description.trim() })) });
          return;
        }
        if (!name.trim() || selected.length === 0 || submitted.current) return;
        submitted.current = true;
        try { onCreated({
          id: `executor-${Date.now()}`,
          name: name.trim(),
          source: 'selection',
          description: description.trim(),
          flowIds: selected.map((flow) => flow.id),
          flows: selected,
        }); } catch { submitted.current = false; setError('未能保存到本机，请检查浏览器存储空间后重试。已填内容会保留。'); }
      }}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 14 }}>
        {split ? `当前画布需拆成 ${parts.length} 条工作流。遍历资源后产生多条后续输入，只有通过执行器才能按顺序串联运行。${split.projectName ? `创建后可在「${split.projectName}」的执行器页签查看。` : ''}` : '将已发布工作流按顺序串联成一个执行器，创建后配置本次输入和执行设置。'}
      </Typography.Paragraph>
      {(error || split?.error) && <Typography.Paragraph type="danger" role="alert">{error || split?.error}</Typography.Paragraph>}
      {split ? <div className="hawk-split-composer">
        <label><span><span className="hawk-required">*</span> 执行器名称</span><Input aria-label="执行器名称" aria-required aria-invalid={attempted && !name.trim()} status={attempted && !name.trim() ? 'error' : undefined} value={name} maxLength={120} onChange={event => setName(event.target.value)} />{attempted && !name.trim() && <span className="hawk-composer-field-error" role="alert">请输入执行器名称</span>}</label>
        <div className="hawk-split-heading"><Typography.Text strong>执行顺序与工作流名称</Typography.Text><Typography.Text type="secondary">由画布确定</Typography.Text></div>
        <ol>{parts.map((part, index) => <li key={index}>
          <span className="hawk-composer-sequence">{index + 1}</span>
          <div><Input aria-label={`第${index + 1}段名称`} aria-required aria-invalid={attempted && !part.name.trim()} status={attempted && !part.name.trim() ? 'error' : undefined} value={part.name} maxLength={120} onChange={event => setParts(current => current.map((item, row) => row === index ? { ...item, name: event.target.value } : item))} />{attempted && !part.name.trim() && <span className="hawk-composer-field-error" role="alert">请输入第 {index + 1} 条工作流名称</span>}<Typography.Text type="secondary">{part.labels.join(' → ')}</Typography.Text>
            <details><summary>工作流简介（可选）</summary><Input.TextArea rows={2} aria-label={`第${index + 1}段简介`} value={part.description} maxLength={240} onChange={event => setParts(current => current.map((item, row) => row === index ? { ...item, description: event.target.value } : item))} /></details>
          </div>
        </li>)}</ol>
      </div> : <><div className="hawk-composer-information"><label><span><span className="hawk-required">*</span> 执行器名称</span><Input aria-label="执行器名称" aria-required aria-invalid={attempted && !name.trim()} status={attempted && !name.trim() ? 'error' : undefined} value={name} onChange={(event) => setName(event.target.value)} placeholder="执行器名称" maxLength={120} />{attempted && !name.trim() && <span className="hawk-composer-field-error" role="alert">请输入执行器名称</span>}</label><label><span>执行器简介（可选）</span><Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} placeholder="执行器简介（可选）" /></label></div><div className="hawk-composer-columns">
        <section className="hawk-composer-available">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Typography.Text strong>已发布工作流</Typography.Text>
            <Input prefix={<SearchOutlined />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索名称、Flow ID 或简介" allowClear />
            <List
              size="small"
              className="hawk-composer-candidates"
              dataSource={available.slice(0, 50)}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可添加的工作流" /> }}
              renderItem={(flow) => (
                <List.Item actions={[<Button key="add" type="link" icon={<PlusOutlined />} onClick={() => add(flow.id)}>添加</Button>]}> 
                  <List.Item.Meta title={<span>{flow.name} <Typography.Text type="secondary" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>({publishedFlowId(flow)})</Typography.Text></span>} description={flow.description || '暂无描述'} />
                </List.Item>
              )}
            />
            {available.length > 50 && <Typography.Text type="secondary">显示前 50 条，请搜索缩小范围</Typography.Text>}
          </Space>
        </section>
        <section className={`hawk-composer-selected${attempted && !selected.length ? ' is-invalid' : ''}`} aria-label="执行顺序（必填）">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Typography.Text strong><span className="hawk-required">*</span> 执行顺序</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>前一步输出作为下一步输入</Typography.Text>
          </div>
          {attempted && !selected.length && <span className="hawk-composer-field-error" role="alert">请从左侧至少添加一条工作流</span>}
          {selected.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧添加工作流" style={{ marginTop: 90 }} />
          ) : (
            <Space direction="vertical" className="hawk-composer-selection" style={{ width: "100%" }} size={8}>
              {selected.map((flow, index) => (
                <div key={flow.id} style={{ background: "#fff", border: "1px solid #d9e7fb", borderRadius: 8, padding: "12px 10px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: "#e6f4ff", color: "#1677ff", display: "grid", placeItems: "center", fontWeight: 600 }}>{index + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><Typography.Text strong>{flow.name}</Typography.Text><div><Typography.Text type="secondary" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{publishedFlowId(flow)}</Typography.Text></div>{flow.description && <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{flow.description}</Typography.Text></div>}</div>
                  <Space size={0}><Button type="text" aria-label={'上移 ' + flow.name} icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => move(index, -1)} /><Button type="text" aria-label={'下移 ' + flow.name} icon={<ArrowDownOutlined />} disabled={index === selected.length - 1} onClick={() => move(index, 1)} /><Button type="text" aria-label={'移除 ' + flow.name} danger icon={<DeleteOutlined />} onClick={() => remove(index)} /></Space>
                </div>
              ))}
            </Space>
          )}
        </section>
      </div></>}
    </Modal>
  );
}

export function ExecutorComposer(props: {
  open: boolean;
  initialFlowId?: string;
  flows: PipelineDraft[];
  onCancel: () => void;
  onCreated: (executor: ExecutorDraft) => void;
  split?: SplitComposer;
}) {
  if (!props.open) return null;
  return <ExecutorComposerDialog key={props.split?.requestId ?? props.initialFlowId ?? 'all'} {...props} />;
}
