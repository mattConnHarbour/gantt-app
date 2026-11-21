import Fastify from 'fastify';
import { chromium } from 'playwright';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createPublicProxy, isPublicAddress } from './proxy.js';

const secret = process.env.GANDALF_BROWSER_SECRET || '';
if (!secret) throw new Error('Browser service secret is required');
const app = Fastify({ bodyLimit: 20000 });
const proxy = createPublicProxy();
await new Promise((resolve, reject) => proxy.listen(0, '127.0.0.1', resolve).once('error', reject));
const proxyPort = proxy.address().port;
const browser = await chromium.launch({ headless: true, args: ['--disable-quic', '--disable-background-networking', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--proxy-bypass-list=<-loopback>'] });
const sessions = new Map();
const expireMs = 15 * 60000;
const sweeper = setInterval(() => {
  for (const [key, entry] of sessions) if (Date.now() - entry.updated > expireMs && !entry.running) { sessions.delete(key); void entry.context.close(); }
}, 60000);
sweeper.unref();
let activeCount = 0;
const safeUrl = value => { try { const u = new URL(value); const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase(); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && host !== 'localhost' && !host.endsWith('.localhost') && (!isIP(host) || isPublicAddress(host)); } catch { return false; } };
const authorized = header => { const a = Buffer.from(header || ''), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b); };
app.get('/health', async () => ({ status: 'ok' }));
app.post('/act', async (request, reply) => {
  if (!authorized(request.headers.authorization)) return reply.code(401).send({ error: 'Unauthorized' });
  const { session, action, url, ref, value } = request.body || {};
  if (typeof session !== 'string' || !/^[a-f0-9]{64}$/.test(session) || !['open', 'snapshot', 'click', 'fill', 'press', 'scroll'].includes(action)) return reply.code(400).send({ error: 'Invalid browser action' });
  if (action === 'open' && (typeof url !== 'string' || url.length > 3000 || !safeUrl(url))) return reply.code(400).send({ error: 'Only valid public HTTP(S) URLs are supported.' });
  if (['click', 'fill', 'press'].includes(action) && (typeof ref !== 'string' || !/^e\d{1,3}$/.test(ref))) return reply.code(400).send({ error: 'Choose an element reference from the latest snapshot.' });
  if (action === 'fill' && (typeof value !== 'string' || value.length > 2000)) return reply.code(400).send({ error: 'Text is required and must be at most 2,000 characters.' });
  if (action === 'press' && !['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp'].includes(value)) return reply.code(400).send({ error: 'Unsupported key.' });
  if (action === 'scroll' && !['up', 'down'].includes(value)) return reply.code(400).send({ error: 'Choose up or down.' });
  for (const [key, entry] of sessions) if (Date.now() - entry.updated > expireMs && !entry.running) { sessions.delete(key); await entry.context.close(); }
  let entry = sessions.get(session);
  if (!entry) {
    if (action !== 'open') return reply.code(400).send({ error: 'Open a URL to start a browser session.' });
    if (sessions.size >= 10) return reply.code(503).send({ error: 'Browser capacity is currently full.' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false, proxy: { server: `http://127.0.0.1:${proxyPort}` }, serviceWorkers: 'block' });
    await context.addInitScript(() => { Object.defineProperty(globalThis, 'RTCPeerConnection', { value: undefined }); Object.defineProperty(globalThis, 'webkitRTCPeerConnection', { value: undefined }); });
    await context.route('**/*', async route => { if (!safeUrl(route.request().url())) return route.abort(); return route.continue(); });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    entry = { context, page, updated: Date.now(), running: false };
    sessions.set(session, entry);
  }
  if (entry.running || activeCount >= 4) return reply.code(429).send({ error: 'Browser is busy; retry shortly.' });
  entry.running = true; activeCount++;
  try {
    let page = entry.page;
    if (action === 'open') await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (action === 'click') {
      const before = new Set(entry.context.pages());
      await page.locator(`[data-gandalf-ref="${ref}"]`).first().click({ timeout: 7000 });
      const opened = entry.context.pages().find(candidate => !before.has(candidate));
      if (opened) { page = opened; entry.page = page; await page.waitForLoadState('domcontentloaded', { timeout: 7000 }).catch(() => undefined); }
    }
    if (action === 'fill') await page.locator(`[data-gandalf-ref="${ref}"]`).first().fill(value, { timeout: 7000 });
    if (action === 'press') await page.locator(`[data-gandalf-ref="${ref}"]`).first().press(value, { timeout: 7000 });
    if (action === 'scroll') await page.mouse.wheel(0, value === 'down' ? 650 : -650);
    const observation = await page.evaluate(() => {
      document.querySelectorAll('[data-gandalf-ref]').forEach(el => el.removeAttribute('data-gandalf-ref'));
      const elements = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')].filter(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; }).slice(0, 80);
      const text = document.body?.innerText || '';
      return { text: text.slice(0, 20000), textTruncated: text.length > 20000, elements: elements.map((el, i) => { const ref = `e${i}`; el.setAttribute('data-gandalf-ref', ref); return { ref, tag: el.tagName.toLowerCase(), text: (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent || '').trim().slice(0, 200), href: el.tagName === 'A' ? el.href : undefined, inputType: el.tagName === 'INPUT' ? el.type : undefined }; }) };
    });
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 55, timeout: 7000 });
    entry.updated = Date.now();
    return { url: page.url(), title: await page.title(), ...observation, screenshot: screenshot.toString('base64') };
  } catch { return reply.code(502).send({ error: 'Browser action failed. The URL may be unavailable, blocked, or require access not available to the browser.' }); }
  finally { entry.running = false; activeCount--; }
});
app.addHook('onClose', async () => { clearInterval(sweeper); await browser.close(); proxy.close(); });
const port = Number(process.env.PORT || 3000);
await app.listen({ port, host: '::' });
console.info(`Browser service listening on port ${port}`);
