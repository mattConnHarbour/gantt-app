import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchOrbit } from '../src/services/orbit.js';

process.env.ORBIT_GITHUB_TOKEN = 'test-token';

test('reads current main, verifies indexed results at that commit, and fails closed on refresh errors', async () => {
  const original = globalThis.fetch;
  let commit = 'a'.repeat(40);
  let failHead = false;
  const paths: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    paths.push(u);
    if (u.endsWith('/commits/main')) return failHead ? new Response('', { status: 503 }) : Response.json({ sha: commit });
    if (u.includes('/search/code')) return Response.json({ total_count: 1, items: [{ path: 'src/example.ts', repository: { full_name: 'superdoc/orbit' } }] });
    if (u.includes('/contents/src/example.ts')) return Response.json({ type: 'file', encoding: 'base64', size: 40, content: Buffer.from('first\nexport const example = 1;\n').toString('base64') });
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try {
    const result = await searchOrbit('example', null) as any;
    assert.equal(result.commit, commit);
    assert.equal(result.matches[0].matches[0].line, 2);
    assert.match(result.matches[0].url, new RegExp(commit));
    assert.ok(paths.some(path => path.includes(`ref=${commit}`)));
    commit = 'b'.repeat(40);
    const file = await searchOrbit(null, 'src/example.ts') as any;
    assert.equal(file.commit, commit);
    assert.match(file.content, /export const example/);
    assert.ok(paths.some(path => path.includes(`ref=${commit}`)));
    const forbidden = await searchOrbit(null, '../.env') as any;
    assert.match(forbidden.error, /cannot be read/);
    failHead = true;
    const unavailable = await searchOrbit('example', null);
    assert.match(String(unavailable.error), /no stale checkout/);
  } finally { globalThis.fetch = original; }
});
