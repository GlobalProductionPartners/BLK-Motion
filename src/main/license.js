/*
 * Hardware-locked licensing, offline-first.
 *
 * Activation (the ONLY step needing network) sends the license key plus this
 * machine's fingerprint to the license server and stores the Ed25519-signed
 * blob it returns in userData/license.json. Every launch after that verifies
 * the local file against the embedded public key and the current fingerprint —
 * fully offline, so a show machine on an isolated Art-Net LAN never phones
 * home. Copying the file to different hardware fails the fingerprint check.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { app } = require('electron');

// Verification half of the licensing keypair. The signing half exists only as
// a Cloudflare Worker secret (see licensing/README.md). Rotating the pair
// invalidates every issued license — regenerate only on purpose.
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApsOaVD8qt3LLkL0BJ3RhNhmdzXDX6gRYsxZlMi8QYm0=
-----END PUBLIC KEY-----`;

// Default server; overridable per-install from Settings → License → Server.
const LICENSE_SERVER = 'https://blk-motion-license.jason-8b6.workers.dev';

const PRODUCT = 'blk-motion';

/* ---------- machine fingerprint ---------- */

function rawHardwareId() {
  try {
    if (process.platform === 'darwin') {
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice', { timeout: 5000 }).toString();
      const m = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    } else if (process.platform === 'win32') {
      const out = execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { timeout: 5000 }).toString();
      const m = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
      if (m) return m[1];
    } else {
      return fs.readFileSync('/etc/machine-id', 'utf8').trim();
    }
  } catch (_err) { /* fall through to persisted id */ }
  return null;
}

let cachedMachineId = null;
function machineId() {
  if (cachedMachineId) return cachedMachineId;
  let raw = rawHardwareId();
  if (!raw) {
    // No OS identifier available: persist a random one so the lock is at
    // least install-stable (weaker than a hardware bind, but never blocks).
    const p = path.join(app.getPath('userData'), 'machine-id');
    try { raw = fs.readFileSync(p, 'utf8').trim(); }
    catch (_err) {
      raw = crypto.randomUUID();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, raw, 'utf8');
    }
  }
  cachedMachineId = crypto.createHash('sha256').update('blkmotion|' + raw).digest('hex').slice(0, 32);
  return cachedMachineId;
}

/* ---------- local license file ---------- */

function licensePath() {
  return path.join(app.getPath('userData'), 'license.json');
}

function verifyBlob(blob) {
  if (!blob || typeof blob.payload !== 'string' || typeof blob.sig !== 'string') {
    return { licensed: false, error: 'Malformed license file' };
  }
  const ok = crypto.verify(
    null,
    Buffer.from(blob.payload, 'utf8'), // signature covers the base64 payload text
    crypto.createPublicKey(LICENSE_PUBLIC_KEY),
    Buffer.from(blob.sig, 'base64')
  );
  if (!ok) return { licensed: false, error: 'Invalid license signature' };
  let lic;
  try { lic = JSON.parse(Buffer.from(blob.payload, 'base64').toString('utf8')); }
  catch (_err) { return { licensed: false, error: 'Corrupt license payload' }; }
  if (lic.product !== PRODUCT) return { licensed: false, error: 'License is for a different product' };
  if (lic.machineId !== machineId()) return { licensed: false, error: 'License is bound to a different machine' };
  return { licensed: true, key: lic.key, customer: lic.customer, seats: lic.seats,
           kind: lic.kind === 'demo' ? 'demo' : 'full', issued: lic.issued };
}

function status() {
  let blob = null;
  try { blob = JSON.parse(fs.readFileSync(licensePath(), 'utf8')); }
  catch (_err) { /* no file yet */ }
  const st = blob ? verifyBlob(blob) : { licensed: false, error: null };
  st.machineId = machineId();
  st.machineName = os.hostname();
  st.enforced = app.isPackaged; // dev runs are never blocked
  return st;
}

/* ---------- server calls (activation is the one online moment) ---------- */

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  let data = null;
  try { data = await res.json(); } catch (_err) { /* non-JSON error page */ }
  if (!data) data = { ok: false, error: 'Server returned ' + res.status };
  return data;
}

async function activate(serverUrl, key) {
  const base = (serverUrl || LICENSE_SERVER).replace(/\/+$/, '');
  let data;
  try {
    data = await postJson(base + '/activate', {
      key: (key || '').trim().toUpperCase(),
      machineId: machineId(),
      machineName: os.hostname()
    });
  } catch (err) {
    return { ok: false, error: 'Could not reach the license server — check the network and server URL. (' + err.message + ')' };
  }
  if (!data.ok) return { ok: false, error: data.error || 'Activation refused' };
  const st = verifyBlob(data.license);
  if (!st.licensed) return { ok: false, error: 'Server sent an invalid license: ' + st.error };
  fs.writeFileSync(licensePath(), JSON.stringify(data.license), 'utf8');
  return { ok: true, status: status() };
}

async function deactivate(serverUrl) {
  const st = status();
  if (!st.key) return { ok: false, error: 'No license installed' };
  const base = (serverUrl || LICENSE_SERVER).replace(/\/+$/, '');
  try {
    await postJson(base + '/deactivate', { key: st.key, machineId: machineId() });
  } catch (err) {
    return { ok: false, error: 'Could not reach the license server to free the seat. (' + err.message + ')' };
  }
  try { fs.unlinkSync(licensePath()); } catch (_err) { /* already gone */ }
  return { ok: true, status: status() };
}

module.exports = { status, activate, deactivate, machineId };
