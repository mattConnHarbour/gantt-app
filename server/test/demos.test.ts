import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectDemos } from '../src/services/demos.js';

test('reads pinned demos files and bounded PR evidence without exposing tokens or secret paths', async () => {
  const original = globalThis.fetch; process.env.GANDALF_DEMOS_GITHUB_TOKEN = 'test-secret'; const calls: string[] = []; const sha = 'a'.repeat(40);
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url); calls.push(u); assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-secret');
    if (u.endsWith('/commits/main')) return Response.json({ sha });
    if (u.includes('/contents/src/example.ts')) { assert.match(u, new RegExp(`ref=${sha}`)); return Response.json({ type: 'file', encoding: 'base64', size: 30, content: Buffer.from('hello test-secret').toString('base64') }); }
    if (u.includes('/pulls/42/files')) return Response.json([{ filename: 'src/example.ts', status: 'modified', patch: 'safe patch' }, { filename: '.env', patch: 'sensitive' }]);
    if (u.includes('/issues/42/comments')) return Response.json([{ body: 'comment', user: { login: 'reviewer' } }]);
    if (u.includes('/pulls/42/reviews')) return Response.json([]);
    if (u.includes('/pulls/42/comments')) return Response.json([]);
    if (u.endsWith('/pulls/42')) return Response.json({ title: 'Demo fix', state: 'open', head: { sha }, base: { sha }, html_url: 'https://github.com/superdoc/demos/pull/42' });
    if (u.includes('/search/code?')) return Response.json({ total_count: 2, items: [{ path: 'src/example.ts', repository: { full_name: 'superdoc/demos' } }, { path: 'src/other.ts', repository: { full_name: 'other/repo' } }] });
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try {
    const file = await inspectDemos('read:src/example.ts');
    assert.equal(file.commit, sha); assert.equal(file.content, 'hello [REDACTED]');
    const before = calls.length; assert.match(String((await inspectDemos('read:../.env')).error), /cannot be read/); assert.equal(calls.length, before);
    const pr = await inspectDemos('pr:42'); assert.equal(pr.head, sha); assert.equal((pr.files as any[]).length, 1); assert.equal((pr.comments as any[]).length, 1);
    const search = await inspectDemos('search:example'); assert.equal((search.matches as any[]).length, 1); assert.match(String(search.coverage), /index/);
    assert.ok(!JSON.stringify(pr).includes('test-secret'));
  } finally { globalThis.fetch = original; delete process.env.GANDALF_DEMOS_GITHUB_TOKEN; }
});
