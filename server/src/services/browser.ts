import { createHash } from 'node:crypto';

type BrowserAction = { action: string; url: string | null; ref: string | null; value: string | null };
export async function browse(channel: string, user: string, operation: BrowserAction): Promise<{ evidence: unknown; image?: string }> {
  const endpoint = process.env.GANDALF_BROWSER_URL;
  const secret = process.env.GANDALF_BROWSER_SECRET;
  if (!endpoint || !secret) return { evidence: { error: 'Browser service is not configured.' } };
  try {
    const session = createHash('sha256').update(`${channel}\0${user}`).digest('hex');
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/act`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ session, ...operation }), signal: AbortSignal.timeout(40000) });
    const data = await response.json() as any;
    if (!response.ok) return { evidence: { error: typeof data.error === 'string' ? data.error : `Browser unavailable (HTTP ${response.status}).` } };
    const { screenshot, ...evidence } = data;
    return { evidence, ...(typeof screenshot === 'string' && screenshot.length < 1500000 ? { image: `data:image/jpeg;base64,${screenshot}` } : {}) };
  } catch { return { evidence: { error: 'Browser service is unavailable.' } }; }
}
