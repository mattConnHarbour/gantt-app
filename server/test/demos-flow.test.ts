import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.GANTT_DATA_DIR = await mkdtemp(join(tmpdir(), 'gandalf-demos-'));
Object.assign(process.env, { OPENAI_API_KEY: 'test-openai', SLACK_BOT_TOKEN: 'test-slack', GANDALF_SEARCH_OWNER: 'UOWNER', GANDALF_DEMOS_GITHUB_TOKEN: 'test-token' });
const { handleMention } = await import('../src/services/gandalf.js');
test('demos repository is accessible only in the owner DM and its evidence reaches Gandalf', async () => {
  const original = globalThis.fetch; let githubCalls = 0; const posts: string[] = [];
  const response = (v: unknown) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(v) }] }] });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('conversations.history')) return Response.json({ ok: true, messages: [] });
    if (u.includes('chat.postMessage')) { posts.push(JSON.parse(String(init?.body)).markdown_text); return Response.json({ ok: true }); }
    if (u.includes('openai.com')) {
      const request = JSON.parse(String(init?.body));
      if (request.text.format.name === 'reasoning_route') return response({ tier: 'high' });
      if (request.text.format.name === 'progress_update') return response({ message: 'I’ll check the repository.' });
      const input = JSON.parse(request.input);
      if (input.searchResults) { assert.equal(input.searchResults.demos.pulls[0].number, 42); return response({ action: 'reply', reply: 'PR 42 is open.', tasks: [] }); }
      return response({ action: 'search', demosQuery: 'prs', slackQuery: null, granolaQuery: null, pylonQuery: null, orbitQuery: null, orbitPath: null, tasks: [] });
    }
    if (u.includes('api.github.com/repos/superdoc/demos/pulls?')) { githubCalls++; return Response.json([{ number: 42, title: 'Example', state: 'open', head: { sha: 'a'.repeat(40) } }]); }
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try {
    await handleMention('EvPublic', { type: 'app_mention', channel_type: 'channel', channel: 'C1', user: 'UOWNER', ts: '1794931600.000001', text: 'Show demos PRs' });
    assert.equal(githubCalls, 0); assert.match(posts.at(-1)!, /only in the configured owner/);
    await handleMention('EvOther', { type: 'message', channel_type: 'im', channel: 'D2', user: 'UOTHER', ts: '1794931650.000001', text: 'Show demos PRs' });
    assert.equal(githubCalls, 0);
    await handleMention('EvOwner', { type: 'message', channel_type: 'im', channel: 'D1', user: 'UOWNER', ts: '1794931700.000001', text: 'Show demos PRs' });
    assert.equal(githubCalls, 1); assert.equal(posts.at(-1), 'PR 42 is open.');
  } finally { globalThis.fetch = original; await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
