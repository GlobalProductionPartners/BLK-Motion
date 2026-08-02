# BLK Motion — License Server Deployment (dev handoff)

**What this is:** BLK Motion now has hardware-locked licensing. The app phones
a tiny Cloudflare Worker **once** per machine to activate, gets back a signed
license file, and runs fully offline after that. The Worker + database code is
finished and tested in the repo — it just needs deploying to our Cloudflare
account. **~10–15 minutes.**

Everything lives in `licensing/` in the repo:
[github.com/GlobalProductionPartners/BLK-Motion](https://github.com/GlobalProductionPartners/BLK-Motion)

---

## You need

1. Access to our **Cloudflare account** (the Workers free tier covers this).
2. **Node.js** installed locally.
3. The file **`signing-key.b64`** — Andrew will send this separately over a
   secure channel (password manager / AirDrop). It is the private signing key:
   **never commit it, never email it.** Put it at `licensing/signing-key.b64`
   in your clone (that path is gitignored).

---

## Deploy — run these in order

```sh
git clone https://github.com/GlobalProductionPartners/BLK-Motion.git
cd BLK-Motion/licensing/worker

npm i -g wrangler
wrangler login                      # opens browser → log into our Cloudflare
```

**1. Create the database:**

```sh
wrangler d1 create blk-motion-license
```

This prints a `database_id` (a UUID). Open `wrangler.toml` in this folder and
replace `REPLACE-ME` with it.

**2. Create the tables:**

```sh
wrangler d1 execute blk-motion-license --remote --file=schema.sql
```

**3. Set the two secrets:**

```sh
# the signing key Andrew sent you (place it at licensing/signing-key.b64 first)
wrangler secret put LICENSE_SIGNING_KEY < ../signing-key.b64

# admin password for issuing license keys — generate a long random string,
# store it in the password manager BEFORE pasting it here
wrangler secret put ADMIN_TOKEN
```

**4. Ship it:**

```sh
wrangler deploy
```

This prints the live URL, something like
`https://blk-motion-license.<account>.workers.dev`.

---

## Verify it works

```sh
# health — expect {"ok":true,"product":"blk-motion"}
curl https://<worker-url>/health

# issue a test license key — expect {"ok":true,"key":"BLKM-XXXX-XXXX-XXXX-XXXX"}
curl -X POST https://<worker-url>/admin/keys \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"customer":"Deploy Test","seats":1}'

# activate it as a fake machine — expect {"ok":true,"license":{...}}
curl -X POST https://<worker-url>/activate \
  -H "Content-Type: application/json" \
  -d '{"key":"<key from above>","machineId":"deploy-test","machineName":"curl"}'

# a second fake machine must be refused (1 seat) — expect "All 1 seat(s) in use"
curl -X POST https://<worker-url>/activate \
  -H "Content-Type: application/json" \
  -d '{"key":"<key from above>","machineId":"another-machine"}'
```

If all four behave as noted, deployment is done.

---

## Send back to Andrew

1. **The worker URL** — it gets baked into the app as the default license
   server (`src/main/license.js`).
2. Confirmation that the **ADMIN_TOKEN is in the password manager** — it's how
   we issue every customer key, and it is not recoverable from Cloudflare
   (only resettable via `wrangler secret put` again).

---

## Notes

- **Do not regenerate the keypair** (`licensing/scripts/generate-keypair.mjs`)
  — that would invalidate every license ever issued. It exists for initial
  setup and deliberate rotation only.
- Revoking a customer key = set `status='revoked'` on their row in D1
  (Cloudflare dashboard → D1 → blk-motion-license). This blocks **new**
  activations; machines already activated keep working offline — intentional,
  a show rig must never die because it can't phone home.
- Day-to-day key issuing / listing / freeing seats is all `curl` against the
  admin endpoints — full examples in `licensing/README.md`.
- Local development against the real Worker code without touching Cloudflare:
  `node licensing/scripts/test-server.mjs` (in-memory DB, prints a test key),
  and `node licensing/scripts/worker-test.mjs` runs the 14-check test suite.
