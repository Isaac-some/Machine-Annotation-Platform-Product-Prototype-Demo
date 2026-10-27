import { describe, expect, it } from 'vitest';
import { createNode, getOperator } from '@/app/lib/workflow';
import { declaredOutputs, extractSegment, publicationSegments } from './local-publish-model';

describe('local publication boundaries', () => {
  it('derives actual TOS boundaries with arbitrary IDs and dependency order for repeated splits', () => {
    const first = createNode(getOperator('demo.tos.list')!, 'actual-directory', { x: 0, y: 0 });
    const next = createNode(getOperator('demo.tos.list')!, 'another-directory', { x: 100, y: 0 });
    const ai = createNode(getOperator('demo.ai-platform.gemini')!, 'actual-ai', { x: 200, y: 0 });
    const graph = { nodes: [ai, next, first], edges: [{ id: 'a', source: first.id, target: next.id }, { id: 'b', source: next.id, target: ai.id }] };
    expect(publicationSegments(graph)?.map(part => part.nodeIds)).toEqual([[first.id], [next.id], [ai.id]]);
    expect(extractSegment(graph, [ai.id, next.id, first.id]).nodes.map(node => node.id)).toEqual(['segment-start', first.id, next.id, ai.id, 'segment-end']);
    expect(publicationSegments({ nodes: [ai], edges: [] })).toBeUndefined();
    expect(() => publicationSegments({ ...graph, edges: [...graph.edges, { id: 'cycle', source: ai.id, target: first.id }] })).toThrow('循环');
  });
  it('rebases cross-boundary bindings while retaining internal graph relationships', () => {
    const list = createNode(getOperator('demo.tos.list')!, 'directory', { x: 0, y: 0 });
    const ai = createNode(getOperator('demo.ai-platform.gemini')!, 'label', { x: 180, y: 0 });
    ai.data.mappings.tos_path = { sourceType: 'upstream', sourceNodeId: list.id, sourceField: 'tos_path' };
    const graph = { nodes: [list, ai], edges: [{ id: 'original-edge', source: list.id, target: ai.id }] };
    const segment = extractSegment(graph, [ai.id]);
    expect(segment.nodes.find(node => node.id === ai.id)?.data.mappings.tos_path).toEqual({ sourceType: 'upstream', sourceNodeId: 'segment-start', sourceField: 'tos_path' });
    expect(JSON.parse(String(segment.nodes[0].data.config['工作流输入字段']))[0].key).toBe('tos_path');
    expect(segment.edges.map(edge => [edge.source, edge.target])).toEqual([['segment-start', 'label'], ['label', 'segment-end']]);
    expect(ai.data.mappings.tos_path.sourceNodeId).toBe('directory');
    expect(declaredOutputs(segment)).toContain('gemini_output');
    expect(declaredOutputs(extractSegment(graph, [list.id, ai.id]))).toEqual(['tos_path', 'gemini_output']);
  });
  it('keeps internal edge IDs and rejects an empty segment', () => {
    const first = createNode(getOperator('demo.vod.upload.tos')!, 'first', { x: 0, y: 0 });
    const second = createNode(getOperator('demo.ai-platform.gemini')!, 'second', { x: 180, y: 0 });
    const graph = { nodes: [first, second], edges: [{ id: 'same-edge', source: first.id, target: second.id }] };
    expect(extractSegment(graph, ['first', 'second']).edges.some(edge => edge.id === 'same-edge')).toBe(true);
    expect(() => extractSegment(graph, [])).toThrow('拆分段不能为空');
  });
});

import { trialSegment } from './local-publish-model';
it('partial draft trial excludes fanout and other groups, without mutating the draft', () => {
  const list = createNode(getOperator('demo.tos.list')!, 'directory', { x: 0, y: 0 });
  const ai = createNode(getOperator('demo.ai-platform.gemini')!, 'ai', { x: 180, y: 0 });
  ai.data.mappings.tos_path = { sourceType: 'upstream', sourceNodeId: 'directory', sourceField: 'tos_path' };
  const graph = { nodes: [list, ai], edges: [{ id: 'edge', source: 'directory', target: 'ai' }] };
  const before = JSON.stringify(graph);
  expect(() => trialSegment(graph, 0)).toThrow('只有拆分算子');
  const partial = trialSegment(graph, 1);
  expect(partial.nodes.map(node => node.id)).toEqual(['segment-start', 'ai', 'segment-end']);
  expect(partial.nodes[1].data.mappings.tos_path.sourceNodeId).toBe('segment-start');
  expect(JSON.stringify(graph)).toBe(before);
  expect(() => trialSegment(graph, 9)).toThrow('有效');
});
it('all registered fanout operators trigger the same publication and trial boundary rule', () => {
  const split = createNode(getOperator('demo.csv.expand')!, 'split', { x: 0, y: 0 });
  const ai = createNode(getOperator('demo.ai-platform.gemini')!, 'ai', { x: 180, y: 0 });
  expect(publicationSegments({ nodes: [split, ai], edges: [{ id: 'edge', source: 'split', target: 'ai' }] })?.length).toBe(2);
  expect(publicationSegments({ nodes: [split], edges: [] })?.length).toBe(1);
});
