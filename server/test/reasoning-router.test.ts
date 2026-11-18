import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseReasoning } from '../src/services/reasoning-router.js';

test('routes a request with context, and falls back to high when the router fails', async () => {
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test';
  process.env.OPENAI_MODEL = 'high-model';
  process.env.OPENAI_REASONING_EFFORT = 'high';
  process.env.OPENAI_LOW_MODEL = 'low-model';
  let tier = 'low';
  let received: any;
  globalThis.fetch = (async (_url, options) => {
    received = JSON.parse(String(options?.body));
    return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ tier }) }] }] });
  }) as typeof fetch;
  try {
    const prior = [{ prompt: 'Analyze the customer risks', reply: 'Here are the risks.' }];
    const low = await chooseReasoning([{ user: 'U1', text: 'Thanks' }], prior, 'Thanks');
    assert.deepEqual(low, { tier: 'low', model: 'low-model', effort: 'low' });
    assert.equal(JSON.parse(received.input).recentTurns[0].prompt, prior[0].prompt);
    assert.equal(received.text.format.name, 'reasoning_route');
    tier = 'high';
    assert.deepEqual(await chooseReasoning([], prior, 'Compare the tradeoffs'), { tier: 'high', model: 'high-model', effort: 'high' });
    tier = 'unknown';
    assert.equal((await chooseReasoning([], [], 'hello')).tier, 'high');
    globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
    assert.equal((await chooseReasoning([], [], 'hello')).tier, 'high');
  } finally { globalThis.fetch = originalFetch; }
});
