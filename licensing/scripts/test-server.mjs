// Local license server for end-to-end testing without Cloudflare: the real
// Worker code on http://127.0.0.1:8787 with an in-memory DB. Prints a ready
// test key on boot. Point Settings → License → Server at it.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import worker from '../worker/worker.js';
import { fakeD1 } from './fake-d1.mjs';

const env = {
  DB: fakeD1(),
  LICENSE_SIGNING_KEY: readFileSync(new URL('../signing-key.b64', import.meta.url), 'utf8').trim(),
  ADMIN_TOKEN: 'local-admin'
};

const boot = await worker.fetch(new Request('http://x/admin/keys', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer local-admin' },
  body: JSON.stringify({ customer: 'Local Test Customer', seats: 2 })
}), env).then((r) => r.json());

const PORT = +(process.env.PORT || 8787);
createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request('http://127.0.0.1:' + PORT + req.url, {
    method: req.method,
    headers: req.headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined
  });
  const out = await worker.fetch(request, env);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(PORT, '127.0.0.1', () => {
  console.log('license test server on http://127.0.0.1:' + PORT);
  console.log('test key (2 seats): ' + boot.key);
  console.log('admin token: local-admin');
});
