export type RunTimeEvent = {
  id: string; span: string; kind: 'processing' | 'pause' | 'queue' | 'resource-wait'; edge: 'start' | 'end';
  at: number; monotonicMs: number; clock: string; input?: number; stage?: number; attempt?: number;
};
export type RunTimeTrace = { startedAt: number; finishedAt?: number; events: RunTimeEvent[] };
type Interval = { start: number; end: number };
const union = (rows: Interval[]) => rows.sort((a, b) => a.start - b.start).reduce<Interval[]>((all, row) => {
  const last = all.at(-1);
  if (last && last.end >= row.start) last.end = Math.max(last.end, row.end);
  else all.push({ ...row });
  return all;
}, []);
const length = (rows: Interval[]) => union(rows).reduce((sum, row) => sum + row.end - row.start, 0);

/** Only closed, correlated spans contribute. Epochs never share monotonic clocks. */
export function summarizeRunTime(trace: RunTimeTrace | undefined, now: number) {
  if (!trace) return { activeMs: undefined, wallMs: undefined, pauseMs: undefined, queueMs: undefined, waitMs: undefined, completedAttempts: 0, incomplete: 0, invalid: 0 };
  const unique = new Map<string, RunTimeEvent>(), conflicts = new Set<string>();
  for (const event of trace.events) {
    const previous = unique.get(event.id);
    const fingerprint = (value: RunTimeEvent) => JSON.stringify([value.span, value.kind, value.edge, value.at, value.monotonicMs, value.clock, value.input, value.stage, value.attempt]);
    if (previous && fingerprint(previous) !== fingerprint(event)) { conflicts.add(previous.span); conflicts.add(event.span); }
    else unique.set(event.id, event);
  }
  const spans = new Map<string, RunTimeEvent[]>();
  unique.forEach(event => spans.set(event.span, [...(spans.get(event.span) ?? []), event]));
  const completed: { event: RunTimeEvent; interval: Interval }[] = [];
  let incomplete = 0, invalid = 0;
  spans.forEach(events => {
    const starts = events.filter(event => event.edge === 'start'), ends = events.filter(event => event.edge === 'end');
    if (conflicts.has(events[0].span) || starts.length > 1 || ends.length > 1) { invalid++; return; }
    if (!starts.length || !ends.length) { incomplete++; return; }
    const a = starts[0], b = ends[0];
    if (a.kind !== b.kind || a.clock !== b.clock || a.input !== b.input || a.stage !== b.stage || a.attempt !== b.attempt || ![a.monotonicMs, b.monotonicMs].every(Number.isFinite) || b.monotonicMs < a.monotonicMs || (a.kind === 'processing' && (a.input === undefined || a.stage === undefined || a.attempt === undefined))) { invalid++; return; }
    completed.push({ event: a, interval: { start: a.monotonicMs, end: b.monotonicMs } });
  });
  const attempts = new Map<string, typeof completed>();
  completed.filter(row => row.event.kind === 'processing').forEach(row => {
    const key = JSON.stringify([row.event.clock, row.event.input, row.event.stage, row.event.attempt]);
    attempts.set(key, [...(attempts.get(key) ?? []), row]);
  });
  let activeMs = 0, completedAttempts = 0;
  attempts.forEach(rows => {
    const event = rows[0].event;
    const exclusions = completed.filter(row => row.event.kind !== 'processing' && row.event.clock === event.clock && (row.event.input === undefined || row.event.input === event.input) && (row.event.stage === undefined || row.event.stage === event.stage) && (row.event.attempt === undefined || row.event.attempt === event.attempt));
    // An unclosed wait/pause may overlap the whole attempt; its duration is unknown.
    const uncertain = [...spans.values()].some(span => span[0].kind !== 'processing' && span[0].clock === event.clock && (span[0].input === undefined || span[0].input === event.input) && (span[0].stage === undefined || span[0].stage === event.stage) && (span[0].attempt === undefined || span[0].attempt === event.attempt) && !completed.some(row => row.event.span === span[0].span));
    if (uncertain) { incomplete++; return; }
    completedAttempts++;
    for (const processing of union(rows.map(row => row.interval))) {
      const overlap = exclusions.map(row => ({ start: Math.max(processing.start, row.interval.start), end: Math.min(processing.end, row.interval.end) })).filter(row => row.end > row.start);
      activeMs += processing.end - processing.start - length(overlap);
    }
  });
  const kindLength = (kind: RunTimeEvent['kind']) => {
    const clocks = new Map<string, Interval[]>();
    completed.filter(row => row.event.kind === kind).forEach(row => clocks.set(row.event.clock, [...(clocks.get(row.event.clock) ?? []), row.interval]));
    return [...clocks.values()].reduce((sum, rows) => sum + length(rows), 0);
  };
  const end = trace.finishedAt ?? now;
  return { activeMs: completedAttempts ? activeMs : undefined, wallMs: Number.isFinite(trace.startedAt) && Number.isFinite(end) && end >= trace.startedAt ? end - trace.startedAt : undefined, pauseMs: kindLength('pause'), queueMs: kindLength('queue'), waitMs: kindLength('resource-wait'), completedAttempts, incomplete, invalid };
}
