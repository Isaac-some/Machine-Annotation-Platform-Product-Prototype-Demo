import { useState } from 'react';

type Version = { version: number; revision?: number; labels: string[] };
export function LocalVersions({ draftId }: { draftId: string }) {
  const [versions] = useState(() => {
    const prefix = `annotation-demo.published.${draftId}.v`;
    const versions: Version[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      try {
        const graph = JSON.parse(localStorage.getItem(key)!) as { revision?: number; nodes: { data: { label: string } }[] };
        versions.push({ version: Number(key.slice(prefix.length)), revision: graph.revision, labels: graph.nodes.map(node => node.data.label) });
      } catch { /* An incomplete snapshot cannot be selected. */ }
    }
    return versions.sort((first, second) => second.version - first.version);
  });
  return <div>{!versions.length ? <p>当前草稿暂无本地发布版本。发布后会固定一份快照，继续编辑不会覆盖它。</p> : versions.map(version => <section key={version.version} style={{ padding: 16, border: '1px solid #e2e6ed', borderRadius: 8, marginBottom: 12 }}><strong>v{version.version}</strong><p>草稿快照 {version.revision ?? 1}</p><p>{version.labels.join(' → ')}</p></section>)}</div>;
}
