const repository = 'superdoc/orbit';
const api = `https://api.github.com/repos/${repository}`;
const coverage = 'Search uses GitHub’s code index, which can lag behind main. File contents are read from the freshly resolved commit; uncommitted local changes are not included.';

type GitHubResult = { error?: string; [key: string]: unknown };

/** Read-only source inspection. Every call resolves main again and pins reads to that commit. */
export async function searchOrbit(query: string | null, path: string | null): Promise<GitHubResult> {
  const token = process.env.ORBIT_GITHUB_TOKEN;
  if (!token) return { error: 'Orbit is not connected; a read-only GitHub token is required.' };
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Gandalf-code-reader' };
  const get = async (url: string) => fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const validPath = (value: string) => value.length <= 500 && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..') && !/(^|\/)(\.env(?:\.|$)|[^/]*(?:\.pem|\.key|credentials\.json)$)/i.test(value);
  const file = async (name: string, sha: string) => {
    if (!validPath(name)) return { path: name, error: 'This path cannot be read.' };
    const url = `${api}/contents/${name.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`;
    const response = await get(url);
    if (!response.ok) return { path: name, error: `File unavailable (HTTP ${response.status}).` };
    const data = await response.json() as any;
    if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string' || data.size > 100000) return { path: name, error: 'Not a regular text file, or file exceeds 100 KB.' };
    const bytes = Buffer.from(data.content, 'base64');
    if (bytes.includes(0)) return { path: name, error: 'Binary files cannot be inspected.' };
    const lines = bytes.toString('utf8').split('\n');
    return { path: name, lines, url: `https://github.com/${repository}/blob/${sha}/${name.split('/').map(encodeURIComponent).join('/')}` };
  };
  try {
    const head = await get(`${api}/commits/main`);
    if (!head.ok) return { error: `Could not refresh Orbit main (HTTP ${head.status}); no stale checkout was used.` };
    const sha = (await head.json() as any).sha;
    if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) return { error: 'Could not resolve Orbit main to a commit.' };
    if (path?.trim()) {
      const found = await file(path.trim(), sha);
      if (!('lines' in found)) return { commit: sha, ...found, coverage };
      const text = found.lines!.join('\n');
      return { commit: sha, path: found.path, url: found.url, content: text.slice(0, 24000), truncated: text.length > 24000, coverage };
    }
    const term = query?.trim().slice(0, 150);
    if (!term) return { error: 'A code search term or repository path is required.' };
    const search = await get(`https://api.github.com/search/code?${new URLSearchParams({ q: `${term} repo:${repository}`, per_page: '8' })}`);
    if (!search.ok) return { commit: sha, error: `GitHub code search unavailable (HTTP ${search.status}).`, coverage };
    const data = await search.json() as any;
    if (!Array.isArray(data.items)) return { commit: sha, error: 'GitHub returned an invalid code-search response.', coverage };
    const paths = data.items.filter((item: any) => item.repository?.full_name?.toLowerCase() === repository && typeof item.path === 'string').map((item: any) => item.path).slice(0, 8);
    const files = await Promise.all(paths.map((name: string) => file(name, sha)));
    const needle = term.toLowerCase();
    const matches = files.map((item: any) => {
      if (!item.lines) return item;
      const lines = item.lines.map((text: string, i: number) => ({ line: i + 1, text })).filter((line: any) => line.text.toLowerCase().includes(needle)).slice(0, 8);
      return { path: item.path, url: item.url, matches: lines.map((line: any) => ({ ...line, text: line.text.slice(0, 500) })), note: lines.length ? undefined : 'Indexed match not verified at this commit; open the file to inspect.' };
    });
    return { commit: sha, matches, totalIndexedMatches: data.total_count, incomplete: true, coverage };
  } catch { return { error: 'Orbit is temporarily unavailable; no stale checkout was used.' }; }
}
