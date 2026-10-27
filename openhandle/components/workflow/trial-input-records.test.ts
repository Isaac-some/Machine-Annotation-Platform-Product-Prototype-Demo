import { describe, expect, it } from 'vitest';
import { csvTrialRecords, restoreTrialArray, selectTrialArrayItem, trialInputRecords, trialRecordFields } from './trial-input-records';
import type { TrialSample } from './trial-run';

describe('single-record trial input preparation', () => {
  it('reads CSV headers, BOM, quoted commas/newlines and escaped quotes', () => {
    expect(csvTrialRecords('\uFEFFrowkey,tos_path,note\r\n001,"tos://a,b.mp4","line1\nline2 ""quoted"""\r\n002,tos://b.mp4,ok\r\n')).toEqual([
      { rowkey: '001', tos_path: 'tos://a,b.mp4', note: 'line1\nline2 "quoted"' },
      { rowkey: '002', tos_path: 'tos://b.mp4', note: 'ok' },
    ]);
  });
  it('refuses malformed files instead of inventing record fields', () => {
    for (const content of ['a,a\n1,2', 'a,b\n1', 'a\n"unclosed', 'a\n"x"junk', 'a\n']) expect(() => csvTrialRecords(content)).toThrow();
    expect(() => trialInputRecords('[]', 'data.jsonl')).toThrow('有效');
    expect(() => trialInputRecords('{broken}', 'data.jsonl')).toThrow('有效');
  });
  it('retains multiple JSONL candidates for explicit record selection', () => {
    expect(trialInputRecords('{"rowkey":"a"}\n{"rowkey":"b"}', 'input.jsonl')).toEqual([{ rowkey: 'a' }, { rowkey: 'b' }]);
  });
  it('explicitly selects an array item without changing the original and allows reselection', () => {
    const sample: TrialSample = { id: 'cid', source: 'cid', name: '切片', type: 'application/json', previewUrl: '', values: { rowkey: 'parent', clips: ['one', 'two'] } };
    const selected = selectTrialArrayItem(sample, 'clips', 1);
    expect(selected.values).toEqual({ rowkey: 'parent', clips: 'two' });
    expect(sample.values.clips).toEqual(['one', 'two']);
    expect(selected.selections?.arrayItems).toEqual({ clips: 1 });
    expect(selectTrialArrayItem(selected, 'clips', 0).values.clips).toBe('one');
    expect(restoreTrialArray(selected, 'clips').values.clips).toEqual(['one', 'two']);
    expect(restoreTrialArray(selected, 'clips').selections?.arrayItems).toEqual({});
    expect(() => selectTrialArrayItem(sample, 'clips', 5)).toThrow();
    expect(trialRecordFields({ nested: { path: 'a' }, 'flat.key': 1 })).toEqual(['nested', 'nested.path', 'flat.key']);
    expect(trialRecordFields({ nested: { path: ['a'] }, 'nested.path': ['b'] })).toEqual(['nested', 'nested.path']);
  });
});
