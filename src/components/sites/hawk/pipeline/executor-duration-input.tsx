'use client';

import { useState } from 'react';
import { InputNumber, Select, Space } from 'antd';

/** Canonical milliseconds survive unit changes without rounding the stored duration. */
export function ExecutorDurationInput({ value, onChange, disabled, id, 'aria-label': label = '累计运行时长上限' }: { value?: number; onChange?: (value: number | undefined) => void; disabled?: boolean; id?: string; 'aria-label'?: string }) {
  const [unit, setUnit] = useState<'hours' | 'days'>('hours');
  const factor = unit === 'days' ? 86400000 : 3600000;
  return <Space.Compact style={{ width: '100%' }}><InputNumber id={id} aria-label={label} disabled={disabled} min={unit === 'days' ? .0001 : .001} max={unit === 'days' ? 30 : 720} step={unit === 'days' ? .25 : 1} placeholder="留空不限制" value={value === undefined ? undefined : Number((value / factor).toFixed(4))} onChange={next => onChange?.(next === null ? undefined : Math.round(next * factor))} style={{ width: 'calc(100% - 80px)' }} /><Select aria-label={`${label}单位`} disabled={disabled} value={unit} onChange={setUnit} style={{ width: 80 }} options={[{ value: 'hours', label: '小时' }, { value: 'days', label: '天' }]} /></Space.Compact>;
}
