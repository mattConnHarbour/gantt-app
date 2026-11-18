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
process.env.OPENAI_REASONING_EFFORT = 'high';
const { slackRoutes } = await import('../src/routes/slack.js');
const { validDate } = await import('../src/services/gandalf.js');
const storage = await import('../src/services/storage.js');
const { canSearch, searchSlack, searchGranola, searchPylon } = await import('../src/services/search.js');

test('signed Slack events create one task and reject forged requests', async () => {
  const app = Fastify();
  await app.register(slackRoutes);
  const posts: any[] = [];
  let modelPlan: any = { action: 'schedule', reply: '', tasks: [{ customer: 'Acme', title: 'Fix export', startDate: '2026-11-19', endDate: '2026-11-20' }] };
  let modelInput: any;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('conversations.history')) return Response.json({ ok: true, messages: [{ ts: '1794931300.000001', user: 'U1', text: 'Schedule Acme export on November 20' }] });
    if (String(url).includes('openai.com')) { const request = JSON.parse(String(init?.body)); if (request.text.format.name === 'reasoning_route') return Response.json({status:'completed', output:[{content:[{type:'output_text',text:'{\"tier\":\"high\"}'}]}]}); assert.equal(request.reasoning.effort, 'high'); modelInput = JSON.parse(request.input); return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(modelPlan) }] }] }); }
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
    modelPlan = { action: 'reply', reply: 'Acme has Fix export on the chart.', tasks: [] };
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
    assert.deepEqual(await searchPylon('123'), { error: 'Pylon is not connected.' });
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
    process.env.PYLON_API_TOKEN = 'test-pylon';
    const methods: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const endpoint = String(url);
      methods.push(`${init?.method || 'GET'} ${new URL(endpoint).pathname}`);
      if (endpoint.endsWith('/issues/search')) {
        const filter = JSON.parse(String(init?.body)).filter;
        assert.equal(filter.operator, 'or');
        assert.equal(filter.subfilters[0].value, 'Acme');
        return Response.json({ data: [{ id: 'a', number: 1, title: 'Acme issue', body_html: 'Issue body' }], pagination: { has_next_page: true } });
      }
      if (endpoint.includes('/messages')) return Response.json({ data: [{ id: 'm1', body_html: 'Details', is_private: true }], pagination: { has_next_page: false } });
      if (endpoint.endsWith('/issues/123')) return Response.json({ data: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', number: 123, title: 'Example' } });
      throw new Error('Unexpected Pylon request');
    }) as typeof fetch;
    const pylonResults = await searchPylon('Acme') as any;
    assert.equal(pylonResults.matches[0].number, 1);
    assert.equal(pylonResults.incomplete, true);
    assert.match(pylonResults.coverage, /not full conversation/);
    const pylonIssue = await searchPylon('#123') as any;
    assert.equal(pylonIssue.issue.number, 123);
    assert.equal(pylonIssue.messages[0].body_html, 'Details');
    assert.ok(methods.every(method => method.startsWith('GET ') || method === 'POST /issues/search'));

    let modelCalls = 0;
    process.env.OPENAI_LOW_MODEL = 'low-test-model';
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('conversations.history')) return Response.json({ ok: true, messages: [] });
      if (String(url).includes('auth.test')) return Response.json({ ok: true, user_id: 'U1', team_id: 'T1' });
      if (String(url).includes('search.messages')) return Response.json({ ok: true, messages: { matches: [{ text: 'Acme demo is ready', permalink: 'https://example.com/message' }], total: 1 } });
      if (String(url).includes('openai.com')) {
        const request = JSON.parse(String(init?.body));
        if (request.text.format.name === 'reasoning_route') return Response.json({status:'completed', output:[{content:[{type:'output_text',text:'{\"tier\":\"low\"}'}]}]});
        assert.equal(request.reasoning.effort, 'low');
        assert.equal(request.model, 'low-test-model');
        const payload = JSON.parse(request.input);
        modelCalls++;
        const plan = modelCalls === 1
          ? { action: 'search', reply: '', slackQuery: 'Acme demo', granolaQuery: null, tasks: [] }
          : { action: 'reply', reply: `Found: ${payload.searchResults.slack.matches[0].text}`, slackQuery: null, granolaQuery: null, tasks: [] };
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
    const multiEvent = { type: 'message', channel_type: 'im', user: 'U1', channel: 'D2', ts: '1794931700.000001', text: 'Schedule the two Acme tasks' };
    const multiItems = [
      { customer: 'Acme', title: 'Task A', startDate: '2026-11-20', endDate: '2026-11-21' },
      { customer: 'Acme', title: 'Task B', startDate: '2026-11-22', endDate: '2026-11-23' },
    ];
    const { handleMention } = await import('../src/services/gandalf.js');
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('conversations.history')) return Response.json({ ok: true, messages: [] });
      if (String(url).includes('openai.com')) { const request = JSON.parse(String(init?.body)); if (request.text.format.name === 'reasoning_route') return Response.json({status:'completed', output:[{content:[{type:'output_text',text:'{\"tier\":\"high\"}'}]}]}); return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(modelPlan) }] }] }); }
      if (String(url).includes('chat.postMessage')) { posts.push(JSON.parse(String(init?.body))); return Response.json({ ok: true }); }
      throw new Error('Unexpected multi-task request');
    }) as typeof fetch;
    modelPlan = { action: 'schedule', reply: '', tasks: multiItems };
    await handleMention('EvMultiple', multiEvent);
    assert.equal((await storage.getAllTickets()).length, 4);
    assert.match(posts.at(-1).text, /Scheduled 2 items/);
    assert.match(posts.at(-1).text, /Task A/);
    assert.match(posts.at(-1).text, /Task B/);
    await handleMention('EvMultiple', multiEvent);
    assert.equal((await storage.getAllTickets()).length, 4, 'retries do not duplicate tasks');
    modelPlan = { action: 'schedule', reply: 'When is Task B due?', tasks: [multiItems[0], { ...multiItems[1], endDate: null }] };
    await handleMention('EvIncomplete', multiEvent);
    assert.equal((await storage.getAllTickets()).length, 4, 'an incomplete batch is not partially created');
    assert.match(posts.at(-1).text, /item 2/);
    assert.match(posts.at(-1).text, /When is Task B due/);
  } finally { globalThis.fetch = originalFetch; await app.close(); await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
