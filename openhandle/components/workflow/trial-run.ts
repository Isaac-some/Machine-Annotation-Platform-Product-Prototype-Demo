import type { OperatorField, WorkflowConfigValue, FieldMapping } from "@/app/lib/workflow";
import type { OutputShapeField } from "./output-schema";
import { workflowOutputNodes } from './workflow-outputs';

/** Local demonstration records. No model, storage or execution service is called. */
export type TrialSample = {
  id: string; source: "platform" | "local" | "cid" | "manual"; name: string; type: string; size?: number;
  previewUrl: string; values: Record<string, unknown>;
  resource?: { cid: string; sourceRunId: string };
  dataRecord?: boolean;
  upload?: { status: 'ready'; path: string; simulated: true };
  selections?: { recordIndex?: number; arrayItems?: Record<string, number>; originalArrays?: Record<string, unknown[]> };
};
export const trialSampleSourceLabel = (sample: TrialSample) => sample.source === 'platform' ? '平台演示资源' : sample.source === 'cid' ? '试跑产出 CID' : sample.source === 'manual' ? '手动输入' : '本地文件';
export const platformTrialSamples = [
  { id: "demo_vid_001", name: "视频演示样本.mov", type: "video/quicktime", path: "test-assets/demo.mov" },
  { id: "demo_image_001", name: "图片演示样本.jpg", type: "image/jpeg", path: "test-assets/pexels-amaurymic-33953580.jpg" },
];
export function createTrialSample(file: { id: string; source: TrialSample["source"]; name: string; type: string; size?: number; previewUrl: string }): TrialSample {
  const path = `tos://demo/${encodeURIComponent(file.id)}/${encodeURIComponent(file.name)}`;
  return { ...file, ...(file.source === 'local' ? { upload: { status: 'ready' as const, path, simulated: true as const } } : {}), values: { vid: file.id, tos_path: path, dir: path, urls: [path], path } };
}
export type TrialNode = {
  id: string; label: string; operatorId: string; kind: string; readOnly?: boolean;
  inputs: OperatorField[]; outputs: OperatorField[]; config: Record<string, WorkflowConfigValue>;
  mappings: Record<string, FieldMapping>; outputShape?: OutputShapeField[];
  outputRoot?: string;
};
export type NodeTrialRecord = {
  nodeId: string; status: "queued" | "running" | "succeeded" | "failed" | "unexecuted";
  inputs: Record<string, unknown>; outputs?: Record<string, unknown>;
  config: Record<string, WorkflowConfigValue>; error?: string;
};
/** Archive a detached run snapshot; updating the same round never duplicates it. */
export function retainTrial<T extends { id: string }>(history: T[], run: T): T[] {
  return [structuredClone(run), ...history.filter((item) => item.id !== run.id)];
}
export function trialResultNodes<T extends { id: string; operatorId: string; kind: string; readOnly?: boolean }>(nodes: T[], order: readonly string[] = nodes.map((node) => node.id)): T[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return nodes.filter((node) => !node.readOnly && node.operatorId !== "control.start" && node.kind !== "result")
    .sort((a, b) => (positions.get(a.id) ?? order.length) - (positions.get(b.id) ?? order.length));
}
export function trialOutputSummary(records: NodeTrialRecord[], running: boolean) {
  const produced = records.filter(record => record.status === "succeeded" && record.outputs !== undefined && Object.keys(record.outputs).length > 0).length;
  const completed = records.filter(record => record.status === "succeeded").length;
  const failed = records.filter(record => record.status === "failed").length;
  const unexecuted = records.filter(record => record.status === "unexecuted").length;
  const label = running ? "运行中" : produced === 0 ? "本轮零产出" : failed || unexecuted ? "本轮部分产出" : "本轮产出完成";
  return { produced, completed, failed, unexecuted, label };
}
export function trialValueAt(value: unknown, path: string): unknown {
  if (value && typeof value === "object" && Object.hasOwn(value, path)) return (value as Record<string, unknown>)[path];
  return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" && Object.hasOwn(current, key) ? (current as Record<string, unknown>)[key] : undefined, value);
}
function demoColumn(field: OutputShapeField, sample: TrialSample): unknown {
  if (field.type === "Boolean") return true;
  if (field.type === "Int") return 1;
  if (field.type === "Float") return 0.95;
  return field.choices?.[0] ?? `${sample.name} · ${field.description || field.key}（演示）`;
}
function resolveConfig(config: TrialNode["config"], records: Record<string, NodeTrialRecord>): TrialNode["config"] {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, typeof value !== "string" ? value : value.replace(/\{([A-Za-z0-9_-]+)\.(inputs|outputs)\.([^{}\n]+)\}/g, (token, id: string, direction: "inputs" | "outputs", path: string) => {
    const resolved = trialValueAt(records[id]?.[direction], path);
    if (resolved === undefined) throw new Error(`${token} 尚无本轮数据`);
    return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  })]));
}

