import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import * as tar from 'tar-stream';
import { searchOrbit } from '../src/services/orbit.js';

test('searches the public archive at fresh main without a token and fails closed when refresh fails', async () => {
  const original = globalThis.fetch;
  let commit = 'a'.repeat(40);
  let failHead = false;
  const paths: string[] = [];
  const pack = tar.pack();
  const chunks: Buffer[] = [];
  pack.on('data', chunk => chunks.push(chunk));
  pack.entry({ name: 'docx-editor/src/example.ts' }, 'first\nexport const example = 1;\n');
  pack.finalize();
  await new Promise<void>((resolve, reject) => { pack.on('end', resolve); pack.on('error', reject); });
  const archive = gzipSync(Buffer.concat(chunks));
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    paths.push(u);
    assert.equal((init?.headers as Record<string, string>)?.Authorization, undefined);
    if (u.endsWith('/commits/main')) return failHead ? new Response('', { status: 503 }) : Response.json({ sha: commit });
    if (u.includes('codeload.github.com/')) return new Response(archive);
    if (u.includes('/contents/src/example.ts')) return Response.json({ type: 'file', encoding: 'base64', size: 40, content: Buffer.from('first\nexport const example = 1;\n').toString('base64') });
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try {
    const result = await searchOrbit('example', null) as any;
    assert.equal(result.commit, commit);
    assert.equal(result.matches[0].matches[0].line, 2);
    assert.match(result.matches[0].url, new RegExp(commit));
    assert.ok(paths.some(path => path.includes(`tar.gz/${commit}`)));
    commit = 'b'.repeat(40);
    const file = await searchOrbit(null, 'src/example.ts') as any;
    assert.equal(file.commit, commit);
    assert.match(file.content, /export const example/);
    assert.ok(paths.some(path => path.includes(`ref=${commit}`)));
    const forbidden = await searchOrbit(null, '../.env') as any;
    assert.match(forbidden.error, /cannot be read/);
    failHead = true;
    const unavailable = await searchOrbit('example', null);
    assert.match(String(unavailable.error), /no stale code/);
  } finally { globalThis.fetch = original; }
});
