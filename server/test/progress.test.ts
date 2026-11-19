import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.GANTT_DATA_DIR = await mkdtemp(join(tmpdir(), 'gandalf-progress-'));
process.env.OPENAI_API_KEY = 'test-key';
process.env.SLACK_BOT_TOKEN = 'test-token';
process.env.SLACK_SEARCH_TOKEN = 'test-search-token';
process.env.SLACK_TEAM_ID = 'T1';
process.env.GANDALF_SEARCH_OWNER = 'U1';
process.env.OPENAI_LOW_MODEL = 'low-model';
const { handleMention } = await import('../src/services/gandalf.js');
const { safeMarkdown } = await import('../src/services/slack-format.js');

test('high reasoning provides safe progress updates and a formatted final answer', async () => {
  const calls: { method: string; body: any }[] = [];
  const originalFetch = globalThis.fetch;
  let responses = 0;
  const result = (value: unknown) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const endpoint = String(url);
    if (endpoint.includes('conversations.history')) return Response.json({ ok: true, messages: [] });
    if (endpoint.includes('auth.test')) return Response.json({ ok: true, user_id: 'U1', team_id: 'T1' });
    if (endpoint.includes('search.messages')) return Response.json({ ok: true, messages: { matches: [{ text: 'Ready', permalink: 'https://example.com/source' }], total: 1 } });
    if (endpoint.includes('openai.com')) {
      const request = JSON.parse(String(init?.body));
      if (request.text.format.name === 'reasoning_route') return result({ tier: 'high' });
      if (request.text.format.name === 'progress_update') {
        assert.equal(request.model, 'low-model');
        assert.equal(request.reasoning.effort, 'low');
        assert.equal(request.max_output_tokens, 250);
        return result({ message: 'I’ll review the relevant context.' });
      }
      responses++;
      return result(responses === 1
        ? { action: 'search', reply: '', slackQuery: 'Acme', granolaQuery: null, pylonQuery: null, tasks: [] }
        : { action: 'reply', reply: '## Summary\n**Ready** — [source](https://example.com/source)', slackQuery: null, granolaQuery: null, pylonQuery: null, tasks: [] });
    }
    if (endpoint.includes('chat.postMessage') || endpoint.includes('chat.update')) {
      const body = JSON.parse(String(init?.body));
      calls.push({ method: endpoint.split('/').at(-1)!, body });
      return Response.json({ ok: true, channel: body.channel, ts: body.ts || '123.456' });
    }
    throw new Error(`Unexpected request: ${endpoint}`);
  }) as typeof fetch;
  try {
    await handleMention('EvProgress', { type: 'message', channel_type: 'im', user: 'U1', channel: 'D1', ts: '1794931600.000001', text: 'Analyze Acme and search Slack' });
    assert.deepEqual(calls.map(call => call.method), ['chat.postMessage', 'chat.update', 'chat.postMessage', 'chat.update']);
    assert.match(calls[0].body.markdown_text, /review/);
    assert.match(calls[1].body.markdown_text, /checking Slack/);
    assert.equal(calls[2].body.markdown_text, '## Summary\n**Ready** — [source](https://example.com/source)');
    assert.equal(calls[2].body.text, undefined);
    assert.match(calls[3].body.markdown_text, /Finished/);
    assert.equal(safeMarkdown('**Important** <@U1> & <!channel>'), '**Important** &lt;@U1&gt; &amp; &lt;!channel&gt;');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(process.env.GANTT_DATA_DIR!, { recursive: true, force: true });
  }
});
