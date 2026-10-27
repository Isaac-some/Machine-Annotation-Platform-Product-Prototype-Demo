import { expect, it } from 'vitest';
import { trialResource, trialCidSample, trialFileRecord } from './trial-resource';
const run = { id: 'trial-a', sequence: 1, phase: 'passed', nodes: [{ id: 'end', data: { kind: 'result' } }], records: { end: { nodeId: 'end', status: 'succeeded' as const, inputs: {}, config: {}, outputs: { tos_path: 'tos://demo/output.png', label: 'sample' } } } };
it('exports the completed group output as JSONL and resolves its CID as detached next-group input', () => {
  const resource = trialResource(run)!;
  expect(JSON.parse(resource.content)).toEqual(run.records.end.outputs);
  const sample = trialCidSample(resource.cid, [resource]);
  expect(sample.values).toEqual(run.records.end.outputs);
  sample.values.label = 'changed';
  expect(resource.values.label).toBe('sample');
  expect(sample.resource?.sourceRunId).toBe('trial-a');
  expect(sample.values.vid).toBeUndefined();
});
it('does not present failed, running, empty or nonexistent outputs as usable resources', () => {
  expect(trialResource({ ...run, phase: 'running' })).toBeUndefined();
  expect(trialResource({ ...run, phase: 'failed' })).toBeUndefined();
  expect(trialResource({ ...run, records: {} })).toBeUndefined();
  expect(() => trialCidSample('CID://missing', [])).toThrow('没有找到');
});
it('a downloaded output can be uploaded as one actual data record for the next group', () => {
  expect(trialFileRecord(trialResource(run)!.content)).toEqual(run.records.end.outputs);
  for (const invalid of ['', '{}', '[]', 'invalid', '{"a":1}\n{"a":2}']) expect(() => trialFileRecord(invalid)).toThrow();
});
