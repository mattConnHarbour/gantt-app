import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.GANTT_DATA_DIR = await mkdtemp(join(tmpdir(), 'gandalf-ci-'));
Object.assign(process.env, { OPENAI_API_KEY: 'test', SLACK_BOT_TOKEN: 'test', GANDALF_SEARCH_OWNER: 'UOWNER', GANDALF_DEMOS_GITHUB_TOKEN: 'test-token' });
const { handleMention } = await import('../src/services/gandalf.js');
test('CI fixing requires an explicit request in the owner DM', async () => {
  const original = globalThis.fetch; const posts: string[] = []; let github = 0;
  const answer = (v: unknown) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(v) }] }] });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('conversations.history')) return Response.json({ ok: true, messages: [] });
    if (u.includes('chat.postMessage')) { posts.push(JSON.parse(String(init?.body)).markdown_text); return Response.json({ ok: true }); }
    if (u.includes('openai.com')) { const b = JSON.parse(String(init?.body)); if (b.text.format.name === 'reasoning_route') return answer({ tier: 'low' }); return answer({ action: 'fix_ci', reply: '', tasks: [] }); }
    if (u.includes('api.github.com')) { github++; if (u.endsWith('/commits/main')) return Response.json({ sha: 'a'.repeat(40) }); return Response.json({ workflow_runs: [] }); }
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try {
    const base = { type: 'message', ts: '1794931600.000001', text: 'Please fix the demos CI' };
    await handleMention('Other', { ...base, channel_type: 'im', channel: 'D2', user: 'UOTHER' }); assert.equal(github, 0);
    await handleMention('Channel', { ...base, type: 'app_mention', channel_type: 'channel', channel: 'C1', user: 'UOWNER' }); assert.equal(github, 0);
    await handleMention('Advice', { ...base, channel_type: 'im', channel: 'D1', user: 'UOWNER', text: 'How do I fix CI?' }); assert.equal(github, 0);
    await handleMention('Owner', { ...base, channel_type: 'im', channel: 'D1', user: 'UOWNER' }); assert.equal(github, 2); assert.match(posts.at(-1)!, /No current failing/);
  } finally { globalThis.fetch = original; await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
