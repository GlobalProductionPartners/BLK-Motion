# BLK Motion — website copy

Drafted from what the application actually does today. Marketing language is
yours to adjust, but every capability listed here is implemented and working —
nothing is aspirational. Check anything about **specific third-party hardware**
against your own bench testing before publishing (see *Claims to verify*).

---

## One-liner

**Show control for kinetic light.** Design, programme and run winch-driven
rigs — from one motor to hundreds.

## Short blurb (≈40 words)

BLK Motion is desktop show-control software for kinetic lighting. Patch your
winches, place them exactly as they hang, build motion cues on a timeline, and
drive the rig over Art-Net, sACN or USB-DMX — with a live 3D view that moves at
the real speed of your hardware.

## Longer blurb (≈100 words)

BLK Motion is show-control software built specifically for kinetic light —
winches, lifted spheres, tubes and stretch fabric. Import your rig straight from
an MVR, or lay it out by hand on a plan view with line, circle and curve tools.
Programme motion, dimmer and colour as waveforms distributed across the rig,
then arrange them on a timeline with audio and timecode. A built-in 3D monitor
shows exactly what the hardware will do, driven by the same engine as the DMX
output and constrained by each motor's real rated speed — so what you see is
what the rig does. Runs offline once licensed.

---

## Feature sections

### Design the rig, not a spreadsheet

- **MVR import** — bring in fixtures, DMX addressing and true 3D positions from
  Vectorworks or any MVR-capable design tool, with a mapping step so you decide
  which motor each imported fixture becomes.
- **Plan view layout** — position every motor on a top-down plan with a metre
  grid. Arrange a selection onto a **line, circle or curve**, drag to fine-tune,
  and confirm before it commits.
- **Exact coordinates** — X, Y and Z per fixture in metres, editable in the
  patch or on the plan; both stay in step.
- **Selection groups** — name any selection and scope cues or timeline tracks to
  it.
- **Roadcase** — keep fixtures patched but out of the show. They hold their
  addresses, disappear from the plan and the visualiser, and stay dark and
  retracted until you place them.

### Programme motion

- **Waveform cues** — sine, triangle, square, ramp, random, static, or an
  imported **image or video** used as a moving bitmap. Any waveform can drive
  motion, dimmer or colour.
- **Spatial distribution** — direction (left→right, centre-out, diagonal and
  more), wings, blocks, groups, shuffle and wave width, so a single cue reads
  across the whole rig.
- **Height in percent** — cues are written as a percentage of each fixture's
  travel, so one cue reads correctly on a mixed rig of different cable lengths.
  Push past 100% to hold the rig at the deck or the truss for part of a cycle.
- **Cue pages** — as many pages of cues as a show needs, renameable, with
  drag-to-reposition, copy/paste and presets.

### Timeline

- Multiple tracks, each scoped to a group and filtered to motion, dimmer and/or
  colour.
- **Audio file with waveform display**, BPM markers and beat snapping.
- Timecode in **HH:MM:SS:FF**, loop or play-once.
- **Mark containers** — move the rig into position for the next cue, silently
  and in the dark.
- **Saved timelines**, fired from a Timelines tab in the cue list like any other
  cue.

### See it before the rig moves

- Real-time 3D monitor driven by **the same engine as the DMX output** — the
  visualiser and the wire are the same numbers, not an approximation.
- Motion is limited by each motor's **real rated speed**, so an impossible cue
  looks impossible on screen instead of surprising you on site.
- **Cloth mode** — render the rig as fabric pinned to every motor, relaxed under
  gravity so it drapes and trails like real stretch material.
- Show the **motors and cables**, free-orbit or lock to front/top/side, in
  perspective or orthographic.

### Outputs and control

| | |
|---|---|
| **Art-Net** | Output and input, configurable universe, port and broadcast/unicast target |
| **sACN (E1.31)** | Output and input, configurable priority |
| **USB-DMX** | ENTTEC Pro protocol and Open DMX (host-timed) |
| **OSC** | Inbound remote control of cues, playbacks, pause and stop |
| **Console input** | Take Intensity, Colour and Position from a lighting desk — globally or per parameter |

**Console takeover** lets a desk drive the rig directly over Art-Net or sACN.
Each parameter is handed over completely, bypassing the app's cues — while patch
limits, rated speed and the E-Stop still apply to whatever the desk sends.

### Built for a live rig

- **Hard travel limits** per fixture — no cue, test or desk input can drive a
  motor past its patched top and bottom.
- **Speed limiting** — every movement is slewed at the motor's rated speed, with
  per-model calibration.
- **E-Stop freezes in place.** An emergency stop never creates movement: the rig
  holds exactly where it is and goes dark, and resetting the latch does not move
  anything either. Homing is a separate, deliberate hold-to-confirm action.
- **Safe Edit mode** blocks output while you programme.
- **Start heights** — each fixture rests where you want it when nothing is
  driving it.
- Motor speed calibration against the real hardware.

### Practical

- Undo/redo throughout, save/load show files, autosave with recovery.
- Rearrangeable panels: drag to resize, snap, pop out into separate OS windows,
  and save named layouts.
- Runs entirely offline.

---

## Licensing

- **Hardware-locked, one-time online activation.** The machine contacts the
  licence server once, then runs fully offline — including on isolated show
  networks with no internet.
- Multiple seats per licence; move a licence between machines by deactivating.
- **Demo licences** available: the full application with all input and output
  disabled, for evaluation without a rig.

## System requirements

- **macOS 10.15+** — Apple Silicon and Intel builds.
- Windows build configuration is in place. *(Confirm your own testing before
  advertising Windows availability.)*
- A network interface for Art-Net/sACN, or a USB-DMX interface.
- No internet required after activation.

---

## Claims to verify before publishing

These depend on your hardware testing, not on the software:

1. **Specific interfaces** — the USB-DMX support implements the ENTTEC Pro
   protocol and Open DMX timing. Name only the models you have actually tested.
2. **Specific consoles** — console input is standard Art-Net/sACN, so it should
   work with any desk that outputs them, but only claim desks you have proven.
3. **Fixture compatibility** — the built-in profile matches the ES-L29 channel
   layouts (5/6/9/10 channel modes). Confirm against the firmware your units
   ship with.
4. **Windows** — build config exists; verify a real build before listing it.
5. **Fixture count** — the patch accepts up to 512 fixtures. State a figure you
   have run in anger.
