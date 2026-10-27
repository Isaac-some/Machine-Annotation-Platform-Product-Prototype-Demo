import { describe, expect, it } from 'vitest';
import { workflowOutputFields, workflowOutputNodes } from './workflow-outputs';
import type { OperatorField } from '@/app/lib/workflow';

const field = (key: string, type = 'String'): OperatorField => ({ key, type, semanticType: 'field.generic', cardinality: 'one' });
const nodes = [
  { id: 'start', operatorId: 'control.start', kind: 'control', outputs: [field('vid')] },
  { id: 'first', operatorId: 'upload', kind: 'handler', outputs: [field('tos_path'), field('shared', 'String')] },
  { id: 'second', operatorId: 'ai', kind: 'handler', outputs: [field('gemini_output'), field('shared', 'Int')] },
  { id: 'end', operatorId: 'control.result', kind: 'result', outputs: [] },
  { id: 'orphan', operatorId: 'other', kind: 'handler', outputs: [field('not_connected')] },
];
const edges = [{ source: 'start', target: 'first' }, { source: 'first', target: 'second' }, { source: 'second', target: 'end' }];

describe('automatic workflow output boundary', () => {
  it('accumulates upstream fields in dependency order, excluding disconnected nodes and caller inputs', () => {
    expect(workflowOutputNodes([...nodes].reverse(), edges).map(node => node.id)).toEqual(['first', 'second']);
    expect(workflowOutputFields([...nodes].reverse(), edges)).toEqual([field('tos_path'), field('shared', 'Int'), field('gemini_output')]);
  });
  it('scopes multiple ends to their own ancestors and rejects an actual cycle', () => {
    const branch = { id: 'branch-end', operatorId: 'control.result', kind: 'result', outputs: [] };
    const graphEdges = [...edges, { source: 'start', target: 'orphan' }, { source: 'orphan', target: branch.id }];
    expect(workflowOutputFields([...nodes, branch], graphEdges, branch.id)).toEqual([field('not_connected')]);
    expect(() => workflowOutputFields(nodes, [...edges, { source: 'second', target: 'first' }])).toThrow('循环');
  });
});
