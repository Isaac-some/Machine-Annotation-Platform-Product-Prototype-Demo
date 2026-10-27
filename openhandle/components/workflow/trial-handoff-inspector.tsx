"use client";

import { GitBranch, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LocalGraph } from './local-publish-model';
import { handoffOutputFields, type TrialBoundary, type TrialHandoffConfig } from './trial-handoff';

export function TrialHandoffInspector({ graph, boundary, config, dirty, running, onChange, onSave, onClear, onClose, onFindRowkey }: {
  graph: LocalGraph; boundary: TrialBoundary; config: TrialHandoffConfig; dirty: boolean; running?: boolean;
  onChange: (config: TrialHandoffConfig) => void; onSave: () => void; onClear: () => void; onClose: () => void; onFindRowkey: () => void;
}) {
  const fields = handoffOutputFields(graph, boundary.sourceNodeId).filter(field => ['string', 'file', 'url', 'int', 'integer', 'float', 'number', 'double'].includes(field.type.toLowerCase()));
  const valid = fields.some(field => field.key === config.primaryKey);
  return <aside className="p2-inspector p2-handoff-inspector" aria-label="试跑输入接续配置" inert={running}>
    <header><div><strong><GitBranch size={16} />输入接续</strong><small>{boundary.orphan ? '原边界已变化' : `第 ${boundary.groupIndex + 1} 组`}</small></div><button type="button" aria-label="关闭输入接续配置" onClick={onClose}><X size={18} /></button></header>
    <div className="p2-inspector-scroll">
      <p className="p2-handoff-purpose">接续后，后续节点使用所选主键定位每条数据。</p>
      <p className="p2-field-help">默认沿用 rowkey；上游产出变化时，可在这里调整主键。</p>
      <section><h3>主键接续</h3><label htmlFor="handoff-primary-key">接续后的主键</label>
        <select id="handoff-primary-key" aria-label="本组主键字段" value={valid ? config.primaryKey : ''} onChange={event => onChange({ ...config, sourceNodeId: boundary.sourceNodeId, targetNodeId: boundary.targetNodeId, primaryKey: event.target.value })}>
          <option value="" disabled>选择上游产出字段</option>
          {fields.map(field => <option key={field.key} value={field.key}>{field.key}</option>)}
        </select>
        {!fields.length && <p className="p2-field-help">上游暂无可用的主键字段。</p>}
        {!boundary.orphan && !fields.some(field => field.key === 'rowkey') && <><p className="p2-field-help">上游未产出 rowkey。如需生成，请从节点库添加“生成 rowkey”节点。</p><Button variant="outline" disabled={dirty} onClick={onFindRowkey}>查找生成 rowkey 节点</Button></>}
        {!valid && config.primaryKey && <p className="p2-error">原主键 {config.primaryKey} 已不在上游产出中，请重新选择。</p>}
        {boundary.orphan && <p className="p2-error">边界已变化，请清除旧配置。</p>}
      </section>
    </div>
    <footer><span>{dirty ? '有未保存配置' : '配置已同步画布'}</span><Button variant="outline" onClick={onClear}>{boundary.orphan ? '清除配置' : '恢复默认'}</Button><Button disabled={!dirty || !valid || boundary.orphan} onClick={onSave}>保存配置</Button></footer>
  </aside>;
}
