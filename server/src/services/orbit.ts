import { createGunzip } from 'node:zlib';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar-stream';

const repository = 'superdoc/docx-editor';
const api = `https://api.github.com/repos/${repository}`;
const coverage = 'Search scans up to 10,000 text files (at most 100 KB each) from a public source archive pinned to the freshly resolved main commit; up to 8 matching files and 8 lines per file are returned. Local uncommitted changes and other repositories are not included.';
type GitHubResult = { error?: string; [key: string]: unknown };
const validPath = (value: string) => value.length <= 500 && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..') && !/(^|\/)(\.env(?:\.|$)|[^/]*(?:\.pem|\.key|credentials\.json)$)/i.test(value);
const sourceFile = (path: string) => /\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|html|json|md|mdx|yaml|yml|xml|py|sh|sql|graphql|toml)$/i.test(path);
const fileUrl = (sha: string, name: string) => `https://github.com/${repository}/blob/${sha}/${name.split('/').map(encodeURIComponent).join('/')}`;

/** Read-only public source inspection. Resolve main on every call and pin reads to it. */
export async function searchOrbit(query: string | null, path: string | null): Promise<GitHubResult> {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Gandalf-code-reader' };
  const get = async (url: string) => fetch(url, { headers, signal: AbortSignal.timeout(45000) });
  try {
    const head = await get(`${api}/commits/main`);
    if (!head.ok) return { error: `Could not refresh public docx-editor main (HTTP ${head.status}); no stale code was used.` };
    const sha = (await head.json() as any).sha;
    if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) return { error: 'Could not resolve public docx-editor main to a commit.' };
    if (path?.trim()) {
      const name = path.trim();
      if (!validPath(name)) return { commit: sha, path: name, error: 'This path cannot be read.' };
      const response = await get(`${api}/contents/${name.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`);
      if (!response.ok) return { commit: sha, path: name, error: `File unavailable (HTTP ${response.status}).` };
      const data = await response.json() as any;
      if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string' || data.size > 100000) return { commit: sha, path: name, error: 'Not a regular text file, or file exceeds 100 KB.' };
      const bytes = Buffer.from(data.content, 'base64');
      if (bytes.includes(0)) return { commit: sha, path: name, error: 'Binary files cannot be inspected.' };
      const content = bytes.toString('utf8');
      return { commit: sha, path: name, url: fileUrl(sha, name), content: content.slice(0, 24000), truncated: content.length > 24000, coverage };
    }
    const term = query?.trim().slice(0, 150);
    if (!term) return { error: 'A code search term or repository path is required.' };
    const archive = await get(`https://codeload.github.com/${repository}/tar.gz/${sha}`);
    if (!archive.ok || !archive.body) return { commit: sha, error: `Public source archive unavailable (HTTP ${archive.status}).`, coverage };
    const matches: { path: string; url: string; matches: { line: number; text: string }[] }[] = [];
    let scanned = 0;
    let totalBytes = 0;
    const extract = tar.extract();
    extract.on('entry', (header, stream, next) => {
      const name = header.name.split('/').slice(1).join('/');
      if (header.type !== 'file' || !validPath(name) || !sourceFile(name) || header.size > 100000 || scanned >= 10000) { stream.resume(); stream.on('end', next); return; }
      scanned++;
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: unknown) => { chunks.push(chunk as Buffer); });
      stream.on('end', () => {
        const bytes = Buffer.concat(chunks);
        if (!bytes.includes(0)) {
          const lines = bytes.toString('utf8').split('\n').map((text, i) => ({ line: i + 1, text })).filter(line => line.text.toLowerCase().includes(term.toLowerCase())).slice(0, 8);
          if (lines.length && matches.length < 8) matches.push({ path: name, url: fileUrl(sha, name), matches: lines.map(line => ({ ...line, text: line.text.slice(0, 500) })) });
        }
        next();
      });
    });
    const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) { totalBytes += chunk.length; callback(totalBytes > 200 * 1024 * 1024 ? new Error('Archive exceeds search limit') : null, chunk); } });
    await pipeline(Readable.from(archive.body as any), createGunzip(), limit, extract);
    return { commit: sha, repository, matches, scannedFiles: scanned, incomplete: true, coverage };
  } catch { return { error: 'Public docx-editor is temporarily unavailable or its archive exceeded the search limit; no stale code was used.' }; }
}
