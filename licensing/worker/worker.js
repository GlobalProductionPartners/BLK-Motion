/*
 * BLK Motion license server — Cloudflare Worker + D1.
 *
 * The app calls /activate ONCE per machine (the only time it needs network),
 * receives an Ed25519-signed license blob bound to that machine's hardware
 * fingerprint, and validates it locally forever after. Revocation and seat
 * accounting only bite at activation time — a machine that is already
 * activated keeps working offline by design.
 *
 * Endpoints:
 *   POST /activate            { key, machineId, machineName? }        -> { ok, license }
 *   POST /deactivate          { key, machineId }                      -> { ok }
 *   POST /admin/keys          { customer, email?, seats?, note? }     -> { ok, key }   (Bearer ADMIN_TOKEN)
 *   GET  /admin/licenses                                              -> { ok, rows }  (Bearer ADMIN_TOKEN)
 *   GET  /health                                                      -> { ok }
 *
 * Secrets (wrangler secret put):
 *   LICENSE_SIGNING_KEY  base64 pkcs8 Ed25519 private key (licensing/signing-key.b64)
 *   ADMIN_TOKEN          shared secret for the /admin endpoints
 */

const PRODUCT = 'blk-motion';

/* btoa() only accepts Latin1, so a customer name carrying a curly apostrophe,
   an accent or an em-dash would throw and fail the activation. Encode the
   payload as UTF-8 bytes first. The app decodes with
   Buffer.from(payload,'base64').toString('utf8'), so this stays compatible
   with licences issued before the fix (ASCII is valid UTF-8). */
function b64FromUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/* ---------- store-agnostic core (unit-testable without D1) ---------- */

export function createApi(store, signPayload) {
  async function activate({ key, machineId, machineName }) {
    if (!key || !machineId) return { status: 400, body: { ok: false, error: 'key and machineId required' } };
    const lic = await store.getLicense(key.trim().toUpperCase());
    if (!lic) return { status: 404, body: { ok: false, error: 'Unknown license key' } };
    if (lic.status !== 'active') return { status: 403, body: { ok: false, error: 'License is ' + lic.status } };

    const acts = await store.getActivations(lic.key);
    const mine = acts.find((a) => a.machine_id === machineId);
    if (!mine && acts.length >= lic.seats) {
      return { status: 403, body: { ok: false, error: 'All ' + lic.seats + ' seat(s) in use. Deactivate another machine first.' } };
    }
    if (!mine) await store.insertActivation(lic.key, machineId, machineName || '');

    const payload = {
      product: PRODUCT,
      key: lic.key,
      customer: lic.customer,
      seats: lic.seats,
      kind: lic.kind || 'full',   // 'demo' licences activate but never output
      machineId,
      issued: new Date().toISOString()
    };
    const payloadB64 = b64FromUtf8(JSON.stringify(payload));
    const sig = await signPayload(payloadB64);
    return { status: 200, body: { ok: true, license: { payload: payloadB64, sig } } };
  }

  async function deactivate({ key, machineId }) {
    if (!key || !machineId) return { status: 400, body: { ok: false, error: 'key and machineId required' } };
    const n = await store.deactivate(key.trim().toUpperCase(), machineId);
    return { status: 200, body: { ok: true, released: n } };
  }

  async function adminCreateKey({ customer, email, seats, note, kind }) {
    if (!customer) return { status: 400, body: { ok: false, error: 'customer required' } };
    if (kind && kind !== 'full' && kind !== 'demo') {
      return { status: 400, body: { ok: false, error: "kind must be 'full' or 'demo'" } };
    }
    const key = newKey();
    await store.createLicense({
      key, customer,
      email: email || '',
      seats: Math.max(1, Math.min(100, +seats || 1)),
      note: note || '',
      kind: kind === 'demo' ? 'demo' : 'full'
    });
    return { status: 200, body: { ok: true, key, kind: kind === 'demo' ? 'demo' : 'full' } };
  }

  async function adminList() {
    return { status: 200, body: { ok: true, rows: await store.listLicenses() } };
  }

  return { activate, deactivate, adminCreateKey, adminList };
}

