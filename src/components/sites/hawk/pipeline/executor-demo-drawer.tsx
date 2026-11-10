'use client';
import { useState } from 'react';
import { Button, Drawer, Alert, Space, message } from 'antd';
import { useRouter } from '@/lib/demo-navigation';
import { readWorkspace, writeWorkspace, type LocalExecutor } from '../data/local-workspace';
import { DEMO_EXECUTOR_ID, DEMO_SCENARIOS, prepareDemoScenarioAsync, type DemoScenario } from '../data/executor-demo-scenarios';
import { ExecutorSourceControls } from './executor-source-controls';

export function ExecutorDemoDrawer({ executor }: { executor: LocalExecutor }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [msg, holder] = message.useMessage(), router = useRouter();
  const load = async (scenario: DemoScenario) => {
    setBusy(true); setError('');
    try {
      const next = await prepareDemoScenarioAsync(readWorkspace(), executor.id, scenario);
      if (!await writeWorkspace(next)) throw new Error('场景保存失败，请重试');
      setOpen(false); router.push(`/hawk/pipeline/executor/?id=${DEMO_EXECUTOR_ID}`);
      msg.success('场景已就绪，请观察运行变化');
    } catch (issue) { setError(issue instanceof Error ? issue.message : '场景准备失败'); }
    finally { setBusy(false); }
  };
  return <>{holder}<Button className="hawk-demo-trigger" onClick={() => setOpen(true)}>演示与验收</Button>
    <Drawer title="演示与验收" open={open} onClose={() => setOpen(false)} width={440}>
      <p>选择场景后自动准备输入、批次和配置，10 秒内观察结果。每次重置演示批次；其他运行中的模拟任务暂停。</p>
      {error && <Alert type="error" showIcon message={error} />}
      <Space direction="vertical" style={{ width: '100%' }} size={14}>{DEMO_SCENARIOS.map(s => <div key={s.id} className="hawk-demo-scenario"><Button block disabled={busy} onClick={() => void load(s.id)}>{s.title}</Button><p>{s.expected}</p></div>)}</Space>
      <hr /><ExecutorSourceControls executor={executor} />
    </Drawer>
  </>;
}
