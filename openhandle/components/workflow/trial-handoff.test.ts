import { describe, expect, it } from 'vitest';
import { createNode, getOperator } from '@/app/lib/workflow';
import { boundaryIssues, compileTrialHandoff, emptyHandoff, handoffConfig, handoffOutputFields, trialBoundaries, trialValueFits } from './trial-handoff';
import type { LocalGraph } from './local-publish-model';
import type { TrialSample } from './trial-run';
function fixture(configured = true): LocalGraph {
  const source = createNode(getOperator('demo.vod.split')!, 'split', { x: 0, y: 0 });
  const target = createNode(getOperator('demo.ai-platform.gemini')!, 'ai', { x: 200, y: 0 });
  target.data.mappings.tos_path = { sourceType: 'upstream', sourceNodeId: source.id, sourceField: 'split_segment_tos_paths' };
  const graph: LocalGraph = { nodes: [source, target], edges: [{ id: 'boundary', source: source.id, target: target.id, data: {} }] };
  if (configured) graph.edges[0].data!.trialHandoff = { ...emptyHandoff(trialBoundaries(graph)[0]), primaryKey: 'split_segment_tos_paths' };
  return graph;
}
const sample: TrialSample = { id: 'clip', source: 'manual', name: 'clip', type: 'application/json', previewUrl: '', values: { rowkey: 'parent-video', split_segment_tos_paths: 'tos://clips/02.mp4' } };
describe('primary key handoff', () => {
  it('defaults to rowkey only when it belongs to the actual upstream contract', () => {
    const graph = fixture(false), boundary = trialBoundaries(graph)[0];
    expect(emptyHandoff(boundary, graph).primaryKey).toBe('');
    graph.nodes[0].data.operatorId = 'control.rowkey';
    expect(emptyHandoff(boundary, graph).primaryKey).toBe('rowkey');
    expect(handoffOutputFields(graph, 'split').map(field => field.key)).toEqual(['rowkey', 'tos_path']);
  });
  it('detects missing keys without mutating old drafts', () => {
    const graph = fixture(false), before = JSON.stringify(graph), boundary = trialBoundaries(graph)[0];
    expect(boundary.groupIndex).toBe(1);
    expect(boundaryIssues(graph, boundary)[0].primaryKey).toBe(true);
    expect(JSON.stringify(graph)).toBe(before);
  });
  it('limits TOS list to actual outputs and never inherits the parent identity', () => {
    const graph = fixture(); graph.nodes[0].data.operatorId = 'demo.tos.list'; graph.nodes[1].data.mappings.tos_path.sourceField = 'tos_path';
    expect(handoffOutputFields(graph, 'split').map(field => field.key)).toEqual(['tos_path']);
    const config = { ...emptyHandoff(trialBoundaries(graph)[0]), primaryKey: 'rowkey' }; graph.edges[0].data!.trialHandoff = config;
    expect(compileTrialHandoff(graph, 1, sample).issues.some(issue => issue.primaryKey)).toBe(true);
    config.primaryKey = 'tos_path';
    const result = compileTrialHandoff(graph, 1, { ...sample, values: { rowkey: 'parent', tos_path: 'tos://child.mp4' } });
    expect(result.issues).toEqual([]); expect(result.snapshot?.primaryKey.value).toBe('tos://child.mp4');
  });
  it('derives execution inputs from node references and freezes detached values', () => {
    const graph = fixture(), before = JSON.stringify(graph), result = compileTrialHandoff(graph, 1, sample);
    expect(result.issues).toEqual([]);
    expect(result.snapshot?.primaryKey.value).toBe('tos://clips/02.mp4');
    expect(result.graph.nodes.map(node => node.id)).toEqual(['segment-start', 'ai', 'segment-end']);
    const binding = result.graph.nodes[1].data.mappings.tos_path;
    expect(result.executionSample?.values[binding.sourceField!]).toBe(sample.values.split_segment_tos_paths);
    expect(JSON.stringify(graph)).toBe(before);
    graph.edges[0].data!.trialHandoff = {};
    expect(result.snapshot?.rules[0].config.primaryKey).toBe('split_segment_tos_paths');
    expect(result.snapshot?.inputs[0].sourceField).toBe('split_segment_tos_paths');
  });
  it('checks nonempty scalar keys and actual CID input types', () => {
    for (const value of [undefined, '', ['a', 'b'], 7]) {
      expect(compileTrialHandoff(fixture(), 1, { ...sample, source: 'cid', values: { split_segment_tos_paths: value } }).issues.length).toBeGreaterThan(0);
    }
    expect(trialValueFits('1', { key: 'count', type: 'Int', semanticType: 'field.generic', cardinality: 'one' })).toBe(false);
  });
  it('keeps invalid business sources visible independently of the key', () => {
    const graph = fixture(); graph.nodes[1].data.mappings.tos_path.sourceNodeId = 'deleted-node';
    expect(trialBoundaries(graph)[0].requirements).toHaveLength(1);
    expect(compileTrialHandoff(graph, 1, sample).issues.some(issue => issue.message.includes('失效'))).toBe(true);
    graph.edges[0].data!.trialHandoff = { ...emptyHandoff(trialBoundaries(graph)[0]), primaryKey: 'split_segment_tos_paths', sourceNodeId: 'old' };
    expect(compileTrialHandoff(graph, 1, sample).issues.some(issue => issue.message.includes('端点'))).toBe(true);
  });
  it('retains obsolete rules as actionable markers after rewiring', () => {
    const graph = fixture(); graph.nodes[0].data.operatorId = 'demo.vod.upload.tos';
    expect(trialBoundaries(graph)[0].orphan).toBe(true);
    expect(boundaryIssues(graph, trialBoundaries(graph)[0]).length).toBeGreaterThan(0);
  });
  it('does not reuse obsolete external field mappings from the earlier prototype', () => {
    const graph = fixture(); handoffConfig(graph, 'boundary')!.bindings = [{ targetNodeId: 'ai', targetField: 'tos_path', sourceField: 'fake' }];
    const result = compileTrialHandoff(graph, 1, { ...sample, values: { ...sample.values, fake: 'wrong' } });
    expect(result.issues).toEqual([]); expect(result.snapshot?.inputs[0].value).toBe('tos://clips/02.mp4');
  });
  it('rejects conflicting primary keys at multiple group entrances', () => {
    const graph = fixture(), target = createNode(getOperator('demo.ai-platform.gemini')!, 'ai-2', { x: 200, y: 200 });
    target.data.mappings.tos_path = { ...graph.nodes[1].data.mappings.tos_path }; graph.nodes.push(target); graph.edges.push({ id: 'other', source: 'split', target: target.id });
    const boundary = trialBoundaries(graph).find(item => item.edgeId === 'other')!;
    graph.edges[1].data = { trialHandoff: { ...emptyHandoff(boundary), primaryKey: 'split_segment_count' } };
    expect(compileTrialHandoff(graph, 1, sample).issues.some(issue => issue.message.includes('不同主键'))).toBe(true);
  });
  it('keeps identically named outputs from different producers distinct', () => {
    const graph = fixture();
    const other = fixture();
    other.nodes[0].id = 'other-split'; other.nodes[1].id = 'other-ai';
    other.nodes[1].data.mappings.tos_path.sourceNodeId = 'other-split';
    other.edges[0] = { id: 'other-boundary', source: 'other-split', target: 'other-ai', data: { trialHandoff: { sourceNodeId: 'other-split', targetNodeId: 'other-ai', primaryKey: 'split_segment_tos_paths', bindings: [] } } };
    graph.nodes.push(...other.nodes); graph.edges.push(...other.edges);
    const input = { ...sample, values: { ...sample.values, 'split.split_segment_tos_paths': 'tos://left.mp4', 'other-split.split_segment_tos_paths': 'tos://right.mp4' } };
    const result = compileTrialHandoff(graph, 1, input);
    expect(result.issues).toEqual([]);
    const value = (id: string) => result.executionSample!.values[result.graph.nodes.find(node => node.id === id)!.data.mappings.tos_path.sourceField!];
    expect(value('ai')).toBe('tos://left.mp4'); expect(value('other-ai')).toBe('tos://right.mp4');
    expect(compileTrialHandoff(graph, 1, sample).issues.some(issue => issue.message.includes('other-split.split_segment_tos_paths'))).toBe(true);
  });
});
