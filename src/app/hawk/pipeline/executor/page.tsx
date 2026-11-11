"use client";
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ExecutorWorkbench } from '@/components/sites/hawk/pipeline/executor-workbench';
function Content() { const q = useSearchParams(); return <ExecutorWorkbench key={`${q.get('id')}:${q.get('panel')}`} />; }
export default function ExecutorPage() { return <Suspense><Content /></Suspense>; }
