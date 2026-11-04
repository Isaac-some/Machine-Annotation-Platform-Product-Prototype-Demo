import type { ExportJob, ExportRange } from './delivery';

/** Resolve relative time once per click; persisted jobs always keep absolute boundaries. */
export function recentExportRange(minutes: number, now: number): ExportRange {
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('请填写大于 0 的时长');
  return { kind: 'interval', start: now - minutes * 60_000, end: now };
}

/** Successful jobs alone describe delivered windows; legacy inclusive ends advance by 1 ms. */
export function deliveredWindow(job: ExportJob, firstResultAt: number) {
  return {
    start: job.range.kind === 'interval' ? job.range.start : Math.min(firstResultAt, job.snapshotAt),
    end: job.range.kind === 'interval' ? job.range.end : job.range.kind === 'until' ? job.range.end + 1 : job.snapshotAt + 1,
  };
}

export function latestDeliveredEnd(jobs: ExportJob[], firstResultAt: number): number | undefined {
  const ends = jobs.filter(job => job.status === 'succeeded').map(job => deliveredWindow(job, firstResultAt).end);
  return ends.length ? Math.max(...ends) : undefined;
}
