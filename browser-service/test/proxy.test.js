import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import { createPublicProxy, isPublicAddress } from '../proxy.js';

test('only globally routable IP addresses are accepted', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '::1', 'fc00::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);
});

test('Chromium cannot connect WebSockets to local services through the proxy', async () => {
  let connections = 0;
  const local = http.createServer();
  local.on('upgrade', (_req, socket) => { connections++; socket.destroy(); });
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
  const proxy = createPublicProxy();
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, args: ['--disable-quic', '--proxy-bypass-list=<-loopback>'] });
  try {
    const context = await browser.newContext({ proxy: { server: `http://127.0.0.1:${proxy.address().port}` } });
    const page = await context.newPage();
    const outcomes = await page.evaluate(async port => Promise.all(['ws', 'wss'].map(protocol => new Promise(resolve => {
      const socket = new WebSocket(`${protocol}://127.0.0.1:${port}/`);
      socket.onopen = () => { socket.close(); resolve('opened'); };
      socket.onerror = () => resolve('blocked');
      setTimeout(() => { socket.close(); resolve('timeout'); }, 3000);
    }))), local.address().port);
    assert.deepEqual(outcomes, ['blocked', 'blocked']);
    assert.equal(connections, 0);
  } finally {
    await browser.close();
    await new Promise(resolve => proxy.close(resolve));
    await new Promise(resolve => local.close(resolve));
  }
});

test('proxy denies direct HTTP and CONNECT requests to local services', async () => {
  const proxy = createPublicProxy();
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const port = proxy.address().port;
  try {
    const status = await new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port, path: 'http://127.0.0.1:3000/health' }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
    assert.equal(status, 403);
    const connect = await new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port, method: 'CONNECT', path: '169.254.169.254:80' }); req.on('connect', (res, socket) => { socket.destroy(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
    assert.equal(connect, 403);
  } finally { await new Promise(resolve => proxy.close(resolve)); }
});
