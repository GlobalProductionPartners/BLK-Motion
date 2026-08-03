/*
 * One-command verdict on a deployed licence server.
 *
 *   node licensing/scripts/check-server.mjs --admin <ADMIN_TOKEN>
 *   node licensing/scripts/check-server.mjs --key BLKM-XXXX-XXXX-XXXX-XXXX
 *   ... --url https://your-worker.workers.dev      (defaults to the app's server)
 *
 * Checks health, issues (or uses) a key, activates it, and — the part that
 * matters — verifies the returned signature against the PUBLIC KEY COMPILED
 * INTO THE APP. That is the only way to know the Worker's signing secret and
 * the app agree; everything else can look fine while activation still fails.
 * Any seat it consumes is released again before it exits.
 */
import { readFileSync } from 'node:fs';
import { createPublicKey, verify as edVerify } from 'node:crypto';

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };

const appSrc = readFileSync(new URL('../../src/main/license.js', import.meta.url), 'utf8');
const pubPem = appSrc.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/)[0];
const defaultUrl = (appSrc.match(/LICENSE_SERVER\s*=\s*'([^']+)'/) || [])[1];
const url = (arg('url') || defaultUrl || '').replace(/\/+$/, '');
const admin = arg('admin');
let key = arg('key');

if (!url) { console.error('No server URL — pass --url'); process.exit(2); }
if (!admin && !key) { console.error('Pass --admin <ADMIN_TOKEN> (to mint a throwaway key) or --key <EXISTING KEY>'); process.exit(2); }

const machineId = 'server-check-' + Date.now();
let fails = 0;
const ok = (label, good, detail) => {
  console.log((good ? 'PASS' : 'FAIL') + ' · ' + label + (detail ? ' — ' + detail : ''));
  if (!good) fails++;
};
const post = async (p, body, headers = {}) => {
  const res = await fetch(url + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  let j = null; try { j = await res.json(); } catch { j = { ok: false, error: 'non-JSON response (HTTP ' + res.status + ')' }; }
  return { status: res.status, body: j };
};

console.log('server: ' + url + '\n');

// 1. health
let health;
try {
  const r = await fetch(url + '/health');
  health = await r.json();
} catch (err) {
  console.error('Cannot reach the server: ' + err.message);
  process.exit(2);
}
ok('health', health.ok === true, JSON.stringify(health));
if (health.signing && health.signing !== 'ok') {
  console.log('\n→ Signing is broken on the server. Redeploy (git pull && wrangler deploy),');
  console.log('  and if it persists re-upload the secret: wrangler secret put LICENSE_SIGNING_KEY');
  process.exit(1);
}

// 2. a key to test with
let minted = false;
if (!key) {
  // a name with accents and curly punctuation also proves the UTF-8 fix is live
  const r = await post('/admin/keys', { customer: 'Server check — Café Ólafur’s', seats: 1 }, { authorization: 'Bearer ' + admin });
  if (!r.body.ok) { ok('mint a throwaway key', false, JSON.stringify(r.body)); process.exit(1); }
  key = r.body.key;
  minted = true;
  ok('mint a throwaway key (non-ASCII name)', true, key);
}

// 3. activate
const act = await post('/activate', { key, machineId, machineName: 'server-check' });
ok('activate', act.body.ok === true, act.body.ok ? '' : 'HTTP ' + act.status + ' ' + JSON.stringify(act.body));

// 4. THE decisive check
if (act.body.ok) {
  const { payload, sig } = act.body.license;
  const good = edVerify(null, Buffer.from(payload, 'utf8'), createPublicKey(pubPem), Buffer.from(sig, 'base64'));
  ok('signature is accepted by THIS BUILD of the app', good);
  if (!good) {
    console.log('\n→ The server signs with a different key than the app verifies with.');
    console.log('  Upload the private half of the key in src/main/license.js:');
    console.log('    wrangler secret put LICENSE_SIGNING_KEY < <matching signing-key.b64>');
    console.log('  See FIX-LICENCE-SERVER.md, Fault 2.');
  }
  const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  ok('payload readable and bound to this machine', decoded.machineId === machineId, decoded.customer);

  // 5. leave no trace
  const rel = await post('/deactivate', { key, machineId });
  ok('test seat released', rel.body.ok === true);
}

console.log('');
if (fails === 0) {
  console.log('RESULT: server is healthy and its licences will be accepted by this build.');
  if (minted) console.log('Note: throwaway key ' + key + ' remains in the database — delete it in D1 if you like.');
} else {
  console.log('RESULT: ' + fails + ' problem(s) — see the notes above and FIX-LICENCE-SERVER.md');
}
process.exit(fails ? 1 : 0);
