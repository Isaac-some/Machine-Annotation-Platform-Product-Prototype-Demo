import { useState } from 'react';

type Version = { version: number; revision?: number; graph: { nodes: { id: string; data: { label: string; operatorId?: string; config?: Record<string, unknown> } }[]; edges: { id: string; source: string; target: string }[]; groupFlowIds?: string[] } };
export function LocalVersions({ draftId }: { draftId: string }) {
  const [versions] = useState(() => {
    const prefix = `annotation-demo.published.${draftId}.v`;
    const versions: Version[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      try {
        const graph = JSON.parse(localStorage.getItem(key)!) as Version['graph'] & { revision?: number };
        if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) continue;
        versions.push({ version: Number(key.slice(prefix.length)), revision: graph.revision, graph });
      } catch { /* An incomplete snapshot cannot be selected. */ }
    }
    return versions.sort((first, second) => second.version - first.version);
  });
  return <div>{!versions.length ? <p>当前草稿暂无本地发布版本。发布后会固定一份快照，继续编辑不会覆盖它。</p> : versions.map(version => <details key={version.version} style={{ padding: 16, border: '1px solid #e2e6ed', borderRadius: 8, marginBottom: 12 }}><summary><strong>整图 v{version.version}</strong> · 草稿快照 {version.revision ?? 1} · {version.graph.nodes.length} 个节点 / {version.graph.edges.length} 条连线</summary><div style={{ marginTop: 12, display: 'grid', gap: 8 }}>{version.graph.nodes.map(node => <article key={node.id} style={{ borderTop: '1px solid #e8ebf0', paddingTop: 8 }}><strong>{node.data.label}</strong><p style={{ margin: '4px 0', color: '#667085' }}>{node.data.operatorId ?? node.id}</p>{node.data.config && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{JSON.stringify(node.data.config, null, 2)}</pre>}</article>)}<strong>连线</strong>{version.graph.edges.map(edge => <p key={edge.id} style={{ margin: 0 }}>{edge.source} → {edge.target}</p>)}{version.graph.groupFlowIds?.length ? <><strong>关联分组 Flow 版本</strong>{version.graph.groupFlowIds.map(flowId => <p key={flowId} style={{ margin: 0 }}>{flowId}</p>)}</> : null}</div><small style={{ display: 'block', marginTop: 12 }}>历史版本只读；查看不会改变当前草稿或已有批次。</small></details>)}</div>;
}
