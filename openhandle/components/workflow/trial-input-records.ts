import { trialValueAt, type TrialSample } from './trial-run';

function recordObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) throw new Error('每条样本必须是包含字段的数据记录');
  return value as Record<string, unknown>;
}

/** CSV state machine: quoted commas, CRLF and embedded newlines stay in a cell. */
export function csvTrialRecords(content: string): Record<string, unknown>[] {
  const text = content.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const finishRow = () => { row.push(cell); if (row.some(value => value !== '')) rows.push(row); row = []; cell = ''; closed = false; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new Error('CSV 引号格式错误，请检查数据文件');
      quoted = true;
    } else if (char === ',') { row.push(cell); cell = ''; closed = false; }
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; finishRow(); }
    else { if (closed) throw new Error('CSV 结束引号后存在多余内容'); cell += char; }
  }
  if (quoted) throw new Error('CSV 引号未闭合');
  if (cell || row.length || closed) finishRow();
  const headers = rows.shift()?.map(header => header.trim()) ?? [];
  if (!headers.length || headers.some(header => !header) || new Set(headers).size !== headers.length) throw new Error('CSV 表头不能为空或重名');
  if (!rows.length) throw new Error('CSV 没有可选择的数据记录');
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV 第 ${index + 2} 条记录与表头列数不一致`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}

export function trialInputRecords(content: string, filename: string): Record<string, unknown>[] {
  if (/\.csv$/i.test(filename)) return csvTrialRecords(content);
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) throw new Error('数据文件没有可选择的记录');
  return lines.map((line, index) => {
    try { return recordObject(JSON.parse(line)); }
    catch { throw new Error(`JSONL 第 ${index + 1} 行不是有效的非空数据对象`); }
  });
}

export function trialRecordFields(values: Record<string, unknown>): string[] {
  const result: string[] = [];
  const walk = (value: Record<string, unknown>, prefix = '', depth = 0) => {
    for (const [key, item] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      result.push(path);
      if (item && typeof item === 'object' && !Array.isArray(item) && depth < 8) walk(item as Record<string, unknown>, path, depth + 1);
    }
  };
  walk(values);
  return [...new Set(result)];
}

export function selectTrialArrayItem(sample: TrialSample, field: string, index: number): TrialSample {
  const original = sample.selections?.originalArrays?.[field] ?? trialValueAt(sample.values, field);
  if (!Array.isArray(original) || !Number.isInteger(index) || index < 0 || index >= original.length) throw new Error('请选择有效的一项');
  const values = structuredClone(sample.values);
  if (Object.hasOwn(values, field)) values[field] = original[index];
  else {
    const parts = field.split('.');
    let target = values;
    for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
    target[parts[parts.length - 1]] = original[index];
  }
  return { ...sample, values, selections: { ...sample.selections, arrayItems: { ...sample.selections?.arrayItems, [field]: index }, originalArrays: { ...sample.selections?.originalArrays, [field]: structuredClone(original) } } };
}

export function restoreTrialArray(sample: TrialSample, field: string): TrialSample {
  const original = sample.selections?.originalArrays?.[field];
  if (!original) return sample;
  const values = structuredClone(sample.values);
  const parts = field.split('.');
  if (Object.hasOwn(values, field)) values[field] = structuredClone(original);
  else {
    let target = values;
    for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
    if (!target || !Object.hasOwn(target, parts.at(-1)!)) return sample;
    target[parts.at(-1)!] = structuredClone(original);
  }
  const arrayItems = { ...sample.selections?.arrayItems };
  delete arrayItems[field];
  return { ...sample, values, selections: { ...sample.selections, arrayItems } };
}
