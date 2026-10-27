import { useEffect, useRef, useState } from 'react';
import { declaredOutputs, extractSegment, type LocalGraph } from './local-publish-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Flow = { id: string; name: string; description: string | null; status: 'published' | 'draft'; outputs: string[]; version?: number; publishedId?: string; graphKey?: string };
type Group = { project: string; projectId?: number; drafts: Flow[] };
type Workspace = { groups: Group[]; projects: { id: number; name: string }[]; executors: Record<string, unknown>[] };
const key = 'annotation-demo.local-workspace.v1';
type Publication = { name: string; parts: { name: string; description: string }[] };
export function LocalPublish({ draftId, title, segments, purpose, onClose, onPublished, onLocateBoundary }: { draftId: string; title: string; purpose?: 'trial'; segments?: { nodeIds: string[]; labels: string[] }[]; onClose: () => void; onPublished: (id?: string) => void; onLocateBoundary?: () => void }) {
  const [name, setName] = useState(segments ? `${title}执行器` : title);
  const [parts, setParts] = useState((segments ?? [{ nodeIds: [], labels: [] }]).map((segment, index) => ({ ...segment, name: segments ? (segment.labels[0] || `工作流 ${index + 1}`) : title, description: '' })));
  const [error, setError] = useState('');
  const submitted = useRef(false);
  const embedded = Boolean(segments && window.parent !== window);
  const [requestId] = useState(() => `publish-${draftId}-${Date.now()}`);
  const [initialParts] = useState(parts);
  const publish = (publication?: Publication) => {
    if (submitted.current) return;
    const publishName = publication?.name ?? name;
    const publishParts = publication ? parts.map((part, index) => ({ ...part, ...publication.parts[index] })) : parts;
    if (!publishName.trim() || publishParts.some(part => !part.name.trim()) || (!segments && publishParts.some(part => !part.description.trim()))) { setError('请补全名称和简介'); return; }
    try {
      const workspace = JSON.parse(localStorage.getItem(key) ?? 'null') as Workspace | null;
      if (!workspace?.groups) throw new Error('请从工作流列表打开编辑器后再发布');
      const stamp = Date.now();
      const flows: Flow[] = publishParts.map((part, index) => ({ id: segments ? `${draftId}-part-${stamp}-${index}` : draftId, name: segments ? part.name.trim() : publishName.trim(), description: part.description.trim(), status: 'published', outputs: [] }));
      const group = workspace.groups.find(item => item.drafts.some(flow => flow.id === draftId));
      if (!group) throw new Error('没有可发布到的项目');
      const projects = workspace.projects.filter(project => group.projectId === undefined ? project.name === group.project : project.id === group.projectId);
      if (segments && projects.length !== 1) throw new Error('草稿所属项目无法确定，请先在工作流列表选择有效项目');
      const projectId = projects.length === 1 ? projects[0].id : undefined;
      if (projectId !== undefined) group.projectId = projectId;
      flows.forEach(flow => {
        const previous = group.drafts.find(item => item.id === flow.id);
        flow.version = (previous?.version ?? (previous?.status === 'published' ? 1 : 0)) + 1;
        flow.publishedId = `${flow.id.startsWith('flow.') ? flow.id.replace(/@\d+$/, '') : 'flow.' + flow.id}@${flow.version}`;
        flow.graphKey = `annotation-demo.published.${flow.id}.v${flow.version}`;
      });
      group.drafts = [...flows, ...group.drafts.filter(flow => !flows.some(next => next.id === flow.id))];
      const graph = JSON.parse(localStorage.getItem('annotation-demo.graph.' + draftId) ?? 'null') as LocalGraph | null;
      if (!graph) throw new Error('请先保存草稿再发布');
      const nextGraphs = publishParts.map(part => segments ? extractSegment(graph, part.nodeIds) : graph);
      flows.forEach((flow, index) => { flow.outputs = declaredOutputs(nextGraphs[index]); });
      const previous = flows.flatMap(flow => ['annotation-demo.graph.' + flow.id, flow.graphKey!].map(key => ({ key, value: localStorage.getItem(key) })));
      const executorId = segments ? `executor-${stamp}` : undefined;
      if (executorId) workspace.executors.unshift({ id: executorId, projectId, purpose, sourceDraftId: draftId, name: publishName.trim(), description: publishParts.map(part => part.description).filter(Boolean).join('；'), source: 'canvas', flowIds: flows.map(flow => flow.id), flows, updatedAt: new Date().toISOString() });
      try {
        flows.forEach((flow, index) => {
          localStorage.setItem('annotation-demo.graph.' + flow.id, JSON.stringify(nextGraphs[index]));
          localStorage.setItem(flow.graphKey!, JSON.stringify(nextGraphs[index]));
        });
        localStorage.setItem(key, JSON.stringify(workspace));
      } catch (failure) {
        previous.forEach(item => { if (item.value === null) localStorage.removeItem(item.key); else localStorage.setItem(item.key, item.value); });
        throw failure;
      }
      submitted.current = true;
      onPublished(executorId);
    } catch (issue) {
      const message = issue instanceof Error ? issue.message : '本机保存失败';
      setError(message);
      if (embedded) window.parent.postMessage({ type: 'hawk:split-publish-error', requestId, message }, window.location.origin);
    }
  };
  const handlers = useRef({ publish, onClose });
  useEffect(() => { handlers.current = { publish, onClose }; });
  useEffect(() => {
    if (!embedded) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.requestId !== requestId) return;
      if (event.data.type === 'hawk:cancel-split-publish') handlers.current.onClose();
      const publication = event.data.publication as Publication | undefined;
      if (event.data.type === 'hawk:confirm-split-publish' && publication && typeof publication.name === 'string' && Array.isArray(publication.parts) && publication.parts.length === initialParts.length && publication.parts.every(part => typeof part.name === 'string' && typeof part.description === 'string')) handlers.current.publish(publication);
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'hawk:request-split-publish', requestId, title, purpose, parts: initialParts.map(part => ({ name: part.name, description: part.description, labels: part.labels })) }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, [embedded, initialParts, requestId, title, purpose]);
  if (embedded) return null;
  return <div className="p2-local-publish">
    {segments && <div className="p2-callout warning"><strong>单工作流发布已阻断</strong><p>遍历 TOS 目录会产生多条后续输入，本案例需拆成 {parts.length} 条工作流。顺序来自当前画布，不能在此重新排序。</p><Button variant="outline" size="sm" onClick={onLocateBoundary}>定位阻断节点</Button></div>}
    <label>{segments ? '执行器名称' : '工作流名称'}<Input aria-label={segments ? '执行器名称' : '工作流名称'} value={name} onChange={event => setName(event.target.value)} /></label>
    {parts.map((part, index) => <section key={index}><h3>{segments ? `${index + 1}. 工作流` : '发布内容'}</h3>{segments && <><p>{part.labels.join(' → ')}</p><label>工作流名称<Input aria-label={`第${index + 1}段名称`} value={part.name} onChange={event => setParts(parts.map((item, row) => row === index ? { ...item, name: event.target.value } : item))} /></label></>}<label>简介<Textarea aria-label={segments ? `第${index + 1}段简介` : '工作流简介'} rows={2} value={part.description} onChange={event => setParts(parts.map((item, row) => row === index ? { ...item, description: event.target.value } : item))} /></label></section>)}
    {error && <p className="p2-error" role="alert">{error}</p>}
    <footer><Button variant="outline" onClick={onClose}>返回编排</Button><Button onClick={() => publish()}>{segments ? '发布工作流并创建执行器' : '确认发布'}</Button></footer>
  </div>;
}
