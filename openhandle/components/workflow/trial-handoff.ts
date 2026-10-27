import { getOperator, type OperatorField } from '@/app/lib/workflow';
import { publicationSegments, trialSegment, isSplitOperator, type LocalGraph } from './local-publish-model';
import { trialValueAt, type TrialSample } from './trial-run';
import { outputColumnPath } from './output-schema';

export type HandoffBinding = {
  targetNodeId: string; targetField: string; sourceField: string;
  upstream?: { nodeId: string; field: string };
};
export type TrialHandoffConfig = {
  sourceNodeId: string; targetNodeId: string; primaryKey: string; bindings: HandoffBinding[];
};
export type HandoffRequirement = {
  nodeId: string; label: string; field: OperatorField;
  upstream?: { nodeId: string; field: string };
};
export type TrialBoundary = {
  edgeId: string; sourceNodeId: string; targetNodeId: string;
  groupIndex: number; nodeIds: string[]; requirements: HandoffRequirement[]; orphan?: boolean;
};
export type HandoffIssue = { edgeId: string; nodeId: string; field?: string; primaryKey?: boolean; message: string };
export type FrozenTrialHandoff = {
  primaryKey: { field: string; value: string | number };
  rules: { edgeId: string; config: TrialHandoffConfig }[];
  inputs: { edgeId: string; nodeId: string; field: string; sourceField: string; value: unknown }[];
};

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const bindingKey = (nodeId: string, field: string) => JSON.stringify([nodeId, field]);
export const handoffConfig = (graph: LocalGraph, edgeId: string) => graph.edges.find(edge => edge.id === edgeId)?.data?.trialHandoff as TrialHandoffConfig | undefined;

function reachable(graph: LocalGraph, source: string, target: string, allowed?: Set<string>) {
  const seen = new Set<string>();
  const queue = [source];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...graph.edges.filter(edge => edge.source === id && (!allowed || allowed.has(edge.target))).map(edge => edge.target));
  }
  return false;
}

/** Requirements retain the original producer even when the trial excludes it. */
function groupRequirements(graph: LocalGraph, ids: Set<string>): HandoffRequirement[] {
  return graph.nodes.filter(node => ids.has(node.id)).flatMap(node => {
    const inputs = getOperator(node.data.operatorId)?.inputs ?? [];
    return inputs.filter(field => !field.system).flatMap(field => {
      const binding = node.data.mappings[field.key];
      if (binding?.sourceType === 'fixed' || binding?.sourceType === 'system' || binding?.sourceType === 'upstream' && ids.has(binding.sourceNodeId ?? '')) return [];
      if (!field.required && binding?.sourceType !== 'upstream') return [];
      return [{ nodeId: node.id, label: node.data.label, field, ...(binding?.sourceType === 'upstream' ? { upstream: { nodeId: binding.sourceNodeId ?? '', field: binding.sourceField ?? '' } } : {}) }];
    });
  });
}

export function trialBoundaries(graph: LocalGraph): TrialBoundary[] {
  const groups = publicationSegments(graph) ?? [];
  const boundaries = groups.flatMap((group, groupIndex) => {
    const nodeIds = group.nodeIds.filter(id => graph.nodes.some(node => node.id === id && !isSplitOperator(node)));
    const ids = new Set(nodeIds);
    const requirements = groupRequirements(graph, ids);
    const entries = graph.edges.filter(edge => ids.has(edge.target) && !ids.has(edge.source)
      && (groupIndex > 0 || graph.nodes.find(node => node.id === edge.source)?.data.operatorId !== 'control.start'));
    return entries.map(edge => ({ edgeId: edge.id, sourceNodeId: edge.source, targetNodeId: edge.target, groupIndex, nodeIds,
      requirements: requirements.filter(requirement => reachable(graph, edge.target, requirement.nodeId, ids)
        && (!requirement.upstream || reachable(graph, requirement.upstream.nodeId, edge.source)
          // Broken references still belong to an input; never drop them during preparation.
          || !entries.some(entry => reachable(graph, entry.target, requirement.nodeId, ids) && reachable(graph, requirement.upstream!.nodeId, entry.source)))) }));
  });
  // A saved rule must remain visible after a user rewires or removes a boundary.
  for (const edge of graph.edges.filter(edge => edge.data?.trialHandoff && !boundaries.some(boundary => boundary.edgeId === edge.id))) {
    const groupIndex = groups.findIndex(group => group.nodeIds.includes(edge.target));
    boundaries.push({ edgeId: edge.id, sourceNodeId: edge.source, targetNodeId: edge.target, groupIndex,
      nodeIds: groups[groupIndex]?.nodeIds ?? [], requirements: [], orphan: true } as TrialBoundary);
  }
  return boundaries;
}

