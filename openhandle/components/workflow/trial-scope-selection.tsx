import { useState } from 'react';
import { Button } from '@/components/ui/button';
export function TrialScopeSelection({ groups, onSelect, onExecutor, onClose }: {
  groups: { labels: string[]; available: boolean }[];
  onSelect: (index: number) => void; onExecutor: () => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return <><div className="p2-callout warning"><strong>拆分算子不能执行草稿试跑</strong><p>查看拆分及完整链路效果，需要发布并创建试跑执行器；也可以勾选一组，将其他组和拆分算子设为本轮“忽略”后测试。</p></div><h3>勾选本轮要测试的组</h3><div className="p2-trial-group-list">{groups.map((group, index) => <label key={index}><input type="radio" name="trial-group" aria-label={'选择第 ' + (index + 1) + ' 组'} disabled={!group.available} checked={selected === index} onChange={() => setSelected(index)} /><div><strong>第 {index + 1} 组</strong><p>{group.labels.join(' → ')}</p><small>{group.available ? '整组从头执行；其他组和拆分算子忽略' : '仅含拆分算子，需使用执行器测试'}</small></div></label>)}</div><p className="p2-field-help">只改变本轮执行范围，不改动草稿节点或连线。完成后可下载产出文件、复制 CID，再手动添加到下一组输入。每次整组重新试跑都会创建独立记录。</p><footer><Button variant="outline" onClick={onClose}>返回编排</Button><Button variant="outline" disabled={selected === null} onClick={() => { if (selected !== null) onSelect(selected); }}>在草稿试跑所选组</Button><Button onClick={onExecutor}>发布并创建试跑执行器</Button></footer></>;
}
