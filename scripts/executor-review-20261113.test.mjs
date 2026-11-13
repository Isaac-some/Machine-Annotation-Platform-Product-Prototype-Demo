import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, f);
const S = require('../src/components/sites/hawk/data/executor-streaming.ts');
const R = require('../src/components/sites/hawk/data/executor-runtime.ts');
const { withPhase2Examples } = require('../src/components/sites/hawk/data/phase2-examples.ts');
const id = 'phase2-reservoir';
const get = w => w.executors.find(e => e.id === id);
const start = () => S.startStream(withPhase2Examples({ groups: [], projects: [], executors: [], batches: [] }), id);
const run = (w, count = 100, now = Date.now()) => { for (let i = 0; i < count; i++) w = S.tickStream(w, id, 0, now); return w; };
test('30/60 minute waiting events are once per level, survive reload, and never pause production', () => {
 let w = run(start()); const since = get(w).stream.waitingEpisode.since;
 w = run(w, 1, since + 30 * 60000 - 1); assert.equal(get(w).stream.waitNotifications, undefined);
 w = run(w, 1, since + 30 * 60000); assert.deepEqual(get(w).stream.waitNotifications.map(n=>n.level), ['normal']);
 w = run(JSON.parse(JSON.stringify(w)), 4, since + 60 * 60000); assert.deepEqual(get(w).stream.waitNotifications.map(n=>n.level), ['normal', 'urgent']);
 w = run(w, 5, since + 180 * 60000); assert.equal(get(w).stream.waitNotifications.length, 2); assert.equal(get(w).runtime.state,'running');
});
test('waiting notifications can be disabled and thresholds changed without resetting elapsed waiting', () => {
 let w = run(start()); const since = get(w).stream.waitingEpisode.since;
 w = S.setStreamLimits(w, id, { waitingReminderEnabled: false }); w = run(w, 1, since + 3600000);
 assert.equal(get(w).stream.waitNotifications, undefined); assert.equal(get(w).stream.waitingEpisode.since, since);
 w = S.setStreamLimits(w, id, { waitingReminderEnabled: true, waitingNormalMinutes: 10, waitingUrgentMinutes: 90 });
 w = run(w, 1, since + 3600000); assert.deepEqual(get(w).stream.waitNotifications.map(n=>n.level), ['normal']);
});
test('manual pause ends a waiting episode; resume starts a fresh episode without old reminders', () => {
 let w = run(start()); const since = get(w).stream.waitingEpisode.since;
 w = run(w,1,since+3600000); w = R.changeExecutorState(w,id,'pause'); assert.equal(get(w).stream.waitingEpisode,undefined);
 w = S.resumeStream(w,id,since+3600001); w = run(w,1,since+3600002);
 assert.equal(get(w).stream.waitingEpisode.since,since+3600002); assert.equal(get(w).stream.waitNotifications.length,2);
});
test('new data and its failures have fresh automatic retry eligibility; old failures do not', () => {
 let w = run(start()); const e = get(w), s = e.stream;
 s.failures.push({key:'old-failure',root:1,stage:0,attempt:1}); s.stages[0].failed++;
 const originalRetries = s.retryRound;
 w = S.recordStreamSourceEvent(w,id,{kind:'data',count:9}); w = run(w);
 assert.equal(get(w).stream.failures.filter(t=>t.key==='old-failure').length,1);
 assert(get(w).stream.retryRound > originalRetries); assert.equal(get(w).runtime.state,'running');
 const retries=get(w).stream.retryRound; w=run(w,200); assert.equal(get(w).stream.retryRound,retries);
});
test('new data arriving during automatic retry waits until retry and downstream work finish', () => {
 let w = start(); for(let i=0;i<100&&!get(w).stream.automaticRetrying;i++)w=S.tickStream(w,id);
 assert(get(w).stream.automaticRetrying); const admitted=get(w).stream.admitted;
 w=S.recordStreamSourceEvent(w,id,{kind:'data',count:3});
 for(let i=0;i<100&&get(w).stream.automaticRetrying;i++){w=S.tickStream(w,id);assert.equal(get(w).stream.admitted,admitted);}
 w=run(w);assert.equal(get(w).stream.admitted,admitted+3);
});
test('a downstream queue waiting for a paused stage never starts whole-executor idle notifications', () => {
 let w=run(start(),3);get(w).stream.pausedStages=[1];w=run(w,100,Date.now()+7200000);
 assert(get(w).stream.queues.some(q=>q.length));assert.equal(get(w).stream.waitingEpisode,undefined);assert.equal(get(w).stream.waitNotifications,undefined);
});
