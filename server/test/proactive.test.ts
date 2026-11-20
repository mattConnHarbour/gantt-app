import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.GANTT_DATA_DIR = await mkdtemp(join(tmpdir(), 'gandalf-watch-test-'));
Object.assign(process.env, { GANDALF_SEARCH_OWNER: 'UOWNER', GANDALF_PROACTIVE_DM_CHANNEL: 'DOWNER', SLACK_TEAM_ID: 'T1', SLACK_SEARCH_TOKEN: 'user-token', SLACK_BOT_TOKEN: 'bot-token', GRANOLA_API_KEY: 'granola-test', LINEAR_API_KEY: 'linear-test', OPENAI_API_KEY: 'openai-test' });
const { createProactiveWatcher } = await import('../src/services/proactive.js');
const storage = await import('../src/services/storage.js');
const { getConversation } = await import('../src/services/conversation.js');

test('sends grounded updates and periodic check-ins only to the owner, respecting cooldown', async () => {
  let time = Date.parse('2026-11-19T16:00:00Z');
  let generated = 0;
  const sent: any[] = [];
  let modelInput: any;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    const u = String(url);
    if (u.includes('auth.test')) return Response.json({ ok: true, user_id: 'UOWNER', team_id: 'T1' });
    if (u.includes('conversations.history')) return Response.json({ ok: true, messages: [{ user: 'UOWNER' }] });
    if (u.includes('search.messages')) return Response.json({ ok: true, messages: { matches: [{ text: 'Demo ready', permalink: 'https://example.com/slack' }], total: 1 } });
    if (u.includes('public-api.granola.ai/v1/notes/')) return Response.json({ id: 'not_test', title: 'Acme', summary_text: 'Prepare the demo', web_url: 'https://example.com/note' });
    if (u.includes('public-api.granola.ai/v1/notes')) return Response.json({ notes: [{ id: 'not_test', title: 'Acme' }], hasMore: false });
    if (u.includes('api.linear.app')) return Response.json({ data: { viewer: { assignedIssues: { nodes: [{ identifier: 'IT-1', title: 'Demo', url: 'https://example.com/issue' }], pageInfo: { hasNextPage: false } } } } });
    if (u.includes('openai.com')) { generated++; modelInput = JSON.parse(JSON.parse(String(options?.body)).input); const insight = generated === 3 ? { notify: false, message: '' } : { notify: true, message: generated === 1 ? 'Prepare the Acme demo.' : 'Check the Acme follow-up.' }; return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(insight) }] }] }); }
    if (u.includes('chat.postMessage')) { const body = JSON.parse(String(options?.body)); sent.push(body); return Response.json({ ok: true, channel: body.channel, ts: '1795104000.000001' }); }
    throw new Error(`Unexpected URL ${u}`);
  }) as typeof fetch;
  try {
    await storage.createTicket({ id: 'custom-test', title: 'Demo', customer: 'Acme', startDate: '2026-11-19', endDate: '2026-11-20' });
    const watcher = createProactiveWatcher({ now: () => time, minAnalysisMs: 1000, minMessageMs: 3600000 });
    await watcher.tick();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].channel, 'DOWNER');
    assert.equal(modelInput.snapshots.chart.tickets[0].customer, 'Acme');
    assert.equal(modelInput.snapshots.granola.notes[0].summary, 'Prepare the demo');
    assert.equal(modelInput.snapshots['slack:Acme'].matches[0].text, 'Demo ready');
    assert.equal(modelInput.snapshots.linear.issues[0].identifier, 'IT-1');
    assert.equal((await getConversation('DOWNER'))[0].reply, sent[0].markdown_text);
    time += 60000;
    await storage.updateTicket('custom-test', { title: 'Demo follow-up' });
    await watcher.tick();
    assert.equal(sent.length, 1, 'changed evidence waits through the cooldown');
    time += 3600000;
    await watcher.tick();
    assert.equal(sent.length, 2);
    assert.equal(generated, 2);
    time += 60000;
    await watcher.tick();
    assert.equal(sent.length, 2, 'unchanged evidence does not send again');
    watcher.stop();
    time += 3600000;
    const restarted = createProactiveWatcher({ now: () => time, minAnalysisMs: 1000, minMessageMs: 3600000 });
    await restarted.tick();
    assert.equal(sent.length, 3, 'unchanged evidence receives a periodic check-in after restart');
    assert.match(sent[2].markdown_text, /Demo follow-up/);
    assert.equal(modelInput.changedSources.length, 0);
    assert.equal((await getConversation('DOWNER')).at(-1)?.reply, sent[2].markdown_text);
    await restarted.tick();
    assert.equal(sent.length, 3, 'check-in respects the persisted cooldown');
    restarted.stop();
    process.env.GANDALF_SEARCH_OWNER = 'UOTHER';
    const invalid = createProactiveWatcher({ now: () => time });
    await invalid.tick();
    assert.equal(sent.length, 3, 'mismatched owner receives no message');
  } finally { globalThis.fetch = originalFetch; await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
