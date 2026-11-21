import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.GANTT_DATA_DIR = await mkdtemp(join(tmpdir(), 'gandalf-browser-test-'));
Object.assign(process.env, { OPENAI_API_KEY: 'test-openai', SLACK_BOT_TOKEN: 'test-slack', GANDALF_BROWSER_URL: 'http://browser.internal', GANDALF_BROWSER_SECRET: 'test-browser-key' });
const { handleMention } = await import('../src/services/gandalf.js');
const { browse } = await import('../src/services/browser.js');

test('uses isolated browser sessions and supplies screenshots as vision input', async () => {
  const original = globalThis.fetch; const actions: any[] = []; const posts: any[] = []; let modelCalls = 0;
  const response = (value: unknown) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const endpoint = String(url);
    if (endpoint.includes('conversations.history')) return Response.json({ ok: true, messages: [] });
    if (endpoint.includes('chat.postMessage')) { posts.push(JSON.parse(String(init?.body))); return Response.json({ ok: true }); }
    if (endpoint.includes('browser.internal')) { const action = JSON.parse(String(init?.body)); actions.push(action); return Response.json({ url: 'https://example.com/', title: 'Example', text: 'Example page', elements: [{ ref: 'e0', text: 'Next' }], screenshot: 'YWJj' }); }
    if (endpoint.includes('openai.com')) {
      const request = JSON.parse(String(init?.body));
      if (request.text.format.name === 'reasoning_route') return response({ tier: 'high' });
      if (request.text.format.name === 'progress_update') return response({ message: 'I’ll inspect the page.' });
      modelCalls++;
      if (modelCalls === 1) return response({ action: 'browse', browser: { action: 'open', url: 'https://example.com', ref: null, value: null }, tasks: [] });
      assert.equal(request.input[0].content[1].type, 'input_image');
      const evidence = JSON.parse(request.input[0].content[0].text);
      assert.equal(evidence.searchResults.browser.title, 'Example');
      assert.ok(!JSON.stringify(evidence).includes('YWJj'), 'screenshot is sent as an image, not text');
      if (modelCalls === 2) return response({ action: 'browse', browser: { action: 'click', url: null, ref: 'e0', value: null }, tasks: [] });
      return response({ action: 'reply', reply: 'The page has a Next button.', tasks: [] });
    }
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try {
    await handleMention('EvBrowser', { type: 'message', channel_type: 'im', channel: 'D1', user: 'U1', ts: '1794931600.000001', text: 'Open example.com and click Next' });
    assert.deepEqual(actions.map(a => a.action), ['open', 'click']);
    assert.equal(actions[0].session, actions[1].session);
    assert.equal(posts.at(-1).markdown_text, 'The page has a Next button.');
    await browse('D2', 'U1', { action: 'open', url: 'https://example.com', ref: null, value: null });
    assert.notEqual(actions[0].session, actions[2].session, 'sessions are isolated by conversation');
    await browse('D1', 'U2', { action: 'open', url: 'https://example.com', ref: null, value: null });
    assert.notEqual(actions[0].session, actions[3].session, 'sessions are isolated by user');
  } finally { globalThis.fetch = original; await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