function newKey() {
  // BLKM-XXXX-XXXX-XXXX-XXXX — unambiguous alphabet (no 0/O/1/I)
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rnd = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...rnd].map((b) => alpha[b % alpha.length]);
  return 'BLKM-' + [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/* ---------- Ed25519 signing (WebCrypto — same code runs in Node tests) ---------- */

export async function makeSigner(pkcs8B64) {
  if (!pkcs8B64) throw new Error('LICENSE_SIGNING_KEY secret is not set');
  let der;
  try {
    der = Uint8Array.from(atob(String(pkcs8B64).trim()), (c) => c.charCodeAt(0));
  } catch (_e) {
    throw new Error('LICENSE_SIGNING_KEY is not valid base64 (upload signing-key.b64 verbatim)');
  }
  // Workers has spelled Ed25519 two ways depending on compatibility date;
  // accept either so the deployment does not hinge on that detail.
  let key = null, algo = null, firstErr = null;
  for (const a of [{ name: 'Ed25519' }, { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' }]) {
    try {
      key = await crypto.subtle.importKey('pkcs8', der, a, false, ['sign']);
      algo = a;
      break;
    } catch (err) { if (!firstErr) firstErr = err; }
  }
  if (!key) {
    throw new Error('Runtime rejected the Ed25519 signing key: ' + ((firstErr && firstErr.message) || firstErr));
  }
  return async (payloadB64) => {
    const sig = await crypto.subtle.sign(algo, key, new TextEncoder().encode(payloadB64));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
  };
}

/* ---------- D1 store ---------- */

function d1Store(db) {
  return {
    getLicense: (key) => db.prepare('SELECT * FROM licenses WHERE key = ?').bind(key).first(),
    getActivations: async (key) =>
      (await db.prepare('SELECT * FROM activations WHERE license_key = ? AND deactivated_at IS NULL').bind(key).all()).results,
    insertActivation: (key, machineId, machineName) =>
      db.prepare('INSERT INTO activations (license_key, machine_id, machine_name, activated_at) VALUES (?, ?, ?, datetime(\'now\'))')
        .bind(key, machineId, machineName).run(),
    deactivate: async (key, machineId) => {
      const r = await db.prepare('UPDATE activations SET deactivated_at = datetime(\'now\') WHERE license_key = ? AND machine_id = ? AND deactivated_at IS NULL')
        .bind(key, machineId).run();
      return r.meta.changes;
    },
    createLicense: (l) =>
      db.prepare('INSERT INTO licenses (key, customer, email, seats, note, kind, status, created_at) VALUES (?, ?, ?, ?, ?, ?, \'active\', datetime(\'now\'))')
        .bind(l.key, l.customer, l.email, l.seats, l.note, l.kind || 'full').run(),
    listLicenses: async () =>
      (await db.prepare(`SELECT l.*, (SELECT COUNT(*) FROM activations a WHERE a.license_key = l.key AND a.deactivated_at IS NULL) AS seats_used
                         FROM licenses l ORDER BY l.created_at DESC`).all()).results
  };
}

/* ---------- HTTP wrapper ---------- */

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/* Exercises every dependency so a deploy can be checked in one request,
   instead of discovering a missing secret or table on a customer's first
   activation. Reports which part is broken, never the secret itself. */
async function health(env) {
  const out = { ok: true, product: PRODUCT, db: 'ok', signing: 'ok', adminToken: env.ADMIN_TOKEN ? 'set' : 'MISSING' };
  try {
    await env.DB.prepare('SELECT COUNT(*) AS n FROM licenses').first();
  } catch (err) {
    out.ok = false;
    out.db = 'FAILED — ' + ((err && err.message) || err) +
      ' (run: wrangler d1 execute blk-motion-license --remote --file=schema.sql)';
  }
  try {
    const sign = await makeSigner(env.LICENSE_SIGNING_KEY);
    const sig = await sign('healthcheck');
    if (!sig || sig.length < 32) throw new Error('signature was empty');
  } catch (err) {
    out.ok = false;
    out.signing = 'FAILED — ' + ((err && err.message) || err);
  }
  if (!env.ADMIN_TOKEN) out.ok = false;
  return out;
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (err) {
      // a bare 500 tells nobody anything — say what broke
      return json(500, { ok: false, error: 'Server error: ' + ((err && err.message) || String(err)) });
    }
  }
};

async function route(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/health') {
      const h = await health(env);
      return json(h.ok ? 200 : 503, h);
    }

    const api = createApi(d1Store(env.DB), await makeSigner(env.LICENSE_SIGNING_KEY));

    if (path.startsWith('/admin/')) {
      const auth = request.headers.get('authorization') || '';
      if (auth !== 'Bearer ' + env.ADMIN_TOKEN) return json(401, { ok: false, error: 'unauthorized' });
      if (path === '/admin/keys' && request.method === 'POST') {
        const r = await api.adminCreateKey(await request.json());
        return json(r.status, r.body);
      }
      if (path === '/admin/licenses' && request.method === 'GET') {
        const r = await api.adminList();
        return json(r.status, r.body);
      }
      return json(404, { ok: false, error: 'not found' });
    }

    if (request.method !== 'POST') return json(405, { ok: false, error: 'POST only' });
    let body;
    try { body = await request.json(); } catch { return json(400, { ok: false, error: 'invalid JSON' }); }
    if (path === '/activate') { const r = await api.activate(body); return json(r.status, r.body); }
    if (path === '/deactivate') { const r = await api.deactivate(body); return json(r.status, r.body); }
    return json(404, { ok: false, error: 'not found' });
}
