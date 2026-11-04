'use client';

import { useEffect, useState } from 'react';
import { readWorkspace, writeWorkspace } from './local-workspace';
import { tickWorkspace } from './workspace-runtime';

/** One driver for every Hawk page; a shared timestamp/lock prevents double ticking across tabs. */
export function useWorkspaceRuntime() {
  const [error, setError] = useState('');
  useEffect(() => {
    const mountedAt = Date.now();
    let halted = false;
    const onStorageError = () => { halted = true; setError('本地保存失败，模拟进度已暂停。现有记录保留，请刷新后重试。'); };
    window.addEventListener('hawk-workspace-storage-error', onStorageError);
    const advance = async () => {
      if (halted) return;
      try {
        const current = readWorkspace(), now = Date.now();
        if (now - (current.lastSimulationTick ?? 0) < 1100) return;
        // Never attribute time before this driver mounted, or a suspended/offline gap, to processing.
        const gap = Math.min(now - mountedAt, now - (current.lastSimulationTick ?? now));
        const observedMs = gap > 0 && gap <= 3000 ? gap : 0;
        const next = tickWorkspace(current, now, observedMs);
        if (next !== current && !(await writeWorkspace({ ...next, lastSimulationTick: now }))) throw new Error('本地保存失败');
        setError('');
      } catch { halted = true; setError('本地保存失败，模拟进度已暂停。现有记录保留，请刷新后重试。'); }
    };
    const timer = window.setInterval(() => {
      if (navigator.locks) void navigator.locks.request('hawk-workspace-runtime', { ifAvailable: true }, lock => { if (lock) return advance(); }).catch(() => setError('无法推进本地任务，请刷新后重试'));
      else void advance();
    }, 1200);
    return () => { window.clearInterval(timer); window.removeEventListener('hawk-workspace-storage-error', onStorageError); };
  }, []);
  return error;
}
