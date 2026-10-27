"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { restoreTrialArray, selectTrialArrayItem, trialRecordFields } from './trial-input-records';
import { trialValueAt, type TrialSample } from './trial-run';

type ManualField = { name: string; value: string; type: 'text' | 'number' | 'boolean' };
export function TrialManualInput({ fields, onChange, onNotice }: { fields: string[]; onChange: (sample: TrialSample) => void; onNotice: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ManualField[]>([]);
  const edit = (index: number, patch: Partial<ManualField>) => setRows(current => current.map((row, position) => position === index ? { ...row, ...patch } : row));
  const submit = () => {
    try {
      if (!rows.length || rows.some(row => !row.name.trim())) throw new Error('请填写字段名称');
      if (new Set(rows.map(row => row.name.trim())).size !== rows.length) throw new Error('字段名称不能重复');
      const values = Object.fromEntries(rows.map(row => {
        if (row.type === 'number' && (!row.value.trim() || !Number.isFinite(Number(row.value)))) throw new Error(`${row.name} 需要填写有效数字`);
        return [row.name.trim(), row.type === 'number' ? Number(row.value) : row.type === 'boolean' ? row.value === 'true' : row.value];
      }));
      onChange({ id: 'manual-' + crypto.randomUUID(), source: 'manual', name: '手动输入 · 单条样本', type: 'application/json', previewUrl: '', dataRecord: true, values });
      setOpen(false); onNotice('已准备一条样本，可开始校验和试跑');
    } catch (error) { onNotice(error instanceof Error ? error.message : '输入不可用'); }
  };
  return <div className="p2-manual-input"><Button variant="outline" onClick={() => { if (!open) setRows((fields.length ? [...new Set(fields)] : ['tos_path']).map(name => ({ name, value: '', type: 'text' }))); setOpen(!open); }}>手动填写一条数据</Button>{open && <div role="region" aria-label="手动试跑输入"><p className="p2-field-help">没有 CSV 时，可直接补充一条主键和本组需要的字段。</p>{rows.map((row, index) => <div className="p2-manual-row" key={index}><Input aria-label={`输入字段名称 ${index + 1}`} value={row.name} placeholder="字段名称" onChange={event => edit(index, { name: event.target.value })} /><select aria-label={`输入字段类型 ${index + 1}`} value={row.type} onChange={event => edit(index, { type: event.target.value as ManualField['type'], value: event.target.value === 'boolean' ? 'true' : row.value })}><option value="text">文本</option><option value="number">数字</option><option value="boolean">布尔值</option></select>{row.type === 'boolean' ? <select aria-label={`输入字段值 ${index + 1}`} value={row.value || 'true'} onChange={event => edit(index, { value: event.target.value })}><option value="true">是</option><option value="false">否</option></select> : <Input aria-label={`输入字段值 ${index + 1}`} value={row.value} placeholder="本条数据的实际值" onChange={event => edit(index, { value: event.target.value })} />}<button type="button" aria-label={`删除输入字段 ${index + 1}`} onClick={() => setRows(current => current.filter((_, position) => position !== index))}>删除</button></div>)}<div className="p2-record-actions"><Button variant="outline" onClick={() => setRows(current => [...current, { name: '', value: '', type: 'text' }])}>添加字段</Button><Button onClick={submit}>使用这条数据</Button></div></div>}</div>;
}

export function TrialArraySelection({ sample, onChange }: { sample: TrialSample; onChange: (sample: TrialSample) => void }) {
  const choices = new Map<string, unknown[]>(Object.entries(sample.selections?.originalArrays ?? {}));
  trialRecordFields(sample.values).forEach(field => { const value = trialValueAt(sample.values, field); if (Array.isArray(value)) choices.set(field, value); });
  if (!choices.size) return null;
  return <section className="p2-array-selection" aria-label="选择本轮切片"><h3>多值字段</h3><p className="p2-field-help">下游需要单个切片或单值主键时，明确选择一项；下游接收列表时可保留多值。</p>{[...choices].map(([field, values]) => <label key={field}>{field}<select aria-label={`选择 ${field} 的一项`} value={sample.selections?.arrayItems?.[field] ?? ''} onChange={event => { if (event.target.value === '') onChange(restoreTrialArray(sample, field)); else onChange(selectTrialArrayItem(sample, field, Number(event.target.value))); }}><option value="">保留多值 · 共 {values.length} 项</option>{values.map((value, index) => <option key={index} value={index}>{index + 1}. {typeof value === 'string' ? value : JSON.stringify(value)}</option>)}</select></label>)}</section>;
}
