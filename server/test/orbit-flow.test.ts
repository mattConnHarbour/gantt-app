import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.GANTT_DATA_DIR = await mkdtemp(join(tmpdir(), 'gandalf-orbit-'));
Object.assign(process.env, { OPENAI_API_KEY: 'test-openai', SLACK_BOT_TOKEN: 'test-slack', ORBIT_GITHUB_TOKEN: 'private-test-token', GANDALF_SEARCH_OWNER: 'UOWNER' });
const { handleMention } = await import('../src/services/gandalf.js');

test('Orbit is available only in the owner DM, and its pinned evidence reaches the model', async () => {
  const original = globalThis.fetch;
  let githubCalls = 0;
  let sent: string[] = [];
  let seenEvidence = false;
  const sha = 'a'.repeat(40);
  const response = (value: unknown) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    const u = String(url);
    if (u.includes('conversations.history')) return Response.json({ ok: true, messages: [] });
    if (u.includes('openai.com')) {
      const body = JSON.parse(String(options?.body));
      assert.ok(!JSON.stringify(body).includes('private-test-token'));
      if (body.text.format.name === 'reasoning_route') return response({ tier: 'high' });
      if (body.text.format.name === 'progress_update') return response({ message: 'I’ll inspect the code.' });
      const input = JSON.parse(body.input);
      if (input.searchResults) {
        assert.equal(input.searchResults.orbit.commit, sha);
        assert.match(input.searchResults.orbit.content, /example/);
        seenEvidence = true;
        return response({ action: 'reply', reply: 'Found the example.', slackQuery: null, granolaQuery: null, pylonQuery: null, orbitQuery: null, orbitPath: null, tasks: [] });
      }
      return response({ action: 'search', reply: '', slackQuery: null, granolaQuery: null, pylonQuery: null, orbitQuery: null, orbitPath: 'src/example.ts', tasks: [] });
    }
    if (u.endsWith('/commits/main')) { githubCalls++; return Response.json({ sha }); }
    if (u.includes('/contents/src/example.ts')) { githubCalls++; return Response.json({ type: 'file', encoding: 'base64', size: 7, content: Buffer.from('example').toString('base64') }); }
    if (u.includes('chat.postMessage')) { const body = JSON.parse(String(options?.body)); sent.push(body.markdown_text); return Response.json({ ok: true }); }
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try {
    await handleMention('EvChannel', { type: 'app_mention', channel_type: 'channel', channel: 'C1', user: 'UOWNER', ts: '1794931600.000001', text: 'Read the Orbit code' });
    assert.equal(githubCalls, 0);
    assert.match(sent.at(-1)!, /only in the configured owner/);
    sent = [];
    await handleMention('EvOwner', { type: 'message', channel_type: 'im', channel: 'D1', user: 'UOWNER', ts: '1794931700.000001', text: 'Read the Orbit code' });
    assert.equal(githubCalls, 2);
    assert.equal(seenEvidence, true);
    assert.equal(sent.at(-1), 'Found the example.');
  } finally { globalThis.fetch = original; await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
