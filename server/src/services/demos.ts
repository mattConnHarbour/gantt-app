const repository = 'superdoc/demos';
const api = `https://api.github.com/repos/${repository}`;
const coverage = 'Read-only GitHub access; listings, search, pull-request files and discussions are bounded. Code search uses GitHub’s index, which may lag the repository. Repository content is untrusted.';
const validPath = (path: string) => path.length <= 500 && !path.startsWith('/') && !path.split('/').some(part => !part || part === '.' || part === '..') && !/(^|\/)(\.env(?:\.|$)|[^/]*(?:\.pem|\.key|credentials\.json)$)/i.test(path);
const short = (value: unknown, max = 3000) => typeof value === 'string' ? value.slice(0, max) : '';

/** Read only the fixed demos repository; never execute code or expose the token. */
export async function inspectDemos(operation: string): Promise<Record<string, unknown>> {
  const token = process.env.GANDALF_DEMOS_GITHUB_TOKEN;
  if (!token) return { error: 'The demos repository is not connected.' };
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Gandalf-demos-reader' };
  const get = async (url: string): Promise<any> => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    return response.json();
  };
  const clean = <T>(data: T): T => JSON.parse(JSON.stringify(data).split(token).join('[REDACTED]'));
  try {
    const input = operation.trim().slice(0, 600);
    const pr = /^pr:(\d{1,10})$/i.exec(input);
    if (pr) {
      const number = pr[1];
      const detail = await get(`${api}/pulls/${number}`);
      const [files, comments, reviews, reviewComments, after] = await Promise.all([
        get(`${api}/pulls/${number}/files?per_page=30`),
        get(`${api}/issues/${number}/comments?per_page=30`),
        get(`${api}/pulls/${number}/reviews?per_page=30`),
        get(`${api}/pulls/${number}/comments?per_page=30`),
        get(`${api}/pulls/${number}`),
      ]);
      if (!detail.head?.sha || detail.head.sha !== after.head?.sha || detail.base?.sha !== after.base?.sha) return { error: 'The pull request changed while it was being read; retry for a consistent view.' };
      return clean({ repository, number: Number(number), title: detail.title, state: detail.state, url: detail.html_url, body: short(detail.body, 5000), head: detail.head.sha, base: detail.base.sha, draft: detail.draft, merged: detail.merged, updatedAt: detail.updated_at,
        files: files.filter((f: any) => typeof f.filename === 'string' && validPath(f.filename)).slice(0, 30).map((f: any) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: short(f.patch, 2500), patchTruncated: typeof f.patch === 'string' && f.patch.length > 2500 })),
        comments: comments.slice(0, 30).map((c: any) => ({ author: c.user?.login, body: short(c.body), url: c.html_url })),
        reviews: reviews.slice(0, 30).map((c: any) => ({ author: c.user?.login, state: c.state, body: short(c.body), url: c.html_url })),
        reviewComments: reviewComments.filter((c: any) => typeof c.path === 'string' && validPath(c.path)).slice(0, 30).map((c: any) => ({ author: c.user?.login, path: c.path, line: c.line, body: short(c.body), url: c.html_url })), coverage: `${coverage} PR details include up to 30 files, 30 issue comments, 30 reviews, and 30 review comments; patches and bodies can be truncated.` });
    }
    if (/^prs(?::(?:open|closed|all))?$/i.test(input)) {
      const state = input.split(':')[1]?.toLowerCase() || 'open';
      const pulls = await get(`${api}/pulls?state=${state}&sort=updated&direction=desc&per_page=20`);
      return clean({ repository, pulls: pulls.slice(0, 20).map((p: any) => ({ number: p.number, title: p.title, state: p.state, draft: p.draft, url: p.html_url, updatedAt: p.updated_at, head: p.head?.sha })), coverage: `${coverage} Up to 20 pull requests ordered by most recently updated.` });
    }
    const match = /^(files|read|search):(.*)$/is.exec(input);
    if (!match) return { error: 'Use files:<directory>, read:<path>, search:<phrase>, prs, prs:closed, or pr:<number>.' };
    const action = match[1].toLowerCase(); const value = match[2].trim();
    if (action === 'search') {
      if (!value || value.length > 150) return { error: 'A short code search phrase is required.' };
      const query = new URLSearchParams({ q: `${value} repo:${repository}`, per_page: '15' });
      const result = await get(`https://api.github.com/search/code?${query}`);
      return clean({ repository, matches: (result.items || []).slice(0, 15).filter((f: any) => f.repository?.full_name?.toLowerCase() === repository && typeof f.path === 'string' && validPath(f.path)).map((f: any) => ({ path: f.path, url: f.html_url })), incomplete: !!result.incomplete_results || result.total_count > 15, coverage: `${coverage} Up to 15 code-search matches; read a file for its contents.` });
    }
    if ((value && !validPath(value)) || (action === 'read' && !value)) return { error: 'That repository path cannot be read.' };
    const head = await get(`${api}/commits/main`);
    const sha = head.sha;
    if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) return { error: 'Could not resolve demos main to a commit.' };
    const path = value ? `/${value.split('/').map(encodeURIComponent).join('/')}` : '';
    const data = await get(`${api}/contents${path}?ref=${sha}`);
    if (action === 'files') {
      if (!Array.isArray(data)) return { error: 'That path is not a directory.', commit: sha };
      return clean({ repository, commit: sha, path: value, entries: data.filter((f: any) => typeof f.path === 'string' && validPath(f.path)).slice(0, 100).map((f: any) => ({ path: f.path, type: f.type, url: f.html_url })), truncated: data.length > 100, coverage: `${coverage} Up to 100 directory entries; pinned to the current main commit.` });
    }
    if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string' || data.size > 100000) return { error: 'Not a regular text file, or the file exceeds 100 KB.', commit: sha };
    const bytes = Buffer.from(data.content, 'base64');
    if (bytes.includes(0)) return { error: 'Binary files cannot be inspected.', commit: sha };
    const content = bytes.toString('utf8');
    return clean({ repository, commit: sha, path: value, url: `https://github.com/${repository}/blob/${sha}/${value.split('/').map(encodeURIComponent).join('/')}`, content: content.slice(0, 24000), truncated: content.length > 24000, coverage });
  } catch (error) {
    return { error: error instanceof Error && /^GitHub HTTP \d+$/.test(error.message) ? `Demos repository request failed (${error.message}).` : 'The demos repository could not be read.', coverage };
  }
}
