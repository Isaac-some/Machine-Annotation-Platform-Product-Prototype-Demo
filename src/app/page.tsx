import { Suspense } from 'react';
import { HawkShellClient } from './hawk/hawk-shell-client';
import { ProjectPage } from '@/components/sites/hawk/project/project-page';
export default function Home() {
  return <Suspense><HawkShellClient><ProjectPage /></HawkShellClient></Suspense>;
}
