// One-time setup: generates the Ed25519 licensing keypair.
//  - PRIVATE key -> licensing/signing-key.b64 (gitignored). Upload to Cloudflare:
//      wrangler secret put LICENSE_SIGNING_KEY < licensing/signing-key.b64
//  - PUBLIC key  -> printed as PEM. Embed in src/main/license.js (LICENSE_PUBLIC_KEY).
// Rotating the pair invalidates every issued license — only rerun on purpose.
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pkcs8b64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const spkiPem = publicKey.export({ type: 'spki', format: 'pem' });
writeFileSync(new URL('../signing-key.b64', import.meta.url), pkcs8b64 + '\n');
console.log('Private key written to licensing/signing-key.b64 (KEEP OUT OF GIT)');
console.log('\nPublic key — embed in src/main/license.js:\n');
console.log(spkiPem);
