/** Personal search credentials are only used in their owner's direct conversation. */
export function canSearch(channelType: string | undefined, user: string | undefined): boolean {
  return channelType === 'im' && !!user && !!process.env.GANDALF_SEARCH_OWNER && user === process.env.GANDALF_SEARCH_OWNER;
}

export async function searchSlack(query: string, user: string): Promise<unknown> {
  const token = process.env.SLACK_SEARCH_TOKEN;
  if (!token) return { error: 'Slack search is not connected.' };
  try {
    const auth = await fetch('https://slack.com/api/auth.test', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const identity = await auth.json() as any;
    if (!auth.ok || !identity.ok || identity.user_id !== user || identity.team_id !== process.env.SLACK_TEAM_ID) return { error: 'Slack search token does not belong to the requesting user and workspace.' };
    const params = new URLSearchParams({ query: query.slice(0, 300), count: '10', sort: 'timestamp', sort_dir: 'desc' });
    const response = await fetch(`https://slack.com/api/search.messages?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const data = await response.json() as any;
    if (!response.ok || !data.ok) return { error: `Slack search failed: ${data.error || response.status}` };
    return { matches: (data.messages?.matches || []).slice(0, 10).map((m: any) => ({ text: String(m.text || '').slice(0, 5000), permalink: m.permalink, channel: m.channel?.name, ts: m.ts })), total: data.messages?.total, limited: true };
  } catch { return { error: 'Slack search is temporarily unavailable.' }; }
}

export async function searchGranola(query: string): Promise<unknown> {
  const token = process.env.GRANOLA_API_KEY;
  if (!token) return { error: 'Granola search is not connected.' };
  try {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return { error: 'A search query is required.' };
    const matches: any[] = [];
    let cursor = '';
    let more = false;
    for (let page = 0; page < 10; page++) {
      const url = new URL('https://public-api.granola.ai/v1/notes');
      url.searchParams.set('page_size', '30');
      if (cursor) url.searchParams.set('cursor', cursor);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) return { error: `Granola search failed (HTTP ${response.status}).` };
      const data = await response.json() as any;
      if (!Array.isArray(data.notes) || typeof data.hasMore !== 'boolean') return { error: 'Granola returned an invalid response.' };
      for (const note of data.notes) {
        const haystack = JSON.stringify(note).toLowerCase();
        if (terms.every(term => haystack.includes(term))) matches.push(note);
      }
      more = data.hasMore;
      if (!more) break;
      if (!data.cursor || data.cursor === cursor) return { error: 'Granola pagination was incomplete.' };
      cursor = data.cursor;
    }
    return { matches: matches.slice(0, 10).map(note => JSON.stringify(note).slice(0, 8000)), totalMatchesInScannedNotes: matches.length, incomplete: more, coverage: 'Searches up to 300 note records, not transcripts.' };
  } catch { return { error: 'Granola search is temporarily unavailable.' }; }
}
