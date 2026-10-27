import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trialCidSample, type TrialResource } from './trial-resource';
import type { TrialSample } from './trial-run';
export function TrialCidInput({ resources, onChange, onNotice }: { resources: TrialResource[]; onChange: (sample: TrialSample) => void; onNotice: (message: string) => void }) {
  const [cid, setCid] = useState('');
  return <div className="p2-trial-cid-input"><label htmlFor="trial-input-cid">粘贴 CID</label><div><Input id="trial-input-cid" aria-label="试跑输入 CID" placeholder="粘贴 CID://..." value={cid} onChange={event => setCid(event.target.value)} /><Button variant="outline" onClick={() => { try { onChange(trialCidSample(cid, resources)); onNotice('已使用该 CID 的固定产出作为本组输入，请执行整组试跑'); } catch (error) { onNotice(error instanceof Error ? error.message : 'CID 不可用'); } }}>使用 CID</Button></div><small>可粘贴适用来源的 CID；当前原型使用本机演示 CID，不连接真实资源平台。</small></div>;
}
export function TrialResourceActions({ resource, onNotice }: { resource?: TrialResource; onNotice: (message: string) => void }) {
  if (!resource) return null;
  return <div className="p2-trial-output-resource"><div><strong>本组产出文件</strong><code>{resource.cid}</code><small>演示 CID · 可复制到下一组的样本准备；下载文件包含本轮实际模拟输出。</small></div><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(resource.cid); onNotice('已复制产出 CID，请在下一组粘贴使用'); } catch { onNotice('复制失败，请选中 CID 后复制'); } }}><Copy size={14} />复制产出 CID</Button><Button variant="outline" onClick={() => { const url = URL.createObjectURL(new Blob([resource.content], { type: 'application/x-ndjson;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = resource.name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download size={14} />下载产出文件</Button></div>;
}