export function emptyHandoff(boundary: TrialBoundary, graph?: LocalGraph): TrialHandoffConfig {
  return { sourceNodeId: boundary.sourceNodeId, targetNodeId: boundary.targetNodeId,
    primaryKey: graph && handoffOutputFields(graph, boundary.sourceNodeId).some(field => field.key === 'rowkey') ? 'rowkey' : '', bindings: [] };
}

export const effectiveHandoff = (graph: LocalGraph, boundary: TrialBoundary) => handoffConfig(graph, boundary.edgeId) ?? emptyHandoff(boundary, graph);

/** Business input references stay on nodes. The handoff never edits their meaning. */
function sampleSource(graph: LocalGraph, boundary: TrialBoundary, requirement: HandoffRequirement, sample?: TrialSample | null) {
  const upstream = requirement.upstream;
  if (!upstream) return requirement.field.key;
  const qualified = `${upstream.nodeId}.${upstream.field}`;
  const producers = new Set(trialBoundaries(graph).filter(item => item.groupIndex === boundary.groupIndex).flatMap(item => item.requirements).filter(item => item.upstream?.field === upstream.field).map(item => item.upstream!.nodeId));
  return producers.size > 1 || sample && trialValueAt(sample.values, qualified) !== undefined ? qualified : upstream.field;
}

export function handoffSampleFields(graph: LocalGraph, boundary: TrialBoundary) {
  return [...new Set([effectiveHandoff(graph, boundary).primaryKey, ...boundary.requirements.map(requirement => sampleSource(graph, boundary, requirement))].filter(Boolean))];
}

export function trialValueFits(value: unknown, field: OperatorField): boolean {
  if (value === undefined || value === null || value === '') return !field.required;
  const type = field.type.toLowerCase();
  if (field.cardinality === 'many' || type === 'list' || type === 'array') {
    return Array.isArray(value) && (['list', 'array', 'any', 'unknown'].includes(type) || value.every(item => trialValueFits(item, { ...field, cardinality: 'one' })));
  }
  if (Array.isArray(value)) return false;
  if (['string', 'file', 'url'].includes(type)) return typeof value === 'string';
  if (['int', 'integer'].includes(type)) return typeof value === 'number' && Number.isInteger(value);
  if (['float', 'number', 'double'].includes(type)) return typeof value === 'number' && Number.isFinite(value);
  if (['boolean', 'bool'].includes(type)) return typeof value === 'boolean';
  if (['json', 'object', 'dict'].includes(type)) return typeof value === 'object';
  return true;
}

