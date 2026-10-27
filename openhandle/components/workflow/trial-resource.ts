import type { TrialSample, NodeTrialRecord } from './trial-run';
export type TrialResource = { cid: string; sourceRunId: string; name: string; values: Record<string, unknown>; content: string };
export function trialFileRecord(content: string): Record<string, unknown> {
  const lines = content.trim().split(/\r?\n/).filter(line => line.trim());
  if (lines.length !== 1) throw new Error('试跑产出文件需包含一条 JSONL 数据，请按单条样本准备');
  let value: unknown;
  try { value = JSON.parse(lines[0]); } catch { throw new Error('试跑产出文件不是有效的 JSONL 对象'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) throw new Error('试跑产出文件需包含非空的数据对象');
  return value as Record<string, unknown>;
}
export function trialResource(run: { id: string; sequence?: number; phase: string; nodes: { id: string; data: { kind: string } }[]; records: Record<string, NodeTrialRecord> }): TrialResource | undefined {
  if (run.phase !== 'passed') return;
  const values = Object.assign({}, ...run.nodes.filter(node => node.data.kind === 'result').map(node => run.records[node.id]?.outputs ?? {}));
  if (!Object.keys(values).length) return;
  return { cid: 'CID://' + run.id, sourceRunId: run.id, name: 'trial-' + (run.sequence ?? run.id) + '.jsonl', values, content: JSON.stringify(values) + '\n' };
}
export function trialCidSample(cid: string, resources: TrialResource[]): TrialSample {
  const resource = resources.find(resource => resource.cid.toLowerCase() === cid.trim().toLowerCase());
  if (!resource) throw new Error('没有找到此 CID 的可用试跑产出，请核对 CID；源记录过期或删除后，请使用已下载的产出文件。');
  return { id: resource.cid, source: 'cid', name: resource.name, type: 'application/x-ndjson', previewUrl: '', resource: { cid: resource.cid, sourceRunId: resource.sourceRunId }, values: structuredClone(resource.values) };
}
