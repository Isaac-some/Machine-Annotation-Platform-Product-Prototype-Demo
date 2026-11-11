'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Drawer, Alert } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { useRouter } from '@/lib/demo-navigation';
import { DEMO_ENTRIES } from './demo-catalog';
import { DEMO_SCENARIOS, prepareDemoScenarioAsync } from './data/executor-demo-scenarios';
import { withPhase2Examples } from './data/phase2-examples';
import { readWorkspace, useWorkspace, writeWorkspace } from './data/local-workspace';
import { ExecutorSourceControls } from './pipeline/executor-source-controls';

export function DemoLauncher() {
  const [open, setOpen] = useState(false), [error, setError] = useState('');
  const query = useSearchParams(), router = useRouter(), pending = useRef('');
  const scene = query.get('demo'), workspace = useWorkspace();
  const executor = workspace.executors.find(e => e.id === query.get('id'));
  useEffect(() => {
    if (!scene || pending.current === scene) return;
    const scenario = DEMO_SCENARIOS.find(s => s.id === scene);
    if (!scenario) return;
    pending.current = scene;
    let cancelled = false;
    void (async () => {
      try {
        const prepared = await prepareDemoScenarioAsync(withPhase2Examples(readWorkspace()), 'phase2-reservoir', scenario.id);
        if (cancelled) return;
        if (!await writeWorkspace(prepared)) throw new Error('演示数据保存失败，请重试');
        const url = new URL(window.location.href); url.searchParams.delete('demo');
        window.history.replaceState(null, '', url.href);
        setError('');
      } catch (e) { setError(e instanceof Error ? e.message : '演示准备失败'); }
      finally { pending.current = ''; }
    })();
    return () => { cancelled = true; pending.current = ''; };
  }, [scene]);
  return <>
    {error && <Alert type="error" message={error} closable onClose={() => setError('')} />}
    {!open && <Button type="primary" shape="circle" size="large" aria-label="打开演示抽屉" title="演示与验收" icon={<PlayCircleOutlined />} style={{ position: 'fixed', left: 20, bottom: 20, width: 52, height: 52, zIndex: 1100, boxShadow: '0 4px 16px #1677ff44' }} onClick={() => setOpen(true)} />}
    <Drawer title="演示与验收" placement="left" width={420} open={open} onClose={() => setOpen(false)}>
      <p>选择演示，自动准备数据并跳转到对应界面。</p>
      <div style={{ display: 'grid', gap: 12 }}>{DEMO_ENTRIES.map(e => <div key={e.key}><Button block onClick={() => { setOpen(false); router.push(e.path); }}>{e.title}</Button><p style={{ color: '#64748b', margin: '5px 0 0', fontSize: 12 }}>{e.description}</p></div>)}</div>
      {executor?.stream && <><hr /><ExecutorSourceControls executor={executor} /></>}
    </Drawer>
  </>;
}
