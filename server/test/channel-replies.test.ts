import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
process.env.GANTT_DATA_DIR = await mkdtemp(join(tmpdir(), 'gandalf-channels-'));
Object.assign(process.env, { SLACK_SIGNING_SECRET: 'test-signing', SLACK_BOT_TOKEN: 'test-bot', SLACK_BOT_USER_ID: 'UBOT', SLACK_SEARCH_TOKEN: 'test-owner-search', SLACK_TEAM_ID: 'T1', GANDALF_SEARCH_OWNER: 'UOWNER', GANDALF_CHANNEL_REPLIES: 'true', GANDALF_CHANNEL_SEARCH: 'true', GRANOLA_API_KEY: 'test-granola', OPENAI_API_KEY: 'test-openai' });
const { slackRoutes } = await import('../src/routes/slack.js');
const storage = await import('../src/services/storage.js');

test('channel responses require relevance, deduplicate mentions, and protect unrelated sources', async () => {
  const app = Fastify(); await app.register(slackRoutes);
  const original = globalThis.fetch; const posts: any[] = []; let modelCalls = 0;
  const response = (value: unknown) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('conversations.history')) return Response.json({ ok: true, messages: [] });
    if (u.includes('conversations.replies')) {
      assert.equal((init?.headers as Record<string, string>)['Content-Type'], 'application/x-www-form-urlencoded');
      const params = new URLSearchParams(String(init?.body));
      assert.equal(params.get('channel'), 'C1'); assert.equal(params.get('ts'), '1794931800.000001');
      return Response.json({ ok: true, messages: [{ ts: '1794931800.000001', user: 'UOTHER', text: 'Original question' }, { ts: '1794931801.000001', user: 'UOTHER', text: 'Gandalf, hello' }] });
    }
    if (u.includes('auth.test')) return Response.json({ ok: true, user_id: 'UOWNER', team_id: 'T1' });
    if (u.includes('search.messages')) return Response.json({ ok: true, messages: { matches: [{ text: 'Customer update', permalink: 'https://example.com/message' }], total: 1 } });
    if (u.includes('granola.ai')) return Response.json({ notes: [{ title: 'Customer meeting' }], hasMore: false });
    if (u.includes('chat.postMessage')) { const body = JSON.parse(String(init?.body)); posts.push(body); return Response.json({ ok: true }); }
    if (u.includes('openai.com')) {
      const request = JSON.parse(String(init?.body));
      if (request.text.format.name === 'channel_relevance') return response({ reply: JSON.parse(request.input).message.includes('relevant') });
      if (request.text.format.name === 'reasoning_route') return response({ tier: 'low' });
      if (request.text.format.name === 'progress_update') return response({ message: 'I’ll review this.' });
      const input = JSON.parse(request.input); modelCalls++; const text = input.conversation.at(-1).text;
      if (text.includes('search')) {
        assert.equal(input.searchAvailable.slackGranola, true); assert.equal(input.searchAvailable.pylon, false);
        if (input.searchResults) {
          assert.equal(input.searchResults.slack.matches[0].text, 'Customer update');
          assert.equal(input.searchResults.granola.matches.length, 1);
          assert.match(input.searchResults.pylon.error, /only in the configured owner/);
          return response({ action: 'reply', reply: 'Found the update.', tasks: [] });
        }
        return response({ action: 'search', slackQuery: 'Customer', granolaQuery: 'Customer', pylonQuery: '123', orbitQuery: null, orbitPath: null, reply: '', tasks: [] });
      }
      if (text.includes('relevant')) return response({ action: 'schedule', reply: '', tasks: [{ customer: 'Acme', title: 'Task', startDate: '2026-11-20', endDate: '2026-11-20' }] });
      return response({ action: 'reply', reply: 'Hello.', tasks: [] });
    }
    throw new Error(`Unexpected request: ${u}`);
  }) as typeof fetch;
  const inject = async (id: string, event: any) => {
    const raw = JSON.stringify({ type: 'event_callback', team_id: 'T1', event_id: id, event });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac('sha256', 'test-signing').update(`v0:${timestamp}:${raw}`).digest('hex')}`;
    return app.inject({ method: 'POST', url: '/api/slack/events', headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': timestamp, 'x-slack-signature': signature }, payload: raw });
  };
  const waitFor = async (count: number) => { for (let i = 0; i < 100 && posts.length < count; i++) await new Promise(resolve => setTimeout(resolve, 10)); };
  try {
    const base = { type: 'message', channel_type: 'channel', channel: 'C1', user: 'UOTHER', ts: '1794931200.000001' };
    await inject('ignore', { ...base, text: 'Thanks everyone' }); await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(posts.length, 0); assert.equal(modelCalls, 0);
    await inject('relevant', { ...base, ts: '1794931300.000001', text: 'A relevant question' }); await waitFor(1);
    assert.match(posts.at(-1).markdown_text, /ask me directly/); assert.equal((await storage.getAllTickets()).length, 0);
    await inject('named', { ...base, ts: '1794931400.000001', text: 'Gandalf, hello' }); await waitFor(2); assert.equal(posts.at(-1).markdown_text, 'Hello.');
    const mention = { ...base, ts: '1794931500.000001', text: '<@UBOT> hello' };
    await inject('message-version', mention); await inject('mention-version', { ...mention, type: 'app_mention' }); await waitFor(3); await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(posts.length, 3, 'duplicate event delivery is processed once');
    await inject('search', { ...base, channel: 'C2', ts: '1794931600.000001', text: 'Gandalf, search for Customer' }); await waitFor(5);
    assert.equal(posts.at(-1).markdown_text, 'Found the update.'); assert.equal(posts.at(-1).channel, 'C2');
    await inject('other-dm', { ...base, channel_type: 'im', channel: 'DOTHER', ts: '1794931650.000001', text: 'Please search for Customer' }); await waitFor(7);
    assert.equal(posts.at(-1).markdown_text, 'Found the update.'); assert.equal(posts.at(-1).channel, 'DOTHER');
    await inject('bot-event', { ...base, ts: '1794931700.000001', bot_id: 'B1', text: 'Gandalf hello' }); await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(posts.length, 7);
    await inject('thread-reply', { ...base, ts: '1794931801.000001', thread_ts: '1794931800.000001', text: 'Gandalf, hello' }); await waitFor(8);
    assert.equal(posts.at(-1).markdown_text, 'Hello.'); assert.equal(posts.at(-1).thread_ts, '1794931800.000001');
  } finally { globalThis.fetch = original; await app.close(); await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