export function handoffOutputFields(graph: LocalGraph, nodeId: string, seen = new Set<string>()): OperatorField[] {
  if (seen.has(nodeId)) return [];
  seen.add(nodeId);
  const source = graph.nodes.find(node => node.id === nodeId);
  if (!source) return [];
  if (source.data.operatorId === 'phase2.merge') {
    const incoming = graph.edges.find(edge => edge.target === nodeId);
    return incoming ? handoffOutputFields(graph, incoming.source, seen) : [];
  }
  let fields = getOperator(source.data.operatorId)?.outputs ?? [];
  if (source.data.operatorId === 'control.start') {
    try { fields = JSON.parse(String(source.data.config['工作流输入字段'] ?? '[]')); } catch { return []; }
    return Array.isArray(fields) ? fields : [];
  }
  try {
    const columns: { key: string; type?: string }[] = JSON.parse(String(source.data.config['AI输出结构'] ?? '[]'));
    if (Array.isArray(columns)) fields = [...fields, ...columns.map(column => ({ key: outputColumnPath(column.key, fields[0]?.key), type: column.type ?? 'String', semanticType: 'field.generic', cardinality: column.type === 'List' ? 'many' : 'one' }))];
  } catch { /* Keep declared outputs when an old schema is unreadable. */ }
  return fields;
}

export function boundaryIssues(graph: LocalGraph, boundary: TrialBoundary, sample?: TrialSample | null): HandoffIssue[] {
  const issues: HandoffIssue[] = [];
  const add = (message: string, field?: string, nodeId = boundary.targetNodeId, primaryKey = false) => issues.push({ edgeId: boundary.edgeId, nodeId, field, primaryKey, message });
  const config = effectiveHandoff(graph, boundary);
  if (boundary.orphan) { add('此连线已不对应原分组边界，请清除旧接续配置后重新配置'); return issues; }
  if (config.sourceNodeId !== boundary.sourceNodeId || config.targetNodeId !== boundary.targetNodeId) add('连线端点已变化，请重新配置接续规则');
  if (!config.primaryKey.trim()) add('上游没有 rowkey，请选择上游产出字段作为接续主键', undefined, boundary.targetNodeId, true);
  else if (!handoffOutputFields(graph, boundary.sourceNodeId).some(field => field.key === config.primaryKey)) add(`原主键 ${config.primaryKey} 已不在上游产出中，请重新选择`, undefined, boundary.targetNodeId, true);
  if (sample && config.primaryKey.trim()) {
    const value = trialValueAt(sample.values, config.primaryKey);
    if (!(typeof value === 'string' && value.trim() || typeof value === 'number' && Number.isFinite(value))) add(`主键 ${config.primaryKey} 必须是存在且非空的单个文本或数字；多个切片需先选择一项`, config.primaryKey, boundary.targetNodeId, true);
    else {
      const field = handoffOutputFields(graph, boundary.sourceNodeId).find(field => field.key === config.primaryKey);
      if (field && !trialValueFits(value, { ...field, cardinality: 'one' })) add(`主键 ${config.primaryKey} 的实际类型与上游产出不匹配，请显式转换`, config.primaryKey, boundary.targetNodeId, true);
    }
  }
  for (const requirement of boundary.requirements) {
    const binding = graph.nodes.find(node => node.id === requirement.nodeId)?.data.mappings[requirement.field.key];
    if (!binding || binding.sourceType === 'upstream' && !requirement.upstream?.field) { add(`请在 ${requirement.label} 的输入配置中选择 ${requirement.field.key} 的来源`, requirement.field.key, requirement.nodeId); continue; }
    if (requirement.upstream) {
      if (!handoffOutputFields(graph, requirement.upstream.nodeId).some(field => field.key === requirement.upstream!.field) || !reachable(graph, requirement.upstream.nodeId, requirement.nodeId)) add(`原始来源字段 ${requirement.upstream.field} 已失效或不可达，请先修复节点字段来源`, requirement.field.key, requirement.nodeId);
    }
    if (sample) {
      const sourceField = sampleSource(graph, boundary, requirement, sample);
      const value = trialValueAt(sample.values, sourceField);
      if (value === undefined || value === null || requirement.field.required && typeof value === 'string' && !value.trim()) add(`本轮输入缺少 ${sourceField}（供 ${requirement.label}.${requirement.field.key} 使用）`, requirement.field.key, requirement.nodeId);
      else if (!trialValueFits(value, requirement.field)) add(`${sourceField} 与 ${requirement.field.key} 的类型或单值／多值结构不匹配，请选择一项或显式转换`, requirement.field.key, requirement.nodeId);
    }
  }
  return issues;
}

