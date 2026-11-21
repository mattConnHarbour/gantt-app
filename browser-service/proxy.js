import http from 'node:http';
import net from 'node:net';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(ip) {
  if (!ipaddr.isValid(ip)) return false;
  let parsed = ipaddr.parse(ip);
  if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
  return parsed.range() === 'unicast';
}

async function resolvePublic(host) {
  if (!host || /[\s/\\@]/.test(host)) throw new Error('Invalid host');
  const records = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error('Private or reserved addresses are not allowed');
  return records[0];
}

/** Chromium uses this proxy for all HTTP(S) traffic; DNS is resolved and pinned here. */
export function createPublicProxy() {
  const proxy = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url);
      if (url.protocol !== 'http:' || url.username || url.password) throw new Error('Invalid URL');
      const { address, family } = await resolvePublic(url.hostname);
      const port = Number(url.port || 80);
      const upstream = http.request({ host: address, family, port, path: url.pathname + url.search, method: req.method, headers: { ...req.headers, host: url.host }, timeout: 15000 }, response => { res.writeHead(response.statusCode || 502, response.headers); response.pipe(res); });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      upstream.on('timeout', () => upstream.destroy());
      req.pipe(upstream);
    } catch { res.writeHead(403); res.end('Destination is unavailable or not public'); }
  });
  proxy.on('connect', async (req, client, head) => {
    try {
      const target = new URL(`https://${req.url}`);
      if (target.username || target.password || target.pathname !== '/' || target.search) throw new Error('Invalid target');
      const { address, family } = await resolvePublic(target.hostname.replace(/^\[|\]$/g, ''));
      const upstream = net.connect({ host: address, family, port: Number(target.port || 443) });
      upstream.setTimeout(15 * 60000, () => upstream.destroy());
      upstream.once('connect', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); client.pipe(upstream); upstream.pipe(client); });
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
    } catch { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); }
  });
  return proxy;
}
