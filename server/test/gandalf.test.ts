import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';

process.env.GANTT_DATA_DIR = await mkdtemp(join(tmpdir(), 'gandalf-test-'));
process.env.SLACK_SIGNING_SECRET = 'test-secret';
process.env.SLACK_BOT_TOKEN = 'test-token';
process.env.OPENAI_API_KEY = 'test-key';
const { slackRoutes } = await import('../src/routes/slack.js');
const { validDate } = await import('../src/services/gandalf.js');
const storage = await import('../src/services/storage.js');
const { canSearch, searchSlack, searchGranola } = await import('../src/services/search.js');

test('signed Slack events create one task and reject forged requests', async () => {
  const app = Fastify();
  await app.register(slackRoutes);
  const posts: any[] = [];
  let modelPlan: any = { action: 'schedule', reply: '', customer: 'Acme', title: 'Fix export', startDate: '2026-11-19', endDate: '2026-11-20' };
  let modelInput: any;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('conversations.history')) return Response.json({ ok: true, messages: [{ ts: '1794931300.000001', user: 'U1', text: 'Schedule Acme export on November 20' }] });
    if (String(url).includes('openai.com')) { modelInput = JSON.parse(JSON.parse(String(init?.body)).input); return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(modelPlan) }] }] }); }
    if (String(url).includes('chat.postMessage')) { posts.push(JSON.parse(String(init?.body))); return Response.json({ ok: true }); }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  try {
    const raw = JSON.stringify({ type: 'event_callback', event_id: 'Ev123', event: { type: 'app_mention', user: 'U1', channel: 'C1', ts: '1794931200.000001', text: '<@Ubot> schedule Acme export' } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac('sha256', 'test-secret').update(`v0:${timestamp}:${raw}`).digest('hex')}`;
    const inject = (sig: string) => app.inject({ method: 'POST', url: '/api/slack/events', headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': timestamp, 'x-slack-signature': sig }, payload: raw });
    assert.equal((await inject('v0=' + '0'.repeat(64))).statusCode, 401);
    assert.equal((await inject(signature)).statusCode, 200);
    assert.equal((await inject(signature)).statusCode, 200);
    for (let i = 0; i < 100 && !posts.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
    const tickets = await storage.getAllTickets();
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].customer, 'Acme');
    assert.equal(tickets[0].title, 'Fix export');
    assert.equal(tickets[0].startDate, '2026-11-19');
    assert.match(posts[0].text, /Scheduled/);
    assert.equal(validDate('2026-02-30'), false);
    const dm = JSON.stringify({ type: 'event_callback', event_id: 'EvDM', event: { type: 'message', channel_type: 'im', user: 'U1', channel: 'D1', ts: '1794931300.000001', text: 'Schedule Acme export on November 20' } });
    const dmSignature = `v0=${createHmac('sha256', 'test-secret').update(`v0:${timestamp}:${dm}`).digest('hex')}`;
    assert.equal((await app.inject({ method: 'POST', url: '/api/slack/events', headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': timestamp, 'x-slack-signature': dmSignature }, payload: dm })).statusCode, 200);
    for (let i = 0; i < 100 && posts.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await storage.getAllTickets()).length, 2);
    assert.equal(posts[1].channel, 'D1');
    assert.equal(posts[1].thread_ts, undefined);
    const botEvent = JSON.stringify({ type: 'event_callback', event_id: 'EvBot', event: { type: 'message', channel_type: 'im', subtype: 'bot_message', bot_id: 'B1', user: 'U1', channel: 'D1', ts: '1794931400.000001', text: 'Scheduled' } });
    const botSignature = `v0=${createHmac('sha256', 'test-secret').update(`v0:${timestamp}:${botEvent}`).digest('hex')}`;
    await app.inject({ method: 'POST', url: '/api/slack/events', headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': timestamp, 'x-slack-signature': botSignature }, payload: botEvent });
    assert.equal(posts.length, 2);
    modelPlan = { action: 'reply', reply: 'Acme has Fix export on the chart.', customer: null, title: null, startDate: null, endDate: null };
    const question = JSON.stringify({ type: 'event_callback', event_id: 'EvQuestion', event: { type: 'message', channel_type: 'im', user: 'U1', channel: 'D1', ts: '1794931500.000001', text: 'What is on the chart for Acme?' } });
    const questionSignature = `v0=${createHmac('sha256', 'test-secret').update(`v0:${timestamp}:${question}`).digest('hex')}`;
    await app.inject({ method: 'POST', url: '/api/slack/events', headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': timestamp, 'x-slack-signature': questionSignature }, payload: question });
    for (let i = 0; i < 100 && posts.length < 3; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.match(posts[2].text, /Acme has Fix export/);
    assert.equal((await storage.getAllTickets()).length, 2);
    assert.equal(modelInput.chart[0].customer, 'Acme');
    assert.equal(modelInput.priorGandalfTurns.length, 1);
    assert.equal(modelInput.priorGandalfTurns[0].prompt, 'Schedule Acme export on November 20');
    assert.equal(modelInput.conversation.at(-1).text, 'What is on the chart for Acme?');
    process.env.GANDALF_SEARCH_OWNER = 'U1';
    assert.equal(canSearch('im', 'U1'), true);
    assert.equal(canSearch('channel', 'U1'), false);
    assert.equal(canSearch('im', 'U2'), false);
    assert.deepEqual(await searchSlack('Acme', 'U1'), { error: 'Slack search is not connected.' });
    assert.deepEqual(await searchGranola('Acme'), { error: 'Granola search is not connected.' });
    process.env.SLACK_SEARCH_TOKEN = 'search-token';
    process.env.SLACK_TEAM_ID = 'T1';
    process.env.GRANOLA_API_KEY = 'granola-test';
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes('auth.test')) return Response.json({ ok: true, user_id: 'U2', team_id: 'T1' });
      if (String(url).includes('granola.ai')) return Response.json({ notes: [{ title: 'Acme roadmap', id: 'not_test', summary: 'Demo plan' }], hasMore: false });
      throw new Error('Unexpected search request');
    }) as typeof fetch;
    assert.match((await searchSlack('Acme', 'U1') as any).error, /does not belong/);
    const found = await searchGranola('Acme') as any;
    assert.equal(found.matches.length, 1);
    assert.equal(found.incomplete, false);
    let modelCalls = 0;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('conversations.history')) return Response.json({ ok: true, messages: [] });
      if (String(url).includes('auth.test')) return Response.json({ ok: true, user_id: 'U1', team_id: 'T1' });
      if (String(url).includes('search.messages')) return Response.json({ ok: true, messages: { matches: [{ text: 'Acme demo is ready', permalink: 'https://example.com/message' }], total: 1 } });
      if (String(url).includes('openai.com')) {
        const payload = JSON.parse(JSON.parse(String(init?.body)).input);
        modelCalls++;
        const plan = modelCalls === 1
          ? { action: 'search', reply: '', slackQuery: 'Acme demo', granolaQuery: null, customer: null, title: null, startDate: null, endDate: null }
          : { action: 'reply', reply: `Found: ${payload.searchResults.slack.matches[0].text}`, slackQuery: null, granolaQuery: null, customer: null, title: null, startDate: null, endDate: null };
        return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(plan) }] }] });
      }
      if (String(url).includes('chat.postMessage')) { posts.push(JSON.parse(String(init?.body))); return Response.json({ ok: true }); }
      throw new Error('Unexpected search flow request');
    }) as typeof fetch;
    const searchEvent = JSON.stringify({ type: 'event_callback', team_id: 'T1', event_id: 'EvSearch', event: { type: 'message', channel_type: 'im', user: 'U1', channel: 'D1', ts: '1794931600.000001', text: 'Find Slack messages about the Acme demo' } });
    const searchSignature = `v0=${createHmac('sha256', 'test-secret').update(`v0:${timestamp}:${searchEvent}`).digest('hex')}`;
    await app.inject({ method: 'POST', url: '/api/slack/events', headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': timestamp, 'x-slack-signature': searchSignature }, payload: searchEvent });
    for (let i = 0; i < 100 && posts.length < 4; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(modelCalls, 2);
    assert.match(posts[3].text, /Acme demo is ready/);
    assert.equal((await storage.getAllTickets()).length, 2);
  } finally { globalThis.fetch = originalFetch; await app.close(); await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
