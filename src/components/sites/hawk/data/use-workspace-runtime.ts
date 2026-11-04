'use client';

import { useEffect, useState } from 'react';
import { readWorkspace, writeWorkspace } from './local-workspace';
import { tickWorkspace } from './workspace-runtime';

/** One driver for every Hawk page; a shared timestamp/lock prevents double ticking across tabs. */
export function useWorkspaceRuntime() {
  const [error, setError] = useState('');
  useEffect(() => {
    const advance = () => {
      try {
        const current = readWorkspace(), now = Date.now();
        if (now - (current.lastSimulationTick ?? 0) < 1100) return;
        const next = tickWorkspace(current, now);
        if (next !== current) writeWorkspace({ ...next, lastSimulationTick: now });
        setError('');
      } catch { setError('本地保存失败，模拟进度已停止。请检查浏览器存储空间后刷新；现有记录保留。'); }
    };
    const timer = window.setInterval(() => {
      if (navigator.locks) void navigator.locks.request('hawk-workspace-runtime', { ifAvailable: true }, lock => { if (lock) advance(); }).catch(() => setError('无法推进本地任务，请刷新后重试'));
      else advance();
    }, 1200);
    return () => window.clearInterval(timer);
  }, []);
  return error;
}
