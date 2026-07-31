# BLK Motion

Show control for the BLK RISE kinetic winch — a real, cross-platform (macOS + Windows) Electron desktop app.

The renderer is the full operator UI (cue grid with live states, Motion/Dimmer/Colour effect engine with directions/wings/blocks/width/shuffle, phase sync, slew-physics 3D monitor, selection-driven patch with SEQ addressing, BLK RISE library, presets, Pause Motion, E-Stop) and it drives a **real output engine**: the exact signal chain the Monitor renders — waveform → drop → DMX 0–255 → scaled into each channel's Top/Bottom limits — streamed as genuine Art-Net broadcast + sACN multicast at 25 Hz, with OSC remote control inbound on UDP 8000.

## BLK RISE DMX personality (6-channel mode — assumption until the final channel map is confirmed)

| Ch | Function |
|---|---|
| 1 | Position (0 = top, 255 = full drop) |
| 2 | Speed (scaled to the model's rated max) |
| 3 | Dimmer |
| 4–6 | Red / Green / Blue |

Channels are patched with a 6-channel footprint (winch 1 = 2.1, winch 2 = 2.7, …); the Sequential patch dialog steps by 6.

**Output rules:** Edit mode blocks output entirely. E-Stop (Stop All / Space / OSC `/blk/allstop`) streams each channel's own Top limit with dimmer 0. Pause Motion freezes the output clock in place. Travel limits *scale* the effect into the channel's window — they never clip it.

**OSC remote:** `/blk/allstop`, `/blk/pause`, `/blk/playback/<red|blue|green|yellow>/<start|stop>`, `/blk/cue/<n>`.

It has not been validated against real winch hardware, and safety systems are software-side only (see **Status & limitations** below).

## Running in development

```
npm install
npm start
```

Opens the BLK Motion window. Requires a real desktop session — it will not run headless (this repo was built in a sandboxed CLI environment that couldn't launch the GUI directly; the Electron main-process logic was verified with a mocked Electron API instead — see `src/main/main.js` and the protocol modules for what's genuinely tested vs. what still needs a first real run on your machine).

## Building installers

```
npm run dist:mac    # .dmg + .zip, arm64 + x64
npm run dist:win    # NSIS installer + portable .exe
npm run dist        # both
```

Output lands in `release/`. Builds are **unsigned** — no Apple Developer ID or Windows code-signing certificate is configured, so macOS Gatekeeper and Windows SmartScreen will both warn on first launch. That's expected for a dev build; signing is a real requirement before distributing this outside the team (see below).

Building the Windows target from an Apple Silicon Mac requires Rosetta 2 (electron-builder shells out to a Wine-based `rcedit.exe` to embed the icon/version info into the `.exe`). If it's not installed: `softwareupdate --install-rosetta`.

## Project structure

```
src/
  main/main.js          Electron main process — window, native menu, IPC handlers
  preload/preload.js     contextBridge — the only surface the renderer can reach into main
  renderer/index.html    The UI (cue table, 3D viewport, patch, live) — one file, no build step
  protocols/
    artnet.js            Real Art-Net (ArtDmx + ArtPoll/ArtPollReply) over UDP broadcast
    sacn.js              Real sACN / ANSI E1.31 (Root/Framing/DMP layers) over UDP multicast
    osc.js                Real OSC message encode/decode over UDP
    selftest.js           Standalone protocol correctness check — run with `node src/protocols/selftest.js`
build/
  icon.icns, icon.ico     App icons (generated from the BLK wordmark)
```

## What's real vs. what's still ahead

**Real:**
- Art-Net `ArtDmx` packets are spec-correct (verified byte-for-byte in `selftest.js`) and actually broadcast over UDP when a playback is running.
- sACN packets follow the ANSI E1.31 Root/Framing/DMP layer structure exactly (also verified in `selftest.js`) and multicast to the correct `239.255.x.x` group.
- OSC send/receive round-trips over a real UDP socket. Incoming `/blk/playback/<color>/start|stop` and `/blk/allstop` genuinely drive the app — this app can be triggered by an external console or show file today.
- Show save/load writes real `.blkshow` JSON files to disk via native OS dialogs.
- The four-playback cue engine, keyboard shortcuts (F1–F8, Space, F12, Page Up/Down, Home/End), dead-man's handle gating, and per-channel top/bottom travel limits are all functional in the UI, not just visual.

**Not yet real — the honest gaps:**
- No device has ever confirmed receipt of a packet from this app. `Auto-Discover` sends a genuine `ArtPoll`, but there's no physical winch on the network to reply to it in this environment.
- The RISE 6-channel personality above is a documented assumption — confirm the real channel map from the fixture manual and adjust `FOOTPRINT`/channel order in the renderer's output engine if it differs.
- The patch table's 24 winches, their load readings, and statuses are demo data, not a live device registry populated by discovery/RDM.
- Safety here is UI-level only (Edit-blocks-output, E-Stop recall, dead-man gating, limit scaling). None of it is backed by a certified hardware interlock.
- No code signing/notarization — required before this leaves the team.
- The 3D monitor simulates rig physics (slew at rated speed) from the outgoing signal; it does not yet show positions reported back from hardware.

## Protocols implemented

| Protocol | Port | What's implemented |
|---|---|---|
| Art-Net | UDP 6454 | `ArtDmx` (send), `ArtPoll`/`ArtPollReply` (discovery) |
| sACN (E1.31) | UDP 5568 | DMX data packets, multicast |
| OSC | UDP 8000 (listen), arbitrary (send) | `int32`/`float32`/`string` args |

Console passthrough (the brief's grandMA3 → BLK Motion re-addressing model) is represented in the Patch view; the actual re-patching logic that would sit between an inbound Art-Net/sACN feed from a console and this app's own outbound universes is not yet built.

---
Global Production Partners / BLK
