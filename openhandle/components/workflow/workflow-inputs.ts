import { fieldsExactlyMatch, type FieldMapping, type OperatorField } from "../../app/lib/workflow";

export type InputRequirement = { nodeId: string; field: OperatorField; binding?: FieldMapping; suppliedUpstream: boolean };

// Only genuinely unsupplied inputs become workflow inputs. Broken explicit
// bindings remain errors; deriving the boundary must never silently repair them.
export function deriveWorkflowInputs(requirements: InputRequirement[], existing: OperatorField[], startId: string) {
  const fields: OperatorField[] = [];
  const bindings: { nodeId: string; key: string }[] = [];
  const conflicts: string[] = [];
  for (const { nodeId, field, binding, suppliedUpstream } of requirements) {
    if (field.system) continue;
    if (binding && binding.sourceType !== "parameter") {
      if (binding.sourceType === "upstream" && binding.sourceNodeId === startId) {
        const previous = existing.find((item) => item.key === binding.sourceField);
        if (previous && !fields.some((item) => item.key === previous.key)) fields.push(previous);
      }
      continue;
    }
    if (!field.required && binding?.sourceType !== "parameter") continue;
    if (suppliedUpstream && binding?.sourceType !== "parameter") continue;
    const sameName = fields.find((item) => item.key === field.key);
    if (sameName && !fieldsExactlyMatch(sameName, field)) { conflicts.push(field.key); continue; }
    if (!sameName) fields.push(field);
    bindings.push({ nodeId, key: field.key });
  }
  return { fields, bindings: bindings.filter((item) => !conflicts.includes(item.key)), conflicts: [...new Set(conflicts)] };
}

export type BoundaryNode = { id: string; inputs: OperatorField[]; outputs: OperatorField[]; mappings: Record<string, FieldMapping> };

/** Resolve a connected graph backwards: the closest producer wins; only missing
 * boundary fields are requested from the caller. Explicit non-start bindings
 * remain authoritative, including invalid ones that validation must report. */
export function inferGraphInputs(nodes: BoundaryNode[], edges: { source: string; target: string }[], startId: string, existing: OperatorField[]) {
  const automatic: { nodeId: string; key: string; sourceNodeId: string; sourceField: string }[] = [];
  const requirements: InputRequirement[] = [];
  const ambiguous: string[] = [];
  for (const node of nodes.filter(node => node.id !== startId)) {
    const distance = new Map<string, number>();
    const queue = [{ id: node.id, depth: 0 }];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      for (const edge of edges.filter(edge => edge.target === current.id)) {
        if (distance.has(edge.source)) continue;
        distance.set(edge.source, current.depth + 1);
        queue.push({ id: edge.source, depth: current.depth + 1 });
      }
    }
    for (const field of node.inputs) {
      const saved = node.mappings[field.key];
      const isStartBinding = saved?.sourceType === 'upstream' && saved.sourceNodeId === startId;
      if (saved && saved.sourceType !== 'parameter' && !isStartBinding) {
        requirements.push({ nodeId: node.id, field, binding: saved, suppliedUpstream: false });
        continue;
      }
      const candidates = nodes.filter(source => source.id !== startId && distance.has(source.id))
        .flatMap(source => source.outputs.filter(output => fieldsExactlyMatch(output, field)).map(output => ({ source, output, distance: distance.get(source.id)! })))
        .sort((left, right) => left.distance - right.distance);
      const nearest = candidates.filter(candidate => candidate.distance === candidates[0]?.distance);
      if (nearest.length === 1) automatic.push({ nodeId: node.id, key: field.key, sourceNodeId: nearest[0].source.id, sourceField: nearest[0].output.key });
      if (nearest.length > 1) ambiguous.push(`${node.id}:${field.key}`);
      requirements.push({ nodeId: node.id, field, binding: nearest.length ? undefined : isStartBinding && existing.some(item => item.key === saved.sourceField) ? saved : undefined, suppliedUpstream: nearest.length > 0 });
    }
  }
  const derived = deriveWorkflowInputs(requirements, existing, startId);
  return { ...derived, ambiguous, mappings: [...automatic, ...derived.bindings.map(binding => ({ ...binding, sourceNodeId: startId, sourceField: binding.key }))] };
}

export function singleTrialInput(value: string): string {
  const rows = value.trim().split(/\r?\n/).filter((row) => row.trim());
  if (rows.length !== 1) throw new Error("试跑仅支持一条数据，请只保留一条输入");
  return rows[0].trim();
}
