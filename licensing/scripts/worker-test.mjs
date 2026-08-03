// Offline unit test of the real Worker: seat accounting, revocation, and the
// critical property — the signature it issues verifies against the PUBLIC key
// embedded in src/main/license.js (i.e. what the app will actually check).
import { readFileSync } from 'node:fs';
import { createPublicKey, verify as edVerify } from 'node:crypto';
import worker from '../worker/worker.js';
import { fakeD1 } from './fake-d1.mjs';

const signingKey = readFileSync(new URL('../signing-key.b64', import.meta.url), 'utf8').trim();
const appMain = readFileSync(new URL('../../src/main/license.js', import.meta.url), 'utf8');
const pubPem = appMain.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/)[0];

const env = { DB: fakeD1(), LICENSE_SIGNING_KEY: signingKey, ADMIN_TOKEN: 'test-admin' };
const call = (path, body, headers = {}) =>
  worker.fetch(new Request('http://x' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), env).then((r) => r.json());

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' · ' + name); if (!cond) fails++; };

// admin auth + key issue
const noAuth = await call('/admin/keys', { customer: 'X' });
check('admin without token rejected', noAuth.ok === false);
const issued = await call('/admin/keys', { customer: 'Acme Productions', email: 'tech@acme.com', seats: 2 }, { authorization: 'Bearer test-admin' });
check('key issued: ' + issued.key, issued.ok && /^BLKM(-[A-Z2-9]{4}){4}$/.test(issued.key));

// unknown key
const unk = await call('/activate', { key: 'BLKM-AAAA-AAAA-AAAA-AAAA', machineId: 'm1' });
check('unknown key refused', unk.ok === false);

// activation issues a signed license the APP's public key verifies
const act1 = await call('/activate', { key: issued.key, machineId: 'machine-1', machineName: 'FOH Mac' });
check('activate machine-1', act1.ok === true);
const sigOk = edVerify(null, Buffer.from(act1.license.payload, 'utf8'), createPublicKey(pubPem), Buffer.from(act1.license.sig, 'base64'));
if (!sigOk) {
  // Not a code fault: the local private key and the public key compiled into
  // the app are from different generations. Whatever is deployed as
  // LICENSE_SIGNING_KEY must be the partner of the key in src/main/license.js,
  // or every activation will be refused by the app as an invalid signature.
  console.log('CONFIG · licensing/signing-key.b64 does NOT match the public key in src/main/license.js');
  console.log('         (keypair was rotated) — the Worker secret must hold the private half of the app key.');
}
check('signature verifies with the key embedded in the app', sigOk);
const payload = JSON.parse(Buffer.from(act1.license.payload, 'base64').toString());
check('payload bound to machine + product', payload.machineId === 'machine-1' && payload.product === 'blk-motion' && payload.customer === 'Acme Productions');
const tampered = edVerify(null, Buffer.from(act1.license.payload.replace(/.$/, 'A'), 'utf8'), createPublicKey(pubPem), Buffer.from(act1.license.sig, 'base64'));
check('tampered payload fails verification', !tampered);

// non-ASCII customer names must survive: btoa() is Latin1-only, so a curly
// apostrophe or an accent used to throw and break activation entirely
const uni = await call('/admin/keys', { customer: 'Café Lumière — Ólafur’s Tour', seats: 1 }, { authorization: 'Bearer test-admin' });
const uniAct = await call('/activate', { key: uni.key, machineId: 'unicode-machine' });
check('activation survives a non-ASCII customer name', uniAct.ok === true);
if (uniAct.ok) {
  const uniPayload = JSON.parse(Buffer.from(uniAct.license.payload, 'base64').toString('utf8'));
  check('non-ASCII name round-trips intact', uniPayload.customer === 'Café Lumière — Ólafur’s Tour');
}

// seats: same machine re-activates freely; a 3rd machine is refused at 2 seats
const re1 = await call('/activate', { key: issued.key, machineId: 'machine-1' });
check('same machine re-activates (reinstall)', re1.ok === true);
const act2 = await call('/activate', { key: issued.key, machineId: 'machine-2' });
check('second seat activates', act2.ok === true);
const act3 = await call('/activate', { key: issued.key, machineId: 'machine-3' });
check('third machine refused (2 seats)', act3.ok === false && /seat/.test(act3.error));

// deactivate frees the seat
const deact = await call('/deactivate', { key: issued.key, machineId: 'machine-2' });
check('deactivate releases seat', deact.ok === true && deact.released === 1);
const act3b = await call('/activate', { key: issued.key, machineId: 'machine-3' });
check('freed seat activates new machine', act3b.ok === true);

// revocation blocks future activations
env.DB._licenses.get(issued.key).status = 'revoked';
const actR = await call('/activate', { key: issued.key, machineId: 'machine-4' });
check('revoked key refused', actR.ok === false && /revoked/.test(actR.error));

// admin list
const list = await call('/admin/licenses', undefined, { authorization: 'Bearer test-admin' });
check('admin list shows seat usage', list.ok && list.rows[0].seats_used === 2);

console.log(fails ? 'RESULT: ' + fails + ' FAILURES' : 'RESULT: ALL PASS');
process.exit(fails ? 1 : 0);
