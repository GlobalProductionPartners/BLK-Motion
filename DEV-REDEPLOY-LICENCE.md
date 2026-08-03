# Licence server — one redeploy needed

Hi — activation is failing in the app. It needs **one redeploy** and **one
check**. Should take five minutes.

Good news first: the earlier signing crash is already solved by the deploy you
did. `/health` reports `"signing":"ok"`, so Ed25519 works fine on the Worker.
Only one bug is left, and the fix is already committed.

---

## What is wrong

Activation returns:

```
{"ok":false,"error":"Server error: btoa() can only operate on characters in the Latin1 (ISO/IEC 8859-1) range."}
```

The licence payload was base64-encoded with `btoa()`, which only accepts
Latin1. Any customer name containing an accent, a curly apostrophe or an
em-dash — `Café`, `Ólafur’s`, `BLK — Tour` — throws and kills the activation.
The key we are testing with has one of those characters in its customer name.

Fixed on `main`: the payload is encoded as UTF-8 bytes before base64. Licences
issued before the fix still validate, because plain ASCII is already valid
UTF-8. Nothing is invalidated.

---

## Do this

```sh
git pull
cd licensing/worker
wrangler deploy
```

## Then run this from the repo root

```sh
node licensing/scripts/check-server.mjs --key BLKM-8ZXY-AG4Q-KPLV-DCZP
```

It checks health, activates the key, verifies the signature against the public
key compiled into the app, and **releases the seat it used** so the key is left
untouched.

### What you want to see

```
PASS · health
PASS · activate
PASS · signature is accepted by THIS BUILD of the app
PASS · payload readable and bound to this machine
PASS · test seat released

RESULT: server is healthy and its licences will be accepted by this build.
```

That means it is done — tell Andrew and he can activate in the app.

---

## If the signature check fails

If everything passes **except** `signature is accepted by THIS BUILD of the app`,
there is a second, separate issue: the Worker is signing with a different key
than the app verifies with.

The licence is signed by the Worker with a **private** key and verified by the
app with the **public** key in `src/main/license.js`. They must be two halves of
one pair. The private key committed in the repo does **not** match the public
key in the app — the pair was regenerated at some point:

```
private key in licensing/signing-key.b64 derives to
  MCowBQYDK2VwAyEAOA6EH6hzsCNYomDcXEkz/oAclfetiCOmZ58hylhOEh4=

public key embedded in src/main/license.js
  MCowBQYDK2VwAyEApsOaVD8qt3LLkL0BJ3RhNhmdzXDX6gRYsxZlMi8QYm0=
```

If you have the `signing-key.b64` that pairs with `MCowBQYDK2VwAyEApsOa…`
(it will be on whichever machine regenerated the pair), upload it:

```sh
cd licensing/worker
wrangler secret put LICENSE_SIGNING_KEY < /path/to/matching/signing-key.b64
wrangler deploy
```

Then re-run `check-server.mjs`.

**If nobody has that private key, stop and talk to Andrew before doing anything
else.** The only remaining route is generating a fresh pair and updating the app,
which **invalidates every licence already issued** — every activated machine
would have to re-activate. That is his call, not a technical one.

Full background is in `FIX-LICENCE-SERVER.md`.

---

## Useful to know

- `curl <WORKER-URL>/health` now tests the whole chain — D1, signing, admin
  token — and returns 503 naming whichever part is broken. Check it here first
  whenever something looks wrong.
- Uncaught errors now return their message instead of Cloudflare's opaque
  `1101`, which is how this bug was found.
- Revoking a key (`status='revoked'` in D1) blocks **new** activations only.
  Machines already activated keep working offline — deliberate, so a show rig
  never dies for want of a network.
- The worker URL is `https://blk-motion-license.jason-8b6.workers.dev`.
