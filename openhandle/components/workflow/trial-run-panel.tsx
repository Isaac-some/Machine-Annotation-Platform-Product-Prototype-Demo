"use client";

/* eslint-disable @next/next/no-img-element -- Local file previews use object URLs and must not be sent to an image optimizer. */

import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, ChevronUp, Copy, Database, File, LoaderCircle, Pencil, Search, Maximize2, Minimize2, Play, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createTrialSample, trialResultNodes, trialOutputSummary, type NodeTrialRecord, type TrialSample } from "./trial-run";
import { trialFileRecord } from './trial-resource';

import { TRIAL_LIMIT, TRIAL_LIFETIME, type TrialRetention } from "./trial-history";

const statuses = { queued: "等待运行", running: "运行中", succeeded: "已完成", failed: "失败", unexecuted: "未执行" };

type HistoryEntry = TrialRetention & { startedAt: string; revision: number; sample: TrialSample };
export function TrialRunHistory({ runs, selectedId, onSelect, onEdit, onDelete, storageError }: {
  runs: HistoryEntry[]; selectedId?: string; onSelect: (id: string) => void;
  onEdit: (id: string, change: { note?: string; kept?: boolean }) => void;
  onDelete: (id: string) => void; storageError?: string;
}) {
  const tableScroll = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({ top: false, bottom: false });
  useEffect(() => {
    const element = tableScroll.current;
    if (!element) return;
    const update = () => setScrollEdges({ top: element.scrollTop > 1, bottom: element.scrollTop + element.clientHeight < element.scrollHeight - 1 });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => { element.removeEventListener("scroll", update); observer.disconnect(); };
  }, [runs.length]);
  const [editing, setEditing] = useState<HistoryEntry | null>(null);
  const [note, setNote] = useState("");
  const [deleting, setDeleting] = useState<HistoryEntry | null>(null);
  const [unkeeping, setUnkeeping] = useState<HistoryEntry | null>(null);
  const round = (item: HistoryEntry) => item.sequence ?? item.id.split("-").at(-1);
  return <section className="p2-trial-history" aria-label="历史试跑记录">
    <div className="p2-history-heading"><h3>历史试跑</h3><span>{runs.length} / {TRIAL_LIMIT} 条 · 当前草稿</span></div>
    {runs.length >= TRIAL_LIMIT && <p className="p2-callout warning" role="status">历史试跑已满 {TRIAL_LIMIT} 条，删除记录后才能继续试跑。</p>}
    {runs.length ? <div ref={tableScroll} className="p2-history-table-scroll" data-fade-top={scrollEdges.top} data-fade-bottom={scrollEdges.bottom} tabIndex={0} aria-label="上下滚动试跑历史表格"><table><thead><tr><th>轮次 / 时间</th><th>草稿快照</th><th>输入样本</th><th>备注</th><th>状态</th><th>留存</th><th>操作</th></tr></thead><tbody>{runs.map((item) => <tr key={item.id} aria-current={item.id === selectedId ? "true" : undefined}>
      <td>第 {round(item)} 次<small>{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</small></td><td>{item.revision}</td><td>{item.sample.name}</td>
      <td className="p2-history-note"><span>{item.note || "未添加备注"}</span><button aria-label={`编辑第 ${round(item)} 次试跑备注`} disabled={item.phase === "running"} onClick={() => { setEditing(item); setNote(item.note ?? ""); }}><Pencil size={14} /></button></td>
      <td>{item.phase === "running" ? "运行中" : item.phase === "passed" ? "已完成" : "未完成"}</td><td>{item.kept ? <strong>已保留</strong> : <><span>到期清除</span><small>{new Date(item.createdAt + TRIAL_LIFETIME).toLocaleString("zh-CN", { hour12: false })}</small></>}</td>
      <td><div className="p2-history-actions"><button aria-label={`查看第 ${round(item)} 次试跑结果`} onClick={() => onSelect(item.id)}>查看结果</button><button aria-label={`${item.kept ? "取消保留" : "保留"}第 ${round(item)} 次试跑`} disabled={item.phase === "running"} onClick={() => item.kept && item.createdAt + TRIAL_LIFETIME <= Date.now() ? setUnkeeping(item) : onEdit(item.id, { kept: !item.kept })}>{item.kept ? "取消保留" : "保留"}</button><button aria-label={`删除第 ${round(item)} 次试跑`} disabled={item.kept || item.phase === "running"} title={item.kept ? "取消保留后才能删除" : item.phase === "running" ? "运行结束后可删除" : undefined} onClick={() => setDeleting(item)}>删除</button></div></td>
    </tr>)}</tbody></table></div> : <p className="p2-sample-empty">还没有试跑记录。选择资源后开始第一轮试跑。</p>}
    <p className="p2-history-scope p2-history-retention">未保留记录自启动起 7 天到期；保留后长期留存并锁定，取消保留后才能删除。所有记录共用 {TRIAL_LIMIT} 个名额，不自动覆盖。</p>{storageError && <p className="p2-history-storage-error" role="alert">{storageError}</p>}
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent><DialogTitle>第 {editing && round(editing)} 次试跑备注</DialogTitle><DialogDescription>说明这轮试跑的用途，方便之后查找。</DialogDescription><form className="p2-history-form" onSubmit={(event) => { event.preventDefault(); if (editing) onEdit(editing.id, { note: note.trim() }); setEditing(null); }}><label htmlFor="trial-note">备注</label><textarea id="trial-note" value={note} maxLength={200} rows={4} onChange={(event) => setNote(event.target.value)} /><small>{note.length} / 200</small><footer><Button type="button" variant="outline" onClick={() => setEditing(null)}>取消</Button><Button type="submit">保存备注</Button></footer></form></DialogContent></Dialog>
    <Dialog open={Boolean(unkeeping)} onOpenChange={(open) => { if (!open) setUnkeeping(null); }}><DialogContent><DialogTitle>取消保留第 {unkeeping && round(unkeeping)} 次试跑？</DialogTitle><DialogDescription>本轮已超过启动后的 7 天期限，取消保留将立即清除记录，无法恢复。</DialogDescription><div className="p2-history-dialog-actions"><Button variant="outline" onClick={() => setUnkeeping(null)}>继续保留</Button><Button variant="danger" onClick={() => { if (unkeeping) onEdit(unkeeping.id, { kept: false }); setUnkeeping(null); }}>取消保留并清除</Button></div></DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null); }}><DialogContent><DialogTitle>删除第 {deleting && round(deleting)} 次试跑？</DialogTitle><DialogDescription>本轮样本、配置快照和输入输出将一并清除，无法恢复。当前草稿与其他轮次不受影响。</DialogDescription><div className="p2-history-dialog-actions"><Button variant="outline" onClick={() => setDeleting(null)}>取消</Button><Button variant="danger" onClick={() => { if (deleting) onDelete(deleting.id); setDeleting(null); }}>确认删除</Button></div></DialogContent></Dialog>
  </section>;
}

