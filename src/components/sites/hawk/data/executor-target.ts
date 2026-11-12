import type { LocalExecutor } from './local-workspace';
export function normalizeExecutorTarget(e: LocalExecutor) {
  const p = e.streamPolicy; if (!p || p.targetOutputPercent === undefined) return;
  const total = e.stream?.source?.initialInputCount ?? (!e.runtime?.started ? e.inputCount : undefined);
  if (Number.isSafeInteger(total) && total! > 0 && Number.isFinite(p.targetOutputPercent) && p.targetOutputPercent > 0 && p.targetOutputPercent <= 100) {
    p.targetOutputCount = Math.ceil(total! * p.targetOutputPercent / 100);
    p.legacyTargetUnresolved = undefined;
  } else { p.legacyTargetUnresolved = true; }
  p.targetOutputPercent = undefined; p.targetOutputMode = 'count';
}
