# BLK Motion UI/UX Improvement Brief

## Objective

Raise BLK Motion from a strong visual prototype to a dependable, best-in-class show-control interface. The work should improve operational safety, legibility, first-run clarity, and recoverability while preserving the existing dark, technical BLK visual language.

## Product principles

- Safety controls must remain visible, unambiguous, and usable at every supported window size.
- Live state must be understandable at a glance: output state, active cue, device health, and warnings.
- Dense information is appropriate, but primary labels and values must remain readable in low-light environments.
- Destructive or high-risk actions must be reversible or explicitly confirmed.
- Each workspace should prioritise the tools and information required for its task.

## UI direction

### Design intent

The target is a premium industrial control surface: precise, calm, dense, and highly legible in a dark production environment. It should feel closer to professional lighting, broadcast, and automation hardware than a conventional SaaS dashboard.

Preserve:

- The near-black palette and BLK identity
- Sharp panel geometry
- Monospaced numeric readouts
- Restrained motion
- Colour-coded motion, dimmer, and colour parameters

Avoid:

- Decorative gradients, glass effects, and neon glows
- Excessive rounded cards or pill-shaped controls
- Uppercase text for long labels and instructions
- Using low contrast as the primary method of creating hierarchy
- Filling every available area with controls

### Application anatomy

The interface should have three clear layers:

1. **Operational spine:** fixed title bar containing live state and safety controls
2. **Task navigation:** persistent left rail
3. **Workspace:** one dominant task surface with an optional contextual inspector