export function TrialSamplePreview({ sample }: { sample: TrialSample }) {
  return <div className="p2-sample-preview">{sample.type.startsWith("video/") ? <video src={sample.previewUrl} controls preload="metadata" /> : sample.type.startsWith("image/") ? <img src={sample.previewUrl} alt={sample.name} /> : sample.type.startsWith("audio/") ? <audio src={sample.previewUrl} controls /> : <p>此文件暂无在线预览，可核对下方文件信息。</p>}<strong>{sample.name}</strong><p>{sample.source === "platform" ? "平台演示资源" : sample.source === "cid" ? "试跑产出 CID" : "本地文件"} · {sample.type || "未知格式"}{sample.size !== undefined ? ` · ${(sample.size / 1024).toFixed(1)} KB` : ""}</p></div>;
}

export function TrialSamplePreparation({ sample, revision, blocked, limitReached, onChange, onRun, onView, onNotice, onLocalUrl, grouped = false }: {
  grouped?: boolean; sample: TrialSample | null; revision: number; blocked: boolean; limitReached: boolean;
  onChange: (sample: TrialSample | null) => void; onRun: () => void;
  onView: (sample: TrialSample) => void; onNotice: (message: string) => void; onLocalUrl: (url: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [platformEntry, setPlatformEntry] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const retryFile = useRef<globalThis.File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  useEffect(() => () => { generation.current += 1; }, []);
  const selectLocal = async (file: globalThis.File) => {
    const request = ++generation.current;
    retryFile.current = file;
    setUploading(true); setUploadError('');
    try {
      if (!file.size) throw new Error('文件为空，请更换文件');
      // Validate that the selected file is readable; the resource service is not connected.
      await file.arrayBuffer();
      const record = /\.(jsonl|ndjson)$/i.test(file.name) ? trialFileRecord(await file.text()) : undefined;
      await new Promise(resolve => setTimeout(resolve, 450));
      if (request !== generation.current) return;
      const previewUrl = URL.createObjectURL(file); onLocalUrl(previewUrl);
      const sample = createTrialSample({ id: 'upload-' + crypto.randomUUID(), source: 'local', name: file.name, type: file.type, size: file.size, previewUrl });
      onChange(record ? { ...sample, values: record, dataRecord: true } : sample);
      setUploading(false);
    } catch (issue) {
      if (request !== generation.current) return;
      setUploading(false); setUploadError(issue instanceof Error ? issue.message : '文件读取失败，请重试');
    }
  };
  const openPicker = () => { setPlatformEntry(null); setPicker(true); };
  return <div className="p2-sample-preparation">
    <div className="p2-sample-heading"><h3>选择一条试跑资源</h3><span>当前草稿快照 {revision}</span></div>
    <div className="p2-sample-actions"><Button variant="outline" onClick={openPicker}><Database size={15} />选择平台资源</Button><Button variant="outline" onClick={() => upload.current?.click()}><Upload size={15} />选择本地文件</Button><input ref={upload} type="file" aria-label="选择一个本地试跑文件" className="p2-file-input" onChange={(event) => {
      const files = event.target.files;
      if (files?.length && files.length !== 1) { onNotice("每轮只接受一个文件，请重新选择"); event.target.value = ""; return; }
      const file = files?.[0]; if (!file) return;
      void selectLocal(file);
      event.target.value = "";
    }} /></div>
    {uploading && <p className="p2-upload-state" role="status"><LoaderCircle size={16} className="p2-spin" />正在上传并取得 TOS 路径（本地模拟）</p>}
    {uploadError && <div className="p2-error" role="alert">{uploadError} <button onClick={() => { if (retryFile.current) void selectLocal(retryFile.current); }}>重试上传</button></div>}
    {sample ? <div className="p2-selected-sample"><File size={20} /><div><strong>{sample.name}</strong><small>{sample.source === "platform" ? "平台演示资源" : sample.source === "cid" ? "试跑产出 CID" : "本地文件"} · 本轮 1 条</small>{sample.resource && <small><code>{sample.resource.cid}</code></small>}{sample.upload && <small className="p2-upload-ready"><CheckCircle2 size={13} />上传完成（模拟） · <code>{sample.upload.path}</code></small>}</div><button onClick={() => onView(sample)}>查看</button><button onClick={() => sample.source === "platform" ? openPicker() : upload.current?.click()}>更换</button><button aria-label="移除试跑资源" onClick={() => { generation.current += 1; setUploading(false); setUploadError(''); onChange(null); }}><X size={15} /></button></div> : <p className="p2-sample-empty">尚未选择资源。每轮使用一个文件。</p>}
    <div className="p2-sample-start"><p>本地文件先模拟上传取得 TOS 路径；开始后固定本轮样本和配置。</p><Button onClick={onRun} disabled={!limitReached && (!sample || blocked || uploading || Boolean(uploadError))}><Play size={15} />{grouped ? '整组重新试跑' : '开始试跑'}</Button></div>
    <Dialog open={picker} onOpenChange={open => { setPicker(open); if (!open) setPlatformEntry(null); }}><DialogContent className="p2-resource-picker">
      <DialogTitle>{platformEntry ?? '选择平台资源'}</DialogTitle>
      {platformEntry ? <><div className="p2-platform-handoff"><ArrowUpRight size={32} aria-hidden="true" /><DialogDescription className="p2-platform-placeholder-description">通过资源管理平台当前能力承接</DialogDescription><small>当前原型暂不展开此界面</small></div><div className="p2-platform-placeholder" aria-label="资源管理平台占位界面" /><footer><Button variant="outline" onClick={() => setPlatformEntry(null)}><ArrowLeft size={15} />返回</Button></footer></> : <>
        <DialogDescription>选择资源管理平台入口，或返回试跑准备选择一个本地文件。</DialogDescription>
        <div className="p2-resource-paths"><button type="button" onClick={() => setPlatformEntry('去圈选')}><Search size={20} /><span><strong>去圈选</strong><small>进入资源平台设置条件并圈选文件</small></span></button><button type="button" onClick={() => setPlatformEntry('从圈选集中选择文件')}><Database size={20} /><span><strong>从圈选集中选择文件</strong><small>打开已有圈选集，单选一条资源</small></span></button></div>
        <p className="p2-history-scope">本地文件演示不需要平台回传；返回不会更换已选样本。</p><footer><Button variant="outline" onClick={() => setPicker(false)}>取消</Button></footer>
      </>}
    </DialogContent></Dialog>
  </div>;
}

function TrialValue({ title, value, empty, onNotice }: { title: string; value?: Record<string, unknown>; empty: string; onNotice: (message: string) => void }) {
  return <section><header><h3>{title}</h3>{value !== undefined && <button aria-label={`复制${title}`} onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(value, null, 2)); onNotice(`已复制${title}`); } catch { onNotice("复制失败，请选中内容后按 Ctrl/Cmd+C"); } }}><Copy size={13} />复制</button>}</header><pre tabIndex={0} aria-label={title}>{value === undefined ? empty : JSON.stringify(value, null, 2)}</pre></section>;
}

