# Fix: licence server returns 500 on activation

**Symptom:** entering a valid key in BLK Motion fails. Activating by hand returns
Cloudflare `error code: 1101` with HTTP 500.

There are **two separate faults**. Fault 1 is fixed in the repo and just needs
redeploying. Fault 2 is a key mismatch on the Cloudflare side and needs a
decision from whoever regenerated the keypair.

Everything below runs from `licensing/worker/` unless stated. Replace
`<WORKER-URL>` with `https://blk-motion-license.jason-8b6.workers.dev`.

---

## Fault 1 — the Worker crashes while signing (fixed in code)

**Why it happened.** `makeSigner()` started the Ed25519 key import *without
awaiting it*. A rejected import therefore stayed invisible until something
actually called `sign()` — which only happens on a **successful** activation.
That is why a bogus key returned a clean `404 Unknown license key` while a real
key returned 1101. The seat was even consumed before the crash.

**The fix** (already committed): the import is awaited, both spellings of
Ed25519 that the Workers runtime has used are accepted, `/health` now exercises
the whole chain, and uncaught throws return their message instead of a bare 500.

**Also fixed in the same redeploy — non-ASCII customer names.** The licence
payload was base64-encoded with `btoa()`, which only accepts Latin1. A customer
name containing a curly apostrophe, an accent or an em-dash (`Ólafur's`,
`Café Lumière`, `BLK — Tour`) threw:

```
Server error: btoa() can only operate on characters in the Latin1 (ISO/IEC 8859-1) range.
```

The payload is now encoded as UTF-8 bytes first. Licences issued before the fix
still validate, since plain ASCII is already valid UTF-8.

### Do this

```sh
git pull
cd licensing/worker
wrangler deploy
```

### Then check it — one request tells you everything

```sh
curl <WORKER-URL>/health
```

Healthy:

```json
{"ok":true,"product":"blk-motion","db":"ok","signing":"ok","adminToken":"set"}
```

It returns **503** if anything is wrong, and names the part:

| Field | Meaning if not `ok` | Fix |
|---|---|---|
| `db` | tables missing | `wrangler d1 execute blk-motion-license --remote --file=schema.sql` |
| `signing` | signing key missing / malformed / rejected | see Fault 2, and re-put the secret |
| `adminToken` | `MISSING` | `wrangler secret put ADMIN_TOKEN` |

---

## Fault 2 — the two halves of the keypair do not match

**This will still break activation even after Fault 1 is fixed**, with the app
reporting *"Server sent an invalid license: Invalid license signature."*

The licence is signed by the Worker with a **private** key, and verified by the
app with the **public** key compiled into `src/main/license.js`. They must be
two halves of the same pair. Right now they are not — the pair was regenerated
at some point:

```
private key in licensing/signing-key.b64 derives to
  MCowBQYDK2VwAyEAOA6EH6hzsCNYomDcXEkz/oAclfetiCOmZ58hylhOEh4=

public key embedded in src/main/license.js
  MCowBQYDK2VwAyEApsOaVD8qt3LLkL0BJ3RhNhmdzXDX6gRYsxZlMi8QYm0=
```

Verify this yourself at any time, from the repo root:

```sh
node -e "
const {createPublicKey,createPrivateKey}=require('crypto'), fs=require('fs');
const priv=createPrivateKey({key:Buffer.from(fs.readFileSync('licensing/signing-key.b64','utf8').trim(),'base64'),format:'der',type:'pkcs8'});
const derived=createPublicKey(priv).export({type:'spki',format:'pem'}).trim();
const app=fs.readFileSync('src/main/license.js','utf8').match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/)[0].trim();
console.log('MATCH:', derived===app);
"
```

### Pick ONE of these

**A. The newer key is the real one (preferred if any licence has ever been issued
from it).** Find the `signing-key.b64` that pairs with
`MCowBQYDK2VwAyEApsOa…` — it is on the machine of whoever regenerated the pair —
and upload it:

```sh
cd licensing/worker
wrangler secret put LICENSE_SIGNING_KEY < /path/to/the/matching/signing-key.b64
wrangler deploy
```

Then re-run the MATCH check above with that file in place; it must print `true`.

**B. Nobody has the newer private key.** Then the app's public key is unusable
and must be replaced. Generate a fresh pair and wire both halves together:

```sh
# repo root
node licensing/scripts/generate-keypair.mjs      # writes licensing/signing-key.b64, prints the public key
# paste the printed public key into LICENSE_PUBLIC_KEY in src/main/license.js
cd licensing/worker
wrangler secret put LICENSE_SIGNING_KEY < ../signing-key.b64
wrangler deploy
```

> ⚠️ Option B **invalidates every licence already issued.** Any machine already
> activated will fail verification and have to activate again. Only take this
> route if option A is genuinely impossible.

### Confirm the halves agree

From the repo root, with the matching private key in place:

```sh
node licensing/scripts/worker-test.mjs
```

`RESULT: ALL PASS` means the Worker's signatures will be accepted by the app.
If it prints a `CONFIG ·` line, the halves still disagree — do not ship.

---

## Final end-to-end check

```sh
# 1. server healthy
curl <WORKER-URL>/health

# 2. issue a throwaway key
curl -X POST <WORKER-URL>/admin/keys \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"customer":"Smoke test","seats":1}'

# 3. activate it as a fake machine — expect {"ok":true,"license":{...}}
curl -X POST <WORKER-URL>/activate \
  -H "Content-Type: application/json" \
  -d '{"key":"<KEY FROM STEP 2>","machineId":"smoke-test"}'

# 4. release the seat again
curl -X POST <WORKER-URL>/deactivate \
  -H "Content-Type: application/json" \
  -d '{"key":"<KEY FROM STEP 2>","machineId":"smoke-test"}'
```

Then activate for real in the app. A **500 at step 3** means Fault 1 is not
deployed. A step 3 that succeeds but the **app** rejecting the licence means
Fault 2 is not resolved.

If step 2 uses a customer name with accents or curly punctuation, it also
confirms the UTF-8 fix is live.

---

## Notes

- The existing key `BLKM-8ZXY-AG4Q-KPLV-DCZP` is intact and has all seats free —
  a diagnostic activation was made against it and released again.
- Revoking a key (`status='revoked'` in D1) blocks **new** activations only.
  Machines already activated keep working offline; that is deliberate, so a
  show rig never dies for want of a network.
- To run the app without licensing while developing: `npm run start:dev`.
  The flag is ignored in packaged builds.
