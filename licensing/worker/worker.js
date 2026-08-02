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
      machineId,
      issued: new Date().toISOString()
    };
    const payloadB64 = btoa(JSON.stringify(payload));
    const sig = await signPayload(payloadB64);
    return { status: 200, body: { ok: true, license: { payload: payloadB64, sig } } };
  }

  async function deactivate({ key, machineId }) {
    if (!key || !machineId) return { status: 400, body: { ok: false, error: 'key and machineId required' } };
    const n = await store.deactivate(key.trim().toUpperCase(), machineId);
    return { status: 200, body: { ok: true, released: n } };
  }

  async function adminCreateKey({ customer, email, seats, note }) {
    if (!customer) return { status: 400, body: { ok: false, error: 'customer required' } };
    const key = newKey();
    await store.createLicense({
      key, customer,
      email: email || '',
      seats: Math.max(1, Math.min(100, +seats || 1)),
      note: note || ''
    });
    return { status: 200, body: { ok: true, key } };
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
  const der = Uint8Array.from(atob(pkcs8B64.trim()), (c) => c.charCodeAt(0));
  const keyPromise = crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);
  return async (payloadB64) => {
    const key = await keyPromise;
    const sig = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(payloadB64));
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
      db.prepare('INSERT INTO licenses (key, customer, email, seats, note, status, created_at) VALUES (?, ?, ?, ?, ?, \'active\', datetime(\'now\'))')
        .bind(l.key, l.customer, l.email, l.seats, l.note).run(),
    listLicenses: async () =>
      (await db.prepare(`SELECT l.*, (SELECT COUNT(*) FROM activations a WHERE a.license_key = l.key AND a.deactivated_at IS NULL) AS seats_used
                         FROM licenses l ORDER BY l.created_at DESC`).all()).results
  };
}

/* ---------- HTTP wrapper ---------- */

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/health') return json(200, { ok: true, product: PRODUCT });

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
};