export function TrialRunDetails({ nodes, records, sample, phase, revision, stale, selectedNodeId, onSelect, onFocus, onView, onNotice }: {
  nodes: { id: string; label: string; operatorId: string; kind: string; readOnly?: boolean }[];
  records: Record<string, NodeTrialRecord>; sample: TrialSample; phase: string; revision: number; stale: boolean; selectedNodeId: string;
  onSelect: (id: string) => void; onFocus: (id: string) => void; onView: (sample: TrialSample) => void; onNotice: (message: string) => void;
}) {
  const visible = trialResultNodes(nodes, Object.keys(records));
  const node = visible.find((node) => node.id === selectedNodeId) ?? visible[0];
  const record = node && records[node.id];
  const summary = trialOutputSummary(visible.map(item => records[item.id]).filter(Boolean), phase === "running");
  const hasInput = record && !["queued", "unexecuted"].includes(record.status);
  return <div className="p2-trial-review" aria-label="本次试跑详情"><div className="p2-trial-overview"><span>草稿快照 {revision} · {sample.name}</span><button onClick={() => onView(sample)}>查看输入资源</button><small>模拟执行</small></div><p className="p2-trial-output-summary" role="status"><strong>{summary.label}</strong><span>已产出 {summary.produced} / {visible.length} 个处理节点 · 失败 {summary.failed} · 未执行 {summary.unexecuted}</span></p>{stale && <p className="p2-callout warning">当前草稿已变化，以下保留本轮的样本、配置和运行记录。</p>}{!node ? <p>暂无可展示的处理节点，请先添加算子。</p> : <div className="p2-trial-detail"><nav aria-label="试跑节点">{visible.map((item, index) => <button key={item.id} aria-pressed={item.id === node.id} onClick={() => onSelect(item.id)}><span className="p2-trial-node-label"><span className="p2-trial-number">{index + 1}.</span>{item.label}</span><small>{records[item.id] ? statuses[records[item.id].status] : "等待运行"}</small></button>)}</nav><section><header><strong>{node.label}</strong><button onClick={() => onFocus(node.id)}>定位画布</button></header>{record?.error && <p className="p2-error" role="status">{record.error}</p>}<div className="p2-trial-io"><TrialValue title="本轮节点输入" value={hasInput ? record.inputs : undefined} empty={record?.status === "unexecuted" ? "本节点未执行" : "等待节点运行"} onNotice={onNotice} /><TrialValue title="本轮节点输出" value={record?.status === "succeeded" ? record.outputs : undefined} empty={record?.status === "failed" ? "本节点失败，没有产出" : record?.status === "unexecuted" ? "本节点未执行，没有产出" : phase === "running" ? "尚未产出" : "暂无输出数据"} onNotice={onNotice} /></div>{record && <details className="p2-trial-config-snapshot"><summary>查看本轮配置（只读）</summary><pre>{JSON.stringify(record.config, null, 2)}</pre></details>}</section></div>}</div>;
}