Suggested desktop structure:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Show identity │ Live state + health │ Output │ Pause │ STOP MOTION │
├──────┬────────────────────────────────────────────┬────────────────┤
│      │                                            │ Contextual     │
│ Rail │              Primary workspace             │ inspector      │
│      │                                            │                │
├──────┴────────────────────────────────────────────┴────────────────┤
│ Status, warnings, progress, and recoverable action messages        │
└────────────────────────────────────────────────────────────────────┘
```

At narrower sizes, the inspector should collapse or become an overlay. The operational spine and Stop Motion control must not collapse.

### Layout specifications

| Element | Recommended specification |
|---|---|
| Title bar | 52–56px high; three aligned zones; Stop Motion pinned right |
| Navigation rail | 60–64px wide; 48px minimum targets; icon plus readable label |
| Panel header | 36px high; title left, panel actions right |
| Standard content padding | 16px |
| Dense table padding | 10–12px horizontal; 38–42px row height |
| Panel gutters | 4px minimum, 8px where task separation needs emphasis |
| Contextual inspector | 320–360px at 1440px; collapsible below approximately 1180px |
| Status bar | 28–32px; alerts prioritised over routine logs |

The main task surface should always receive the largest share of the window. Avoid permanent supporting panels that reduce the active workspace without adding context.

### Typography system

Use the display face sparingly for the BLK wordmark, cue names, and short high-level headings. Use the system sans-serif for controls and instructions, and the monospaced face for values, addresses, timing, and DMX data.

| Role | Size | Weight | Notes |
|---|---:|---:|---|
| Screen title | 18–20px | 600–700 | Display face permitted |
| Panel title | 13–14px | 600 | Short uppercase permitted |
| Primary control | 13px | 600 | Sentence case preferred |
| Body/instructions | 13px | 400 | 1.45–1.6 line height |
| Field label | 12px | 500–600 | Avoid ultra-wide tracking |
| Metadata | 11px minimum | 400–500 | Must remain readable |
| Important numeric value | 14–16px | 600 | Monospaced/tabular |

### Colour system

Use neutral value changes to establish structure and reserve colour for meaning.

| Token | Purpose | Direction |
|---|---|---|
| Background | App ground | Near black |
| Surface | Main panels | Clearly distinct from background |
| Raised surface | Controls, selected rows, cards | One visible step above surface |
| Primary text | Values, names, important labels | Near white |
| Secondary text | Normal metadata and help | Mid-light grey |
| Muted text | Nonessential annotations only | Must still meet contrast where readable text is required |
| Blue | Selection, information, motion category | Never used for safety |
| Amber | Attention, editing, dimmer category | Not interchangeable with fault |
| Green | Connected, healthy, running | Pair with icon/text |
| Red | Fault, destructive action, Stop Motion | Reserved and visually dominant |
| Purple | Colour category | Category use only |

Do not use colour alone to indicate state. Pair it with a label, icon, border pattern, or shape.

### Component language

#### Buttons

- Primary: light fill with dark text; one primary action per local section
- Secondary: raised dark surface with high-contrast label
- Destructive: red text or outline for recoverable deletion; solid red only for immediate danger
- Stop Motion: solid red, at least 44px high, visually isolated from routine controls
- Icon-only: at least 32×32px, visible tooltip, accessible name, clear hover and focus states
- Disabled: visibly disabled plus an explanation of why the action is unavailable

#### Segmented controls

- Use only for two to four mutually exclusive options
- Selected state must be obvious without relying only on a moving white background
- Do not use a segmented control for safety actions or modes requiring confirmation

#### Inputs

- Keep recessed wells, but use a visible resting boundary
- Place units inside a consistent trailing unit area rather than scattered adjacent text
- Show validation and safe operating limits close to the field
- Provide direct numeric entry alongside sliders and knobs

#### Tables

- Use a stronger header/body separation and 38–42px rows
- Keep status, ID, and name visible while horizontally scrolling a large patch
- Use zebra value changes very subtly or use hover/selected row surfaces
- Display online, warning, and fault with icon, label, and colour
- Put bulk actions in a contextual toolbar that appears after selection

#### Cue tiles

- Minimum height around 96px at standard density
- Prioritise cue number, name, duration, playback assignment, and current state
- Make the entire tile clickable with a clearly separate run/trigger behaviour where required
- Replace anonymous `+` placeholders with a labelled `Create cue` tile for the first empty position
- Use a visible focus treatment and non-colour indicators for queued, running, and overridden states

#### Panels and inspectors

- Keep corners sharp or use a consistent 2px radius; do not mix multiple corner styles
- Panel titles should remain visible when the body scrolls
- Pop-out, float, and close actions should use 32px targets
- Hide panel-management controls until hover only when keyboard focus still reveals them

### Interaction states

Every interactive component must define:

- Rest
- Hover
- Pressed
- Selected/active
- Keyboard focus
- Disabled
- Warning, where relevant
- Fault, where relevant

Use 120–180ms transitions for hover, selection, and panel changes. Safety state changes should be immediate. Honour reduced-motion preferences and avoid animated layout movement while output is live.

### Screen-specific UI direction

#### Show

- Make the cue grid the dominant surface.
- Put pages, Cues/Timeline, and playback mode in one clear local toolbar.
- Show a single labelled Create Cue action before rendering a wall of empty slots.
- Allow the lower editor to collapse, expand, or become the contextual inspector.
- Keep active and next cue visually distinct at a glance.

#### Patch

- Let the table use the full primary workspace width.
- Move fixture details, limits, and health into the contextual inspector.
- Show selection-dependent actions only after rows are selected.
- Make Add Fixtures and Auto-Discover the clear primary empty-state actions.

#### Layout

- Make the plan canvas dominant rather than placing instructions beside a large empty canvas.
- Put grid, spacing, and truss settings in a compact inspector.
- Make fixtures, occupied extents, stage front, and dimensions clearly visible.
- Add Frame Rig, Fit Selection, and Reset View controls.

#### Groups

- Reuse the Layout canvas with a visible selection toolbar.
- Show group membership with pattern/icon plus colour.
- Keep selected fixture count and Save Group action close to the pointer task.

#### Fixture Test

- Use a three-part structure: fixture list, test controls, live DMX/output inspector.
- When test control is armed, show a persistent warning banner and a stronger perimeter/state treatment.
- Keep limits visible beside every motion control.
- Disable controls with explanatory copy when ownership belongs to the show engine.

#### Library and Settings

- Group related fields under descriptive headings rather than presenting one continuous field list.
- Use progressive disclosure for advanced protocol options.
- Show connection diagnostics and apply/restart consequences inline.
- Keep destructive model/fitting removal visually separate from routine editing.

### UI acceptance criteria

- A screenshot of any workspace has one immediately obvious primary task and one immediately obvious system state.
- The visual hierarchy remains clear when viewed in greyscale.
- Safety actions cannot be mistaken for routine toolbar actions.
- Text and controls remain legible at 100% and 125% display scaling.
- Layout remains usable at the Electron minimum window size without horizontal clipping.
- Empty, loading, disconnected, warning, fault, armed, and normal states have designed treatments.
- The application feels recognisably BLK Motion after the changes; this is refinement, not rebranding.

## Priority 0 — Trust and safety

### 1. Fix character encoding

Add `<meta charset="UTF-8">` before the title and verify all punctuation and symbols in the packaged Electron application.

**Acceptance criteria**

- Em dashes, arrows, multiplication signs, plus/minus symbols, and middle dots render correctly.
- No mojibake such as `â€”`, `Â·`, `Ã—`, or `Lâ†’R` appears in any workspace, log message, tooltip, or saved show name.
- Rendering is verified in both development preview and packaged macOS/Windows builds.

### 2. Keep safety controls visible at all supported sizes

Rework the title bar so `Pause` and `Stop Motion` never clip or move off-screen. The current responsive breakpoint is below Electron's minimum window width and is therefore ineffective.

Recommended priority order in the title bar:

1. Stop Motion
2. Pause/Hold state
3. Output mode and warnings
4. Active cue and device health
5. Show identity
6. Cue trigger mode
7. Saved window layouts

Lower-priority controls should collapse into menus before safety or health controls are hidden.

**Acceptance criteria**

- All safety controls are visible and usable at 1024×640, 1280×720, and 1440×900.
- The title bar has no horizontal clipping or inaccessible overflow.
- `Stop Motion` remains fixed in a predictable top-right position.
- Keyboard focus remains visible and follows a logical order.

### 3. Separate stopping from homing

Do not combine stopping output with recalling axes to the top.

- `STOP MOTION`: immediately stops motion and does not initiate new movement.
- `PAUSE`: holds the current state while output remains active.
- `HOME ALL`: separate action, clearly describes the destination, and requires hold-to-confirm.

Final behaviour must be reviewed against the hardware safety requirements before release.

**Acceptance criteria**

- Labels, tooltips, colours, and resulting behaviour agree.
- An emergency stop cannot trigger a homing movement.
- Home All shows a clear armed/confirming state and cannot be triggered by a single accidental click.
- Current rig state remains visible after any safety action.

## Priority 1 — Workflow clarity and recoverability

### 4. Clarify operating modes

Rename the top-level `Test / Edit` control to `OUTPUT LIVE / SAFE EDIT`. Rename the rail workspace `Test` to `FIXTURE TEST`.

The hierarchy should read:

`Output Live → Fixture Test workspace → Test control armed`

**Acceptance criteria**

- No two unrelated controls share the same primary label.
- Safe Edit clearly communicates that playback/output is blocked.
- Fixture Test clearly communicates when the show engine or test controls own a fixture.
- Armed test control is visually distinct and announced in the status area.

### 5. Replace the empty show with guided setup

For a new show, replace the field of empty cue slots with a short setup path:

1. Add or discover fixtures
2. Confirm rig layout
3. Create the first cue
4. Enter Output Live when ready

Each step should include a direct action and a completed state. Once the first cue exists, transition to the normal cue grid.

**Acceptance criteria**

- A new operator can reach a patched fixture and first cue without consulting documentation.
- Empty-state actions navigate directly to the relevant workspace or action.
- The Monitor explains why it is empty and links to Patch.
- Cue creation remains available from the standard cue grid after setup.

### 6. Add application-level undo and recovery

Implement undo/redo for show-model changes rather than relying on native text-field undo.

Initial coverage:

- Cue creation, deletion, duplication, movement, and parameter changes
- Timeline block changes
- Fixture addition, removal, patching, and address changes
- Layout and group changes

Use an undo toast for routine deletion. Use explicit confirmation when one action removes dependent content or affects live output.

**Acceptance criteria**

- `Cmd/Ctrl+Z` and `Shift+Cmd/Ctrl+Z` operate on the show model when focus is not inside a text field.
- Deleting a cue and its timeline blocks can be undone as one transaction.
- Removing patched fixtures can be undone.
- The show name displays an unsaved/dirty state.
- A recoverable autosave snapshot is maintained without interrupting output.

### 7. Make the right column contextual

Replace the permanently repeated Monitor/Saved Cues combination with workspace-specific supporting information.

| Workspace | Right-side content |
|---|---|
| Show | Monitor and Saved Cues |
| Patch | Selected fixture details, addressing, health |
| Layout | Coordinates, dimensions, collision status |
| Groups | Membership and selection summary |
| Fixture Test | Live output, limits, warnings |
| Library | Selected model/fitting details |
| Settings | Connection diagnostics or help |

Users may still pop out or restore the Monitor through the existing panel system.

**Acceptance criteria**

- Each workspace opens with contextually relevant supporting content.
- The main task receives more usable width on Patch, Layout, Groups, and Fixture Test.
- Saved layouts continue to restore panel arrangements correctly.
- Monitor visibility remains user-configurable.

## Priority 2 — Legibility and finish

### 8. Establish a readable typography scale

Target minimum sizes:

- Metadata: 11px
- Labels: 12px
- Body and controls: 13px
- Important values and state: 14–16px

Reserve text below 11px for nonessential annotations only. Increase contrast for labels currently using `--text-3`; do not rely on low contrast to create hierarchy.

**Acceptance criteria**

- Essential information meets WCAG AA contrast for normal text.
- No operational label, warning, unit, or control state is below 11px.
- The interface remains readable at 100% scale on standard-density displays.
- State is not communicated by colour alone.

### 9. Improve control affordance and hit areas

- Increase icon-only panel controls from 22px to a minimum 32px hit area.
- Give splitters a visible hover/focus affordance and keyboard alternative.
- Add accessible names to every icon-only control.
- Use tooltips as supplementary help, not as the only explanation.

**Acceptance criteria**

- All primary controls have at least a 32×32px pointer target; safety controls should be larger.
- Every interactive element is reachable and operable with the keyboard.
- Focus is never lost when panels close, float, or move.
- Disabled controls explain why they are unavailable.

### 10. Improve Monitor and Layout readability

- Increase grid, fixture, limit, and selection contrast without making the canvas visually noisy.
- Make selected, moving, warning, and fault states distinguishable by shape/icon as well as colour.
- Ensure layout dimensions describe occupied fixtures rather than unused grid capacity.
- Provide a clear “frame rig” or reset-view action.

**Acceptance criteria**

- A single patched fixture is clearly visible in Layout and Monitor.
- Dimensions and row/column summaries match the occupied rig.
- Warning and fault states remain distinguishable in monochrome.
- View controls have clear selected states and accessible names.

## Definition of done

- Tested at 1024×640, 1280×720, 1440×900, and a maximised desktop window.
- Tested with an empty show, one fixture/one cue, and a representative multi-fixture show.
- Keyboard-only smoke test completed for all primary workflows.
- No clipped safety controls, corrupted characters, inaccessible destructive actions, or unexplained disabled controls.
- No new renderer console errors or warnings.
- Packaged macOS and Windows builds visually checked at 100% and 125% display scaling.
- Hardware-affecting safety language and behaviour signed off by the responsible controls/safety owner.

## Recommended delivery order

1. Encoding, responsive title bar, and stop/home semantics
2. Mode naming, empty-show onboarding, and undo/recovery foundation
3. Contextual sidebars and workspace refinement
4. Typography, contrast, hit areas, accessibility, and final visual polish

The existing visual language should remain intact. This project is a hierarchy and interaction refinement, not a wholesale redesign.
