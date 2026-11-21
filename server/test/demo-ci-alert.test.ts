import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDemoFailure, verifyDemoFailure } from '../src/services/demo-ci-alert.js';

test('accepts only a single exact demos failure link in the selected channel', () => {
  const event = { channel: 'C0CGVHH8R46', ts: '1795278843.416259', text: ':x: *[PRODUCTION] SuperDoc demos — FAILURE*\n<https://github.com/superdoc/demos/actions/runs/123/attempts/2|View workflow logs>' };
  assert.deepEqual(parseDemoFailure(event), { channel: event.channel, messageTs: event.ts, runId: '123', attempt: 2 });
  assert.equal(parseDemoFailure({ ...event, channel: 'COTHER' }), null);
  assert.equal(parseDemoFailure({ ...event, text: event.text.replace('FAILURE', 'SUCCESS') }), null);
  assert.equal(parseDemoFailure({ ...event, text: event.text.replace('github.com/superdoc/demos', 'github.com/other/demos') }), null);
  assert.equal(parseDemoFailure({ ...event, text: `${event.text} https://github.com/superdoc/demos/actions/runs/456` }), null);
});

test('independently verifies completed failed main-branch runs and the exact attempt', async () => {
  const original = globalThis.fetch;
  let run: any = { id: 123, run_attempt: 2, repository: { full_name: 'superdoc/demos' }, head_branch: 'main', status: 'completed', conclusion: 'failure', head_sha: 'a'.repeat(40) };
  globalThis.fetch = (async () => Response.json(run)) as typeof fetch;
  const alert = { channel: 'C0CGVHH8R46', messageTs: '1.1', runId: '123', attempt: 2 };
  try {
    assert.deepEqual(await verifyDemoFailure(alert), { verified: true, sha: 'a'.repeat(40) });
    for (const change of [{ conclusion: 'success' }, { status: 'in_progress' }, { head_branch: 'other' }, { run_attempt: 1 }, { repository: { full_name: 'other/repo' } }]) {
      const saved = run; run = { ...saved, ...change }; assert.equal((await verifyDemoFailure(alert)).verified, false); run = saved;
    }
    globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
    assert.equal((await verifyDemoFailure(alert)).verified, false);
  } finally { globalThis.fetch = original; }
});
