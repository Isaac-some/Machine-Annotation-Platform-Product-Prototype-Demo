import type { LocalExecutor } from './local-workspace';

export function waitingReminderSettings(e: LocalExecutor) {
  return { enabled: e.streamPolicy?.waitingReminderEnabled ?? true, normalMinutes: e.streamPolicy?.waitingNormalMinutes ?? 30, urgentMinutes: e.streamPolicy?.waitingUrgentMinutes ?? 60 };
}
/** One event per level and waiting episode; dispatch belongs to the existing notification system. */
export function updateStreamWaiting(e: LocalExecutor, now: number) {
  const s = e.stream!;
  const waiting = e.runtime?.state === 'running' && s.phase === 'production' && Boolean(s.source) && !s.stageRecovery && !s.automaticRetrying && !s.source?.closed && !s.source?.error && s.admitted >= (e.inputCount ?? 0) && !s.queues.some(q => q.length);
  if (!waiting) { s.waitingEpisode = undefined; if (s.source) s.source.waiting = false; return; }
  s.source!.waiting = true;
  s.waitingEpisode ??= { since: now, normalSent: false, urgentSent: false };
  const config = waitingReminderSettings(e), episode = s.waitingEpisode;
  if (!config.enabled) return;
  const elapsed = Math.max(0, now - episode.since) / 60000;
  for (const [level, minutes, sent] of [['normal', config.normalMinutes, 'normalSent'], ['urgent', config.urgentMinutes, 'urgentSent']] as const) {
    if (elapsed < minutes || episode[sent]) continue;
    episode[sent] = true;
    const text = `等待新数据已持续 ${minutes} 分钟 · ${level === 'urgent' ? '加急提醒' : '普通提醒'}；执行器继续等待`;
    s.waitNotifications ??= [];
    s.waitNotifications.push({ at: now, level, text });
    s.waitNotifications = s.waitNotifications.slice(-100);
    s.events.unshift({ at: now, text }); s.events = s.events.slice(0, 100);
  }
}