/** Runs only the supplied demo operators, in dependency order. Missing data is never a success. */
export function simulateTrial(nodes: TrialNode[], edges: { source: string; target: string }[], sample: TrialSample, failureNode?: string) {
  const records: Record<string, NodeTrialRecord> = {};
  const order: string[] = [];
  const pending = nodes.filter((node) => !node.readOnly);
  while (pending.length) {
    const index = pending.findIndex((node) => edges.filter((edge) => edge.target === node.id).every((edge) => Boolean(records[edge.source])));
    if (index < 0) {
      for (const node of pending) {
        records[node.id] = { nodeId: node.id, status: "unexecuted", inputs: {}, config: structuredClone(node.config), error: "依赖关系未就绪，本节点未执行" };
        order.push(node.id);
      }
      break;
    }
    const node = pending.splice(index, 1)[0];
    order.push(node.id);
    const record: NodeTrialRecord = { nodeId: node.id, status: "queued", inputs: {}, config: structuredClone(node.config) };
    records[node.id] = record;
    const incoming = edges.filter((edge) => edge.target === node.id);
    if (incoming.some((edge) => records[edge.source]?.status !== "succeeded")) {
      record.status = "unexecuted"; record.error = "上游未成功，本节点未执行"; continue;
    }
    try {
      if (node.operatorId === "control.start") {
        record.outputs = Object.fromEntries(node.outputs.map((field) => {
          const value = sample.values[field.key];
          if (value === undefined) throw new Error(`所选资源未提供工作流输入 ${field.key}`);
          return [field.key, value];
        }));
      } else if (node.kind === "result") {
        const sources = workflowOutputNodes(nodes, edges, node.id);
        if (sources.some(source => records[source.id]?.status !== 'succeeded')) throw new Error('上游未成功，无法汇总结束输出');
        const outputs: Record<string, unknown> = Object.assign({}, ...sources.map(source => records[source.id]?.outputs ?? {}));
        record.outputs = outputs;
        record.inputs = structuredClone(outputs);
      } else {
        for (const field of node.inputs) {
          const binding = node.mappings[field.key];
          const value = binding?.sourceType === "upstream" ? trialValueAt(records[binding.sourceNodeId!]?.outputs, binding.sourceField!)
            : binding?.sourceType === "fixed" ? binding.value : binding?.sourceType === "parameter" ? sample.values[field.key] : undefined;
          if (value === undefined && field.required && !field.system) throw new Error(`输入 ${field.key} 尚无本轮数据，请核对资源与映射`);
          if (value !== undefined) record.inputs[field.key] = value;
        }
        record.config = resolveConfig(node.config, records);
        if (node.id === failureNode) throw new Error("本轮演示返回不符合配置的输出结构");
        if (node.config["跳过"]) throw new Error("本地演示暂不支持跳过算子，请关闭跳过设置后重试");
        if (node.operatorId === 'control.rowkey') {
          const path = record.inputs.tos_path;
          if (typeof path !== 'string' || !path.trim()) throw new Error('生成 rowkey 需要一个非空文件路径；多个切片请先明确选择一项');
          // An injective encoding keeps equal paths stable without hash collisions or random keys.
          record.outputs = { rowkey: `rk:path:${encodeURIComponent(path)}`, tos_path: path };
        } else if (node.operatorId === "demo.vod.upload.tos") {
          if (sample.source !== "cid" && !sample.dataRecord && !sample.type.startsWith("video/")) throw new Error("视频转存需要视频资源，请更换所选文件");
          if (typeof record.inputs.vid !== "string") throw new Error("视频转存缺少本轮 vid");
          record.outputs = { tos_path: `tos://demo/${encodeURIComponent(record.inputs.vid)}/${encodeURIComponent(sample.name)}` };
        } else if (node.operatorId === 'demo.tos.list') {
          if (typeof record.inputs.dir !== 'string' || !record.inputs.dir.startsWith('tos://')) throw new Error('遍历 TOS 目录需要上传后的 TOS 路径');
          // One-file trial: demonstrate only the uploaded file, without listing a real bucket.
          record.outputs = { tos_path: sample.values.tos_path };
        } else if (["demo.ai-platform.gemini", "demo.ai-platform.deepseek", "demo.ai-platform.qwen_tmp1"].includes(node.operatorId)) {
          if (!node.outputShape && node.outputRoot) {
            record.outputs = { [node.outputRoot]: `${sample.name} · ${String(node.config['提示词'] || '内容理解结果')}（本地演示）` };
            record.status = 'succeeded';
            continue;
          }
          if (!node.outputShape?.length) throw new Error("尚未配置 AI 输出列");
          const columns = Object.fromEntries(node.outputShape.map((field) => [field.key, demoColumn(field, sample)]));
          const root = node.outputRoot ?? node.outputs.find((field) => !field.key.includes(".") && !node.outputShape!.some((column) => column.key === field.key))?.key;
          record.outputs = root ? { [root]: columns } : columns;
        } else {
          throw new Error("此算子尚未提供本地演示数据，未生成输出");
        }
      }
      record.status = "succeeded";
    } catch (error) {
      record.status = "failed"; record.error = error instanceof Error ? error.message : "本轮演示失败"; delete record.outputs;
    }
  }
  return { records: structuredClone(records), order };
}
