/** Treat channel messages as untrusted; only accept exact demo CI run links. */
export type DemoFailure = { channel: string; messageTs: string; runId: string; attempt: number };
const DEMO_CHANNEL = 'C0CGVHH8R46';
const urlPattern = /https:\/\/github\.com\/superdoc\/demos\/actions\/runs\/(\d+)(?:\/attempts\/(\d+))?(?=[\s>|?#]|$)/gi;

export function parseDemoFailure(event: { channel?: string; ts?: string; text?: string }): DemoFailure | null {
  if (event.channel !== DEMO_CHANNEL || typeof event.ts !== 'string' || !/^\d+\.\d+$/.test(event.ts) || typeof event.text !== 'string' || !/\bfailure\b/i.test(event.text)) return null;
  const links = [...event.text.matchAll(urlPattern)];
  if (links.length !== 1) return null;
  const attempt = links[0][2] ? Number(links[0][2]) : 1;
  if (!Number.isSafeInteger(attempt) || attempt < 1) return null;
  return { channel: event.channel, messageTs: event.ts, runId: links[0][1], attempt };
}

/** Independently verify the referenced run; Slack text never authorizes code changes. */
export async function verifyDemoFailure(alert: DemoFailure): Promise<{ verified: boolean; sha?: string; reason?: string }> {
  if (!/^\d+$/.test(alert.runId) || !Number.isSafeInteger(alert.attempt) || alert.attempt < 1) return { verified: false, reason: 'Invalid run reference.' };
  try {
    const response = await fetch(`https://api.github.com/repos/superdoc/demos/actions/runs/${alert.runId}/attempts/${alert.attempt}`, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Gandalf-ci-monitor' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { verified: false, reason: `GitHub run lookup failed (HTTP ${response.status}).` };
    const run = await response.json() as any;
    if (String(run.id) !== alert.runId || Number(run.run_attempt) !== alert.attempt || run.repository?.full_name?.toLowerCase() !== 'superdoc/demos' || run.head_branch !== 'main' || run.status !== 'completed' || run.conclusion !== 'failure' || typeof run.head_sha !== 'string' || !/^[0-9a-f]{40}$/i.test(run.head_sha)) return { verified: false, reason: 'The referenced run is not a confirmed failed main-branch demo run.' };
    return { verified: true, sha: run.head_sha };
  } catch { return { verified: false, reason: 'GitHub run verification is unavailable.' }; }
}
