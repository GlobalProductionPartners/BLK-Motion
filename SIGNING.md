# Signing & notarising BLK Motion for macOS

The build config is already set up: Hardened Runtime, entitlements, and
notarisation are wired in. What is missing on this machine is the **certificate**
and the **notary credentials** — both live in your keychain, never in the repo.

Until they exist, `npm run dist:mac` still works and simply produces an
**unsigned** build (electron-builder skips signing and notarisation rather than
failing). Users of an unsigned build get *"cannot be opened because the developer
cannot be verified"* and must right-click → Open.

Current state on this machine:

```
$ security find-identity -v -p codesigning
     0 valid identities found          ← certificate not installed yet
```

---

## 1. Install the Developer ID certificate

You need a **Developer ID Application** certificate — *not* "Apple Development"
or "Apple Distribution", which cannot sign apps distributed outside the App
Store.

**Easiest route (Xcode):**
1. Xcode → Settings → Accounts → add your Apple ID if it isn't there.
2. Select the team → **Manage Certificates…**
3. **+** → **Developer ID Application**.

**Or by hand:** create it at
<https://developer.apple.com/account/resources/certificates/list>, download the
`.cer`, and double-click it to install into the **login** keychain.

> Only an Account Holder or Admin on the Apple Developer team can create a
> Developer ID certificate. If the button is greyed out, that is why.

Verify:

```sh
security find-identity -v -p codesigning
# 1) ABC123... "Developer ID Application: Your Company (TEAMID)"
#    1 valid identities found
```

Note the **TEAMID** in the brackets — you need it below.

---

## 2. Store notary credentials

Apple notarises by uploading the signed app. Authenticate once and store it in
the keychain.

First create an **app-specific password** (not your Apple ID password) at
<https://account.apple.com> → Sign-In and Security → App-Specific Passwords.

```sh
xcrun notarytool store-credentials "blk-notary" \
  --apple-id "you@example.com" \
  --team-id "TEAMID" \
  --password "abcd-efgh-ijkl-mnop"
```

Check it works:

```sh
xcrun notarytool history --keychain-profile "blk-notary"
```

---

## 3. Tell the build about it

electron-builder reads notarisation credentials from the environment. Put these
in your shell profile, or prefix the build command:

```sh
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="TEAMID"
```

> ⚠️ These are credentials. Keep them out of the repo, out of screenshots, and
> out of CI logs. If one leaks, revoke the app-specific password at
> account.apple.com — it is independent of your Apple ID password.

The certificate itself is found automatically in the keychain; there is nothing
to configure for it.

---

## 4. Build

```sh
npm run dist:mac
```

Signing and notarisation now happen inline. Notarisation uploads to Apple and
typically takes **2–10 minutes per architecture**, so expect the build to be
noticeably slower. You will see:

```
• signing         file=release/mac-arm64/BLK Motion.app  identityName=Developer ID Application: ...
• notarizing      appPath=release/mac-arm64/BLK Motion.app
• notarization successful
```

If it still says `skipped macOS application code signing  reason=cannot find
valid "Developer ID Application" identity`, step 1 has not taken effect — the
certificate is missing or is the wrong type.

---

## 5. Verify before you ship

```sh
APP="release/mac-arm64/BLK Motion.app"

# signed, with a hardened runtime?
codesign -dv --verbose=4 "$APP" 2>&1 | grep -E "Authority|flags"
#   Authority=Developer ID Application: Your Company (TEAMID)
#   flags=0x10000(runtime)          ← hardened runtime present

# signature intact across the whole bundle?
codesign --verify --deep --strict --verbose=2 "$APP"

# would Gatekeeper accept it on a clean Mac?
spctl -a -vvv -t install "$APP"
#   accepted
#   source=Notarized Developer ID   ← the ticket is stapled

# and the DMG itself
spctl -a -vvv -t open --context context:primary-signature "release/BLK Motion-0.1.0-arm64.dmg"
```

`source=Notarized Developer ID` is the one that matters — it means a customer
can open the app with a normal double-click, no right-click workaround.

The real test is a **different** Mac: copy the DMG over (or download it, so it
carries the quarantine flag) and open it. A machine that built the app can open
it regardless, so it proves nothing.

---

## Notes

- **Both architectures get signed and notarised** — the build produces arm64 and
  x64 DMGs and ZIPs, and each is handled separately.
- The entitlements in `build/entitlements.mac.plist` are the minimum a hardened
  Electron app needs: JIT for V8, `DYLD_*` for Electron's helper processes, and
  library validation disabled because `serialport` loads a prebuilt native
  binding for USB-DMX widgets. The app is deliberately **not** sandboxed — it
  has to reach the network and USB freely.
- **Developer ID certificates expire after 5 years**, but apps already notarised
  keep working. You only need a valid certificate to sign *new* builds.
- Signing does not replace the licence gate; it is what stops macOS warning
  users that the app is untrusted.