export function TrialDock({ className, expanded, onExpanded, title, meta, actions, children, height, setHeight, maximized, setMaximized }: { className: string; expanded: boolean; onExpanded: (expanded: boolean) => void; title: ReactNode; meta: string; actions: ReactNode; children: ReactNode; height: number; setHeight: (height: number) => void; maximized: boolean; setMaximized: (maximized: boolean) => void }) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const clamp = (value: number) => Math.max(180, Math.min(value, (panel.current?.closest(".p2-workspace")?.clientHeight ?? 700) - 150));
  const resize = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setHeight(clamp(drag.current.height + drag.current.y - event.clientY));
  };
  return <section ref={panel} className={`p2-dock p2-resizable-dock ${className} ${expanded ? "expanded" : ""} ${maximized && expanded ? "maximized" : ""}`} style={expanded ? { height: maximized ? "calc(100% - 28px)" : height } : undefined} aria-label="校验与试跑结果">
    {expanded && <div className="p2-dock-resize" role="separator" aria-label="调整试跑面板高度" aria-orientation="horizontal" aria-valuemin={180} aria-valuemax={1000} aria-valuenow={Math.round(height)} tabIndex={0} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); drag.current = { y: event.clientY, height: panel.current?.getBoundingClientRect().height ?? height }; setMaximized(false); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={resize} onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; }} onKeyDown={(event) => { if (!["ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); setMaximized(false); setHeight(clamp(height + (event.key === "ArrowUp" ? 32 : -32))); }}><span /></div>}
    <header><button onClick={() => onExpanded(!expanded)} aria-expanded={expanded}><strong>{title}</strong><span>{meta}</span></button><div>{actions}{expanded && <button aria-label={maximized ? "还原试跑面板" : "最大化试跑面板"} onClick={() => setMaximized(!maximized)}>{maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}<button aria-label={expanded ? "收起结果" : "展开结果"} onClick={() => onExpanded(!expanded)}>{expanded ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button></div></header>{expanded && children}
  </section>;
}
