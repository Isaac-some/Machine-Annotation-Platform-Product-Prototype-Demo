import { getOperator, type FieldMapping, type OperatorField, type WorkflowNodeData } from '@/app/lib/workflow';
import type { Edge, Node } from '@xyflow/react';
import { workflowOutputFields } from './workflow-outputs';

export type LocalGraph = { nodes: Node<WorkflowNodeData>[]; edges: Edge[]; revision?: number };
export const isSplitOperator = (node: Node<WorkflowNodeData>) => getOperator(node.data.operatorId)?.behavior === 'fanout';

function orderedGraphNodes(graph: LocalGraph) {
  const remaining = [...graph.nodes];
  const ordered: typeof remaining = [];
  while (remaining.length) {
    const index = remaining.findIndex(node => !graph.edges.some(edge => edge.target === node.id && remaining.some(source => source.id === edge.source)));
    if (index < 0) throw new Error('工作流存在循环，请先修复连线');
    ordered.push(remaining.splice(index, 1)[0]);
  }
  return ordered;
}

/** Use real graph boundaries and dependency order, never demonstration node IDs. */
export function publicationSegments(graph: LocalGraph): { nodeIds: string[]; labels: string[] }[] | undefined {
  const ordered = orderedGraphNodes(graph);
  const levels = new Map<string, number>();
  const groups = new Map<number, typeof ordered>();
  for (const node of ordered) {
    const level = Math.max(0, ...graph.edges.filter(edge => edge.target === node.id).map(edge => (levels.get(edge.source) ?? 0) + (graph.nodes.some(source => source.id === edge.source && isSplitOperator(source)) ? 1 : 0)));
    levels.set(node.id, level);
    if (node.data.operatorId === 'control.start' || node.data.kind === 'result' || node.data.readOnly) continue;
    groups.set(level, [...(groups.get(level) ?? []), node]);
  }
  return ordered.some(isSplitOperator) && groups.size > 0 ? [...groups].sort(([left], [right]) => left - right).map(([, nodes]) => ({ nodeIds: nodes.map(node => node.id), labels: nodes.map(node => node.data.label) })) : undefined;
}

/** A draft trial executes exactly one group, with fanout and all other groups excluded. */
export function trialSegment(graph: LocalGraph, index: number): LocalGraph {
  const group = publicationSegments(graph)?.[index];
  if (!group) throw new Error('请选择有效的试跑分组');
  const ids = group.nodeIds.filter(id => graph.nodes.some(node => node.id === id && !isSplitOperator(node)));
  if (!ids.length) throw new Error('本组只有拆分算子，不能执行草稿试跑');
  return extractSegment(graph, ids);
}

/** Split only at a confirmed boundary; preserve internal edges and rebase external inputs. */
export function extractSegment(graph: LocalGraph, nodeIds: string[]): LocalGraph {
  const ids = new Set(nodeIds);
  const business = orderedGraphNodes(graph).filter(node => ids.has(node.id));
  if (!business.length) throw new Error('拆分段不能为空');
  const inputs: OperatorField[] = [];
  const startId = 'segment-start';
  const endId = 'segment-end';
  const nodes = business.map((node, row) => {
    const mappings: Record<string, FieldMapping> = {};
    Object.entries(node.data.mappings).forEach(([key, binding]) => {
      if (binding.sourceType === 'upstream' && !ids.has(binding.sourceNodeId ?? '')) {
        const field = getOperator(node.data.operatorId)?.inputs.find(field => field.key === key);
        if (field && !inputs.some(item => item.key === key)) inputs.push(field);
        mappings[key] = { sourceType: 'upstream', sourceNodeId: startId, sourceField: key };
      } else mappings[key] = binding;
    });
    return { ...node, position: { x: (row + 1) * 180, y: 180 }, data: { ...node.data, mappings, runState: 'idle' as const } };
  });
  const terminal = (id: string, operatorId: string, x: number, label: string): Node<WorkflowNodeData> => ({ id, type: 'phase2', position: { x, y: 180 }, data: { operatorId, label, kind: operatorId === 'control.start' ? 'control' : 'result', config: operatorId === 'control.start' ? { 工作流输入字段: JSON.stringify(inputs) } : {}, mappings: {}, validationCount: 0 } });
  const internal = graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
  const edge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target, type: 'phase2' });
  return { nodes: [terminal(startId, 'control.start', 20, '开始'), ...nodes, terminal(endId, 'control.result', (nodes.length + 1) * 180, '结束')], edges: [...internal, ...nodes.filter(node => !internal.some(edge => edge.target === node.id)).map(node => edge(startId, node.id)), ...nodes.filter(node => !internal.some(edge => edge.source === node.id)).map(node => edge(node.id, endId))], revision: 1 };
}

export function declaredOutputs(graph: LocalGraph): string[] {
  return workflowOutputFields(graph.nodes.map(node => ({ id: node.id, ...node.data, outputs: getOperator(node.data.operatorId)?.outputs ?? [] })), graph.edges).map(field => field.key);
}
