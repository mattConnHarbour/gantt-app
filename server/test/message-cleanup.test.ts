import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.GANTT_DATA_DIR = await mkdtemp(join(tmpdir(), 'gandalf-cleanup-'));
Object.assign(process.env, { OPENAI_API_KEY: 'test', SLACK_BOT_TOKEN: 'test', SLACK_BOT_USER_ID: 'UBOT' });
const { handleMention } = await import('../src/services/gandalf.js');

test('cleanup can change only verified bot messages in the current thread', async () => {
  const original = globalThis.fetch; const writes: { method: string; body: any }[] = [];
  const answer = (v: unknown) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(v) }] }] });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const endpoint = String(url);
    if (endpoint.includes('conversations.replies')) return Response.json({ ok: true, messages: [
      { ts: '100.000001', user: 'UBOT', bot_id: 'BBOT', text: 'Thread parent' },
      { ts: '101.000001', user: 'UBOT', bot_id: 'BBOT', text: 'Old bot reply' },
      { ts: '102.000001', user: 'UOTHER', text: 'Other person' },
      { ts: '103.000001', user: 'UOTHERBOT', bot_id: 'BOTHER', text: 'Another bot' },
      { ts: '104.000001', user: 'UBOT', bot_id: 'BBOT', text: 'Latest bot reply' },
      { ts: '105.000001', user: 'UOWNER', text: 'Delete old replies' },
    ] });
    if (endpoint.includes('auth.test')) return Response.json({ ok: true, user_id: 'UBOT', bot_id: 'BBOT' });
    if (endpoint.includes('openai.com')) {
      const b = JSON.parse(String(init?.body));
      if (b.text.format.name === 'reasoning_route') return answer({ tier: 'low' });
      return answer({ action: 'manage_messages', messageActions: [
        { action: 'delete', ts: '101.000001', text: null },
        { action: 'delete', ts: '102.000001', text: null },
        { action: 'edit', ts: '103.000001', text: 'redacted' },
        { action: 'delete', ts: '100.000001', text: null },
        { action: 'delete', ts: '999.000001', text: null },
        { action: 'delete', ts: '101.000001', text: null },
        { action: 'delete', ts: '104.000001', text: null },
      ], reply: '', tasks: [] });
    }
    if (endpoint.includes('chat.')) { const body = JSON.parse(String(init?.body)); writes.push({ method: endpoint.split('/').at(-1)!, body }); return Response.json({ ok: true }); }
    throw new Error('Unexpected endpoint');
  }) as typeof fetch;
  try {
    await handleMention('EvCleanup', { type: 'message', channel_type: 'channel', channel: 'C1', thread_ts: '100.000001', ts: '105.000001', user: 'UOWNER', text: 'Gandalf, delete your old replies except the latest' });
    const deletes = writes.filter(x => x.method === 'chat.delete');
    assert.equal(deletes.length, 1); assert.equal(deletes[0].body.ts, '101.000001'); assert.equal(deletes[0].body.channel, 'C1');
    assert.equal(writes.filter(x => x.method === 'chat.update').length, 0);
    assert.match(writes.at(-1)!.body.markdown_text, /couldn’t change 6/);
  } finally { globalThis.fetch = original; await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});

test('automatic cleanup preserves the latest bot message and the normal answer', async () => {
  const original = globalThis.fetch; const writes: { method: string; body: any }[] = [];
  const answer = (v: unknown) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(v) }] }] });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const endpoint = String(url);
    if (endpoint.includes('conversations.history')) return Response.json({ ok: true, messages: [
      { ts: '104.000001', user: 'UBOT', bot_id: 'BBOT', text: 'Latest bot reply' },
      { ts: '101.000001', user: 'UBOT', bot_id: 'BBOT', text: 'Redundant old reply' },
    ] });
    if (endpoint.includes('auth.test')) return Response.json({ ok: true, user_id: 'UBOT', bot_id: 'BBOT' });
    if (endpoint.includes('openai.com')) {
      const b = JSON.parse(String(init?.body));
      if (b.text.format.name === 'reasoning_route') return answer({ tier: 'low' });
      return answer({ action: 'reply', reply: 'Here is my answer.', messageActions: [
        { action: 'edit', ts: '101.000001', text: 'Shorter reply' },
        { action: 'delete', ts: '104.000001', text: null },
      ], tasks: [] });
    }
    if (endpoint.includes('chat.')) { const body = JSON.parse(String(init?.body)); writes.push({ method: endpoint.split('/').at(-1)!, body }); return Response.json({ ok: true }); }
    throw new Error('Unexpected endpoint');
  }) as typeof fetch;
  try {
    await handleMention('EvAutomatic', { type: 'message', channel_type: 'im', channel: 'D1', ts: '105.000001', user: 'UOWNER', text: 'What do you think?' });
    assert.deepEqual(writes.map(x => x.method), ['chat.update', 'chat.postMessage']);
    assert.equal(writes[0].body.ts, '101.000001'); assert.equal(writes[0].body.markdown_text, 'Shorter reply');
    assert.equal(writes[1].body.markdown_text, 'Here is my answer.');
  } finally { globalThis.fetch = original; await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true }); }
});
