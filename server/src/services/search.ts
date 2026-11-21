/** Pylon and repository access are restricted to the owner's direct conversation. */
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
    return { matches: (data.messages?.matches || []).slice(0, 10).map((m: any) => ({ text: String(m.text || '').slice(0, 5000), permalink: m.permalink, user: m.user, channel: m.channel?.name, channelId: m.channel?.id, ts: m.ts, threadTs: m.thread_ts })), total: data.messages?.total, limited: true, coverage: 'Up to 10 matching messages; surrounding thread and referenced documents are not automatically retrieved.' };
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

/** Search issue titles and initial bodies, or read a specific issue and its messages. */
export async function searchPylon(query: string): Promise<unknown> {
  const token = process.env.PYLON_API_TOKEN;
  if (!token) return { error: 'Pylon is not connected.' };
  const trimmed = query.trim();
  if (!trimmed) return { error: 'A Pylon issue number or search term is required.' };
  const base = token.startsWith('pylon_api_eu_') ? 'https://api.eu.usepylon.com' : 'https://api.usepylon.com';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const issueRef = trimmed.replace(/^#/, '');
  const exact = /^\d+$/.test(issueRef) || /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(issueRef);
  const safeIssue = (item: any) => ({
    id: item.id, number: item.number, title: item.title || item.subject, state: item.state,
    account: item.account, assignee: item.assignee, created_at: item.created_at,
    latest_message_time: item.latest_message_time, body_html: String(item.body_html || '').slice(0, 8000),
    link: item.link, external_issues: item.external_issues,
  });
  try {
    if (exact) {
      const issue = await fetch(`${base}/issues/${encodeURIComponent(issueRef)}`, { headers, signal: AbortSignal.timeout(15000) });
      if (!issue.ok) return { error: `Pylon issue lookup failed (HTTP ${issue.status}).` };
      const issueData = await issue.json() as any;
      if (!issueData.data || typeof issueData.data !== 'object') return { error: 'Pylon returned an invalid issue response.' };
      const id = issueData.data.id;
      if (typeof id !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) return { issue: safeIssue(issueData.data), messages: [], coverage: 'Issue details only; conversation ID was unavailable.' };
      const messagesResponse = await fetch(`${base}/issues/${encodeURIComponent(id)}/messages?limit=50`, { headers, signal: AbortSignal.timeout(15000) });
      if (!messagesResponse.ok) return { issue: safeIssue(issueData.data), messages: [], coverage: `Conversation unavailable (HTTP ${messagesResponse.status}).` };
      const messageData = await messagesResponse.json() as any;
      if (!Array.isArray(messageData.data)) return { issue: safeIssue(issueData.data), messages: [], coverage: 'Pylon returned an invalid conversation response.' };
      return { issue: safeIssue(issueData.data), messages: messageData.data.slice(0, 50).map((m: any) => ({ id: m.id, body_html: String(m.body_html || '').slice(0, 4000), sent_at: m.sent_at, is_private: m.is_private, author: m.author })), coverage: 'Up to the first 50 messages; attachments are not read.', incomplete: Boolean(messageData.pagination?.has_next_page) };
    }
    const value = trimmed.slice(0, 200);
    const response = await fetch(`${base}/issues/search`, { method: 'POST', headers, signal: AbortSignal.timeout(15000), body: JSON.stringify({ filter: { operator: 'or', subfilters: [{ field: 'title', operator: 'string_contains', value }, { field: 'body_html', operator: 'string_contains', value }] }, limit: 10 }) });
    if (!response.ok) return { error: `Pylon issue search failed (HTTP ${response.status}).` };
    const data = await response.json() as any;
    if (!Array.isArray(data.data)) return { error: 'Pylon returned an invalid search response.' };
    return { matches: data.data.slice(0, 10).map(safeIssue), incomplete: Boolean(data.pagination?.has_next_page), coverage: 'Searches issue titles and initial bodies, not full conversation histories; returns at most 10 issues.' };
  } catch { return { error: 'Pylon is temporarily unavailable.' }; }
}
