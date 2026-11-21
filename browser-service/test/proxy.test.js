import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPublicProxy, isPublicAddress } from '../proxy.js';

test('only globally routable IP addresses are accepted', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '::1', 'fc00::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);
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
