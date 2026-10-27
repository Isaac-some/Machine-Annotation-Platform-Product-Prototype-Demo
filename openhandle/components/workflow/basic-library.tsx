import { useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { Capability } from './capability-search';
import { Input } from '@/components/ui/input';

/** Name/ID lookup only. The separate enhanced prototype retains semantic search. */
export function BasicLibrary({ candidates, onAdd, onClose }: { candidates: Capability[]; onAdd: (candidate: Capability) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'node' | 'flow'>('node');
  const visible = candidates.filter(item => item.kind === tab && `${item.name} ${item.operatorId ?? item.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <aside className="p2-basic-library" aria-label="节点库">
    <header><strong>添加节点</strong><button aria-label="关闭节点库" onClick={onClose}><X size={18} /></button></header>
    <div className="p2-basic-search"><Search size={15} /><Input aria-label="搜索算子名称或ID" placeholder="搜索名称或 ID" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <nav><button aria-pressed={tab === 'node'} onClick={() => setTab('node')}>算子</button><button aria-pressed={tab === 'flow'} onClick={() => setTab('flow')}>已发布工作流</button></nav>
    <div className="p2-basic-library-list">{visible.map(item => <button key={item.id} onClick={() => onAdd(item)}><span><strong>{item.name}</strong><code>{item.operatorId ?? item.id}</code><small>{item.description}</small></span><Plus size={15} /></button>)}{!visible.length && <p>没有匹配的名称或 ID</p>}</div>
  </aside>;
}
