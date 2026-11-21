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
  const original = globalThis.fetch; const actions: any[] = []; const posts: any[] = []; let modelCalls = 0; let bilboCalls = 0;
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
      if (request.text.format.name === 'bilbo_review') {
        bilboCalls++;
        const evidence = JSON.parse(request.input);
        assert.ok(evidence.browserEvidence.length >= 2);
        if (bilboCalls === 2) assert.equal(evidence.gandalfDraft, 'The page has a Next button.');
        return response({ review: 'The Next button is visible; verify what it does.' });
      }
      if (request.text.format.name === 'thorin_plan') {
        const input = typeof request.input === 'string' ? JSON.parse(request.input) : JSON.parse(request.input[0].content[0].text);
        if (input.observations.length === 1) return response({ action: 'click', ref: 'e0', value: null, assessment: 'Try Next.' });
        return response({ action: 'done', ref: null, value: null, assessment: 'Next worked.' });
      }
      assert.match(request.instructions, /Demo Impact Scorecard/);
      assert.match(request.instructions, /Relevance/);
      assert.match(request.instructions, /Clarity/);
      assert.match(request.instructions, /Differentiation/);
      assert.match(request.instructions, /task-specific testing script/);
      assert.match(request.instructions, /several distinct passes/);
      assert.match(request.instructions, /untested steps/);
      assert.ok(request.text.format.schema.properties.browser.anyOf[0].properties.action.enum.includes('reload'));
      modelCalls++;
      if (modelCalls === 1) return response({ action: 'browse', browser: { action: 'open', url: 'https://example.com', ref: null, value: null }, tasks: [] });
      if (typeof request.input === 'string') {
        const reviews = JSON.parse(request.input).searchResults;
        assert.match(reviews.bilboReview, /verify/);
        assert.equal(reviews.thorin.completed, true);
        assert.match(reviews.thorin.assessment, /Next worked/);
        return response({ action: 'reply', reply: 'The page has a Next button. Bilbo recommends checking its behavior; Thorin tried it.', tasks: [] });
      }
      assert.equal(request.input[0].content[1].type, 'input_image');
      const evidence = JSON.parse(request.input[0].content[0].text);
      assert.equal(evidence.searchResults.browser.title, 'Example');
      assert.ok(!JSON.stringify(evidence).includes('YWJj'), 'screenshot is sent as an image, not text');
      if (modelCalls === 2) return response({ action: 'browse', browser: { action: 'reload', url: null, ref: null, value: null }, tasks: [] });
      if (modelCalls === 3) return response({ action: 'browse', browser: { action: 'click', url: null, ref: 'e0', value: null }, tasks: [] });
      return response({ action: 'reply', reply: 'The page has a Next button.', tasks: [] });
    }
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try {
    await handleMention('EvBrowser', { type: 'message', channel_type: 'im', channel: 'D1', user: 'U1', ts: '1794931600.000001', text: 'Open example.com and click Next' });
    assert.deepEqual(actions.map(a => a.action), ['open', 'reload', 'click', 'open', 'click']);
    assert.equal(actions[0].session, actions[1].session);
    assert.notEqual(actions[0].session, actions[3].session, 'Thorin has a separate browser session');
    assert.equal(bilboCalls, 2);
    assert.match(posts.at(-1).markdown_text, /Bilbo recommends/);
    await browse('D2', 'U1', { action: 'open', url: 'https://example.com', ref: null, value: null });
    assert.notEqual(actions[0].session, actions[5].session, 'sessions are isolated by conversation');
    await browse('D1', 'U2', { action: 'open', url: 'https://example.com', ref: null, value: null });
    assert.notEqual(actions[0].session, actions[6].session, 'sessions are isolated by user');
  } finally { globalThis.fetch = original; await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});

test('a demo is not scored when Gandalf only opens it without interacting', async () => {
  const original = globalThis.fetch; const posts: string[] = []; let modelCalls = 0;
  const response = (value: unknown) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const endpoint = String(url);
    if (endpoint.includes('conversations.history')) return Response.json({ ok: true, messages: [] });
    if (endpoint.includes('chat.postMessage')) { posts.push(JSON.parse(String(init?.body)).markdown_text); return Response.json({ ok: true }); }
    if (endpoint.includes('browser.internal')) return Response.json({ url: 'https://example.com/', title: 'Example', text: 'Example page', elements: [] });
    if (endpoint.includes('openai.com')) {
      const request = JSON.parse(String(init?.body));
      if (request.text.format.name === 'reasoning_route') return response({ tier: 'high' });
      if (request.text.format.name === 'progress_update') return response({ message: 'I’ll inspect the demo.' });
      modelCalls++;
      if (modelCalls === 1) return response({ action: 'browse', browser: { action: 'open', url: 'https://example.com', ref: null, value: null }, tasks: [] });
      return response({ action: 'reply', reply: 'Relevance 5/5, Clarity 5/5, Differentiation 5/5.', tasks: [] });
    }
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try {
    await handleMention('EvNoInteraction', { type: 'message', channel_type: 'im', channel: 'D1', user: 'U1', ts: '1794931700.000001', text: 'Test this demo: https://example.com' });
    assert.match(posts.at(-1)!, /couldn’t complete an interaction/);
    assert.doesNotMatch(posts.at(-1)!, /5\/5/);
  } finally { globalThis.fetch = original; await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
