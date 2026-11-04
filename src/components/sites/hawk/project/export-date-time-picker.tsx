'use client';

import { useState } from 'react';
import { Button, Calendar, Input, Popover } from 'antd';
import { CalendarOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { beijingTime } from '../data/delivery';
import './export-date-time-picker.css';

// Adapted from Calendar20: source and measured states are recorded in the cloner project.
const slots = Array.from({ length: 37 }, (_, index) => {
  const minutes = 9 * 60 + index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});
const displayDate = (value: number) => dayjs(beijingTime(value)).millisecond(value % 1000);

export function ExportDateTimePicker({ value, onChange, label, placeholder, disabled = false }: { value: number | null; onChange: (value: number | null) => void; label: string; placeholder: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Dayjs | null>(null);
  const [month, setMonth] = useState<Dayjs | null>(null);
  const [time, setTime] = useState('09:00:00');
  const changeOpen = (next: boolean) => {
    if (disabled && next) return;
    if (next) {
      const date = displayDate(value ?? Date.now());
      setDraft(date); setMonth(date); setTime(value === null ? '09:00:00' : date.format('HH:mm:ss'));
    }
    setOpen(next);
  };
  const validTime = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time);
  const content = <div className="hawk-export-calendar" role="dialog" aria-label={`${label}选择器`}>
    <div className="hawk-export-calendar-main">
      <div className="hawk-export-calendar-days"><Calendar fullscreen={false} value={month ?? undefined} fullCellRender={date => <div className={`ant-picker-cell-inner${draft?.isSame(date, 'day') ? ' is-chosen' : ''}`}>{date.date()}</div>} onSelect={(date, info) => { if (info.source === 'date') setDraft(date); setMonth(date); }} headerRender={({ value: visible, onChange: changeMonth }) => <div className="hawk-export-calendar-nav">
        <Button aria-label="上个月" type="text" icon={<LeftOutlined />} onClick={() => changeMonth(visible.subtract(1, 'month'))} />
        <strong>{visible.format('YYYY 年 M 月')}</strong>
        <Button aria-label="下个月" type="text" icon={<RightOutlined />} onClick={() => changeMonth(visible.add(1, 'month'))} />
      </div>} onPanelChange={date => setMonth(date)} /></div>
      <div className="hawk-export-calendar-presets" aria-label="时间预设">{slots.map(slot => <Button key={slot} aria-pressed={time === `${slot}:00`} type={time === `${slot}:00` ? 'primary' : 'default'} onClick={() => setTime(`${slot}:00`)}>{slot}</Button>)}</div>
    </div>
    <div className="hawk-export-calendar-footer">
      <div><span>{draft?.format('YYYY-MM-DD')} · 北京时间</span><label>具体时间<Input aria-label="具体时间（时分秒）" type="time" step={1} value={time} onChange={event => setTime(event.target.value)} /></label></div>
      <div className="hawk-export-calendar-footer-actions"><Button onClick={() => { onChange(null); setOpen(false); }}>清空</Button><Button type="primary" disabled={!draft || !validTime} onClick={() => { onChange(Date.parse(`${draft!.format('YYYY-MM-DD')}T${time.length === 5 ? `${time}:00` : time}+08:00`)); setOpen(false); }}>确认时间</Button></div>
    </div>
  </div>;
  return <Popover open={open && !disabled} onOpenChange={changeOpen} content={content} trigger="click" placement="bottomLeft" arrow={false} classNames={{ root: 'hawk-export-calendar-popover' }} autoAdjustOverflow>
    <Button className={`hawk-export-date-trigger${value === null ? ' is-empty' : ''}`} aria-label={label} aria-expanded={open && !disabled} disabled={disabled} icon={<CalendarOutlined />}>{value === null ? placeholder : beijingTime(value)}</Button>
  </Popover>;
}
