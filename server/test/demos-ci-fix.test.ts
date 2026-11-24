import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposeDemosCiFix } from '../src/services/demos-ci-fix.js';
const sha = 'a'.repeat(40), treeSha = 'b'.repeat(40), fileSha = 'c'.repeat(40);
const run = { id: 123, workflow_id: 7, run_attempt: 1, name: 'Validate', head_sha: sha, head_branch: 'main', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/superdoc/demos/actions/runs/123', repository: { full_name: 'superdoc/demos' } };
const answer = (value: unknown) => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });

test('verified current CI failure yields an isolated draft PR without executing repository code', async () => {
  const original = globalThis.fetch; Object.assign(process.env, { OPENAI_API_KEY: 'test-openai', GANDALF_DEMOS_GITHUB_TOKEN: 'test-token' });
  const writes: { url: string; body: any }[] = []; let modelCalls = 0; let reviewApproved = true; let tryWorkflowEdit = false;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url), method = init?.method || 'GET';
    if (u.includes('openai.com')) { const req = JSON.parse(String(init?.body)); if (req.text.format.name === 'demos_ci_review') return answer({ approved: reviewApproved, feedback: 'Review result.' }); assert.match(req.instructions, /cannot execute code/); modelCalls++; const path = tryWorkflowEdit ? '.github/workflows/ci.yml' : 'src/app.ts'; return answer(modelCalls === 1 ? { action: 'read', paths: [path], files: [], title: '', rationale: '' } : { action: 'propose', paths: [], files: [{ path, content: 'export const fixed = true;\n' }], title: 'Fix CI', rationale: 'Correct the failing source.' }); }
    if (method === 'POST') { const body = JSON.parse(String(init?.body)); writes.push({ url: u, body }); if (u.endsWith('/git/blobs')) return Response.json({ sha: fileSha }); if (u.endsWith('/git/trees')) return Response.json({ sha: treeSha }); if (u.endsWith('/git/commits')) return Response.json({ sha: fileSha }); if (u.endsWith('/git/refs')) return Response.json({ ref: body.ref }); if (u.endsWith('/pulls')) return Response.json({ number: 44, html_url: 'https://github.com/superdoc/demos/pull/44' }); }
    if (u.endsWith('/commits/main')) return Response.json({ sha, commit: { tree: { sha: treeSha } } });
    if (u.includes('/actions/runs?')) return Response.json({ workflow_runs: [run] });
    if (u.endsWith('/actions/runs/123/attempts/1')) return Response.json(run);
    if (u.endsWith('/actions/runs/123')) return Response.json(run);
    if (u.includes('/actions/runs/123/attempts/1/jobs?')) return Response.json({ jobs: [{ id: 11, name: 'build', conclusion: 'failure' }] });
    if (u.endsWith('/actions/jobs/11/logs')) return new Response('Error: failed build');
    if (u.endsWith(`/git/trees/${sha}?recursive=1`)) return Response.json({ tree: [{ path: 'src/app.ts', type: 'blob', mode: '100644' }, { path: '.github/workflows/ci.yml', type: 'blob', mode: '100644' }], truncated: false });
    if (u.includes('/contents/src/app.ts?')) return Response.json({ type: 'file', encoding: 'base64', content: Buffer.from('export const fixed = false;\n').toString('base64'), size: 28, sha: fileSha });
    if (u.includes('/contents/.github/workflows/ci.yml?')) return Response.json({ type: 'file', encoding: 'base64', content: Buffer.from('name: CI\n').toString('base64'), size: 9, sha: fileSha });
    if (u.includes('/pulls?state=open&head=')) return Response.json([]);
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try {
    const result = await proposeDemosCiFix();
    assert.equal(result.number, 44); assert.match(String(result.coverage), /no local tests/i);
    assert.equal(writes.at(-1)!.body.draft, true); assert.equal(writes.at(-1)!.body.base, 'main');
    assert.match(writes.find(x => x.url.endsWith('/git/refs'))!.body.ref, /^refs\/heads\/gandalf\/ci-123-1-/);
    assert.ok(!JSON.stringify(writes).includes('test-token'));
    reviewApproved = false; modelCalls = 0; writes.length = 0;
    const rejected = await proposeDemosCiFix();
    assert.match(String(rejected.error), /did not pass independent review/); assert.equal(writes.length, 0);
    tryWorkflowEdit = true; modelCalls = 0;
    const invalid = await proposeDemosCiFix();
    assert.match(String(invalid.error), /failed validation/); assert.equal(writes.length, 0);
  } finally { globalThis.fetch = original; delete process.env.GANDALF_DEMOS_GITHUB_TOKEN; }
});

test('refuses stale or unverified CI runs before any writes', async () => {
  const original = globalThis.fetch; process.env.GANDALF_DEMOS_GITHUB_TOKEN = 'test-token'; let writes = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => { if (init?.method === 'POST') writes++; if (String(url).endsWith('/commits/main')) return Response.json({ sha: 'd'.repeat(40) }); return Response.json({ workflow_runs: [run] }); }) as typeof fetch;
  try { const result = await proposeDemosCiFix(); assert.match(String(result.error), /No current failing/); assert.equal(writes, 0); }
  finally { globalThis.fetch = original; delete process.env.GANDALF_DEMOS_GITHUB_TOKEN; }
});

test('does not act on a failure superseded by a successful run', async () => {
  const original = globalThis.fetch; process.env.GANDALF_DEMOS_GITHUB_TOKEN = 'test-token'; let writes = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') writes++;
    if (String(url).endsWith('/commits/main')) return Response.json({ sha });
    return Response.json({ workflow_runs: [{ ...run, id: 124, conclusion: 'success' }, run] });
  }) as typeof fetch;
  try { const result = await proposeDemosCiFix(); assert.match(String(result.error), /No current failing/); assert.equal(writes, 0); }
  finally { globalThis.fetch = original; delete process.env.GANDALF_DEMOS_GITHUB_TOKEN; }
});
