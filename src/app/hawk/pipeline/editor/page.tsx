"use client";

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/demo-navigation";
import { readWorkspace, writeWorkspace, useWorkspace } from '@/components/sites/hawk/data/local-workspace';
import { ExecutorComposer, type SplitComposer, type SplitPublication } from '@/components/sites/hawk/pipeline/executor-composer';
import { draftProjectId } from '@/components/sites/hawk/data/workspace-projects';

function EditorInner() {
  const router = useRouter();
  const params = useSearchParams();
  const draft = params.get('draft') ?? 'p-101';
  const iframe = useRef<HTMLIFrameElement>(null);
  const [split, setSplit] = useState<Omit<SplitComposer, 'onPublish'> | null>(null);
  const workspace = useWorkspace();
  const flow = workspace.groups.flatMap(group => group.drafts).find(item => item.id === draft);
  const projectId = draftProjectId(workspace, draft);
  const project = workspace.projects.find(project => project.id === projectId);
  const query = new URLSearchParams({ prototype: 'phase2', profile: 'trial', draft, title: flow?.name ?? '新建工作流', project: project?.name ?? '', projectId: projectId === undefined ? '' : String(projectId) });
  const source = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/sites/hawk/openhandle/index.html?' + query;
  useEffect(() => {
    const workspace = readWorkspace();
    writeWorkspace(workspace);
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow) return;
      if (event.data?.type === 'hawk:request-split-publish' && typeof event.data.requestId === 'string' && typeof event.data.title === 'string' && Array.isArray(event.data.parts) && event.data.parts.length > 1 && event.data.parts.length <= 100 && event.data.parts.every((part: { name?: unknown; description?: unknown; labels?: unknown }) => typeof part?.name === 'string' && typeof part.description === 'string' && Array.isArray(part.labels) && part.labels.every(label => typeof label === 'string'))) {
        const current = readWorkspace();
        const projectId = draftProjectId(current, draft);
        setSplit({ requestId: event.data.requestId, title: event.data.title, parts: event.data.parts, projectName: current.projects.find(project => project.id === projectId)?.name });
      }
      if (event.data?.type === 'hawk:split-publish-error') setSplit(current => current && current.requestId === event.data.requestId ? { ...current, error: String(event.data.message) } : current);
      if (event.data?.type === 'hawk:back') {
        const projectId = draftProjectId(readWorkspace(), draft);
        router.push(projectId !== undefined ? `/hawk/project/detail/${projectId}?tab=executors` : '/hawk/pipeline');
      }
      if (event.data?.type === 'hawk:published') {
        router.push(typeof event.data.executorId === 'string' ? '/hawk/pipeline/executor?id=' + encodeURIComponent(event.data.executorId) : '/hawk/pipeline');
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [draft, router]);
  const reply = (publication?: SplitPublication) => {
    if (!split) return;
    iframe.current?.contentWindow?.postMessage({ type: publication ? 'hawk:confirm-split-publish' : 'hawk:cancel-split-publish', requestId: split.requestId, publication }, window.location.origin);
    if (!publication) setSplit(null);
  };
  return <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 100 }}>{source && <iframe ref={iframe} src={source} title="工作流手动编排" style={{ border: 'none', width: '100%', height: '100%' }} />}<ExecutorComposer open={Boolean(split)} flows={[]} onCreated={() => {}} onCancel={() => reply()} split={split ? { ...split, onPublish: publication => reply(publication) } : undefined} /></div>;
}

export default function EditorPage() { return <Suspense><EditorInner /></Suspense>; }
