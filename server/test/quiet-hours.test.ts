import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.GANTT_DATA_DIR = await mkdtemp(join(tmpdir(), 'gandalf-quiet-test-'));
Object.assign(process.env, { GANDALF_SEARCH_OWNER: 'UOWNER', GANDALF_PROACTIVE_DM_CHANNEL: 'DOWNER', GANDALF_TIMEZONE: 'America/New_York', SLACK_TEAM_ID: 'T1', SLACK_SEARCH_TOKEN: 'test-user', SLACK_BOT_TOKEN: 'test-bot', OPENAI_API_KEY: 'test-openai' });
const { createProactiveWatcher, isQuietHours } = await import('../src/services/proactive.js');

test('quiet hours follow local time in winter and summer', () => {
  for (const value of ['2026-11-20T03:00:00Z', '2026-11-20T10:59:59Z', '2026-07-01T02:00:00Z', '2026-07-01T09:59:59Z']) assert.equal(isQuietHours(Date.parse(value)), true, value);
  for (const value of ['2026-11-20T02:59:59Z', '2026-11-20T11:00:00Z', '2026-07-01T01:59:59Z', '2026-07-01T10:00:00Z']) assert.equal(isQuietHours(Date.parse(value)), false, value);
});

test('suppresses messages during quiet hours, including a response finishing at 10 p.m., and resumes with a 30-minute cooldown', async () => {
  let time = Date.parse('2026-11-20T02:59:00Z');
  let generated = 0;
  const sent: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('auth.test')) return Response.json({ ok: true, user_id: 'UOWNER', team_id: 'T1' });
    if (u.includes('conversations.history')) return Response.json({ ok: true, messages: [{ user: 'UOWNER' }] });
    if (u.includes('openai.com')) {
      generated++;
      if (generated === 1) time = Date.parse('2026-11-20T03:00:00Z');
      return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ notify: true, message: `Work check-in ${generated}` }) }] }] });
    }
    if (u.includes('chat.postMessage')) { const body = JSON.parse(String(init?.body)); sent.push(body.markdown_text); return Response.json({ ok: true, channel: body.channel, ts: '1.1' }); }
    throw new Error(`Unexpected request: ${u}`);
  }) as typeof fetch;
  const watcher = createProactiveWatcher({ now: () => time, minAnalysisMs: 1000, minMessageMs: 30 * 60000 });
  try {
    await watcher.tick();
    assert.equal(generated, 1);
    assert.equal(sent.length, 0, 'a response finishing at 10 p.m. is suppressed');
    time = Date.parse('2026-11-20T10:59:59Z');
    await watcher.tick();
    assert.equal(generated, 1, 'no check-in is generated before 6 a.m.');
    time = Date.parse('2026-11-20T11:00:00Z');
    await watcher.tick();
    assert.equal(sent.length, 1, 'check-ins resume at 6 a.m.');
    time += 29 * 60000;
    await watcher.tick();
    assert.equal(sent.length, 1, 'the 30-minute cooldown is respected');
    time += 60000;
    await watcher.tick();
    assert.equal(sent.length, 2, 'the next check-in can be sent after 30 minutes');
  } finally { watcher.stop(); globalThis.fetch = original; await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
