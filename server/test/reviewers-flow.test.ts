import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.GANTT_DATA_DIR = await mkdtemp(join(tmpdir(), 'gandalf-reviewers-'));
Object.assign(process.env, { OPENAI_API_KEY: 'test-key', SLACK_BOT_TOKEN: 'test-token' });
const { handleMention } = await import('../src/services/gandalf.js');

test('Gandalf can consult both advisers on a non-demo question and decide his own answer', async () => {
  const original = globalThis.fetch; const posts: string[] = []; const consulted: string[] = [];
  const answer = (value: unknown) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const endpoint = String(url);
    if (endpoint.includes('conversations.history')) return Response.json({ ok: true, messages: [] });
    if (endpoint.includes('chat.postMessage')) { posts.push(JSON.parse(String(init?.body)).markdown_text); return Response.json({ ok: true }); }
    if (endpoint.includes('openai.com')) {
      const body = JSON.parse(String(init?.body)); const name = body.text.format.name;
      if (name === 'reasoning_route') return answer({ tier: 'high' });
      if (name === 'progress_update') return answer({ message: 'I’ll consider the options.' });
      if (name === 'reviewer_opinion') { const who = body.instructions.includes('You are Bilbo') ? 'Bilbo' : 'Thorin'; consulted.push(who); assert.match(body.instructions, /no tools/); return answer({ opinion: `${who} has an opinion.` }); }
      const input = JSON.parse(body.input);
      if (!input.searchResults) return answer({ action: 'consult', reply: 'What are the tradeoffs?', tasks: [] });
      assert.equal(input.searchResults.reviewers.bilbo, 'Bilbo has an opinion.');
      assert.equal(input.searchResults.reviewers.thorin, 'Thorin has an opinion.');
      return answer({ action: 'reply', reply: 'My own assessment is different.', tasks: [] });
    }
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try {
    await handleMention('EvReview', { type: 'message', channel_type: 'im', channel: 'D1', user: 'U1', ts: '1794931600.000001', text: 'What do you think about this strategy?' });
    assert.deepEqual(consulted.sort(), ['Bilbo', 'Thorin']);
    assert.equal(posts.at(-1), 'My own assessment is different.');
  } finally { globalThis.fetch = original; await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