/** Compile into a detached graph; neither inference nor execution edits the canvas. */
export function compileTrialHandoff(graph: LocalGraph, groupIndex: number, sample?: TrialSample | null) {
  const boundaries = trialBoundaries(graph).filter(boundary => boundary.groupIndex === groupIndex);
  const issues = boundaries.flatMap(boundary => boundaryIssues(graph, boundary, sample));
  const keys = new Set(boundaries.map(boundary => effectiveHandoff(graph, boundary).primaryKey).filter(Boolean));
  if (keys.size > 1) for (const boundary of boundaries) issues.push({ edgeId: boundary.edgeId, nodeId: boundary.targetNodeId, primaryKey: true, message: '同一试跑组的多个入口配置了不同主键，请统一后再试跑' });
  const executionGraph = copy(trialSegment(graph, groupIndex));
  const executionValues = copy(sample?.values ?? {});
  const inputs: FrozenTrialHandoff['inputs'] = [];
  const fields: OperatorField[] = [];
  const assigned = new Map<string, string>();
  for (const boundary of boundaries) {
    if (boundary.orphan) continue;
    for (const requirement of boundary.requirements) {
      const sourceField = sampleSource(graph, boundary, requirement, sample);
      if (!sourceField) continue;
      const identity = bindingKey(requirement.nodeId, requirement.field.key);
      const previous = assigned.get(identity);
      if (previous && previous !== sourceField) { issues.push({ edgeId: boundary.edgeId, nodeId: requirement.nodeId, field: requirement.field.key, message: `${requirement.field.key} 在多个入口具有不同来源，请明确唯一来源` }); continue; }
      if (previous) continue;
      assigned.set(identity, sourceField);
      // Separate aliases prevent identical target names on different nodes colliding.
      const alias = `trial-input-${fields.length + 1}`;
      fields.push({ ...requirement.field, key: alias });
      const value = sample ? trialValueAt(sample.values, sourceField) : undefined;
      if (value !== undefined) executionValues[alias] = copy(value);
      const target = executionGraph.nodes.find(node => node.id === requirement.nodeId);
      if (target) target.data.mappings[requirement.field.key] = { sourceType: 'upstream', sourceNodeId: 'segment-start', sourceField: alias };
      inputs.push({ edgeId: boundary.edgeId, nodeId: requirement.nodeId, field: requirement.field.key, sourceField, value });
    }
  }
  const start = executionGraph.nodes.find(node => node.data.operatorId === 'control.start');
  if (start && boundaries.length) {
    const remaining: OperatorField[] = JSON.parse(String(start.data.config['工作流输入字段'] ?? '[]'));
    const used = executionGraph.nodes.flatMap(node => Object.values(node.data.mappings).filter(binding => binding.sourceNodeId === start.id).map(binding => binding.sourceField));
    start.data.config['工作流输入字段'] = JSON.stringify([...fields, ...remaining.filter(field => used.includes(field.key))]);
  }
  const primaryKey = boundaries.length ? effectiveHandoff(graph, boundaries[0]).primaryKey : undefined;
  const value = primaryKey && sample ? trialValueAt(sample.values, primaryKey) : undefined;
  const snapshot: FrozenTrialHandoff | undefined = primaryKey && (typeof value === 'string' || typeof value === 'number') && !issues.length ? {
    primaryKey: { field: primaryKey, value }, rules: boundaries.map(boundary => ({ edgeId: boundary.edgeId, config: copy(effectiveHandoff(graph, boundary)) })), inputs: copy(inputs),
  } : undefined;
  return { graph: executionGraph, issues, snapshot, executionSample: sample ? { ...copy(sample), values: executionValues } : undefined };
}
