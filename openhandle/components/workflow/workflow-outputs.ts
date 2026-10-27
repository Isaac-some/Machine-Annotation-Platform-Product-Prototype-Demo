import type { OperatorField } from '@/app/lib/workflow';

type OutputNode = { id: string; operatorId: string; kind?: string; readOnly?: boolean; outputs: OperatorField[] };
type Link = { source: string; target: string };

/** Accumulate only ancestors of an end, in dependency order. Later producers
 * replace an earlier field with the same key, just as the runtime row does. */
export function workflowOutputNodes<T extends OutputNode>(nodes: T[], edges: Link[], endId?: string): T[] {
  const ends = endId ? [endId] : nodes.filter(node => node.kind === 'result').map(node => node.id);
  const ancestors = new Set<string>();
  const visit = (id: string) => edges.filter(edge => edge.target === id).forEach(edge => {
    if (!ancestors.has(edge.source)) { ancestors.add(edge.source); visit(edge.source); }
  });
  ends.forEach(visit);
  const pending = nodes.filter(node => !node.readOnly && (!ends.length || ancestors.has(node.id)));
  const ordered: T[] = [];
  while (pending.length) {
    const index = pending.findIndex(node => !edges.some(edge => edge.target === node.id && pending.some(source => source.id === edge.source)));
    if (index < 0) throw new Error('工作流存在循环，请先修复连线');
    ordered.push(pending.splice(index, 1)[0]);
  }
  return ordered.filter(node => node.operatorId !== 'control.start' && node.kind !== 'result');
}

export function workflowOutputFields(nodes: OutputNode[], edges: Link[], endId?: string): OperatorField[] {
  const fields = new Map<string, OperatorField>();
  workflowOutputNodes(nodes, edges, endId).forEach(node => node.outputs.forEach(field => fields.set(field.key, field)));
  return [...fields.values()];
}
