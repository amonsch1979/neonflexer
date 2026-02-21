# MAGICTOOLBOX NEONFLEXER — Beta v1.2.1

## 3D NeonFlex LED Tube Designer with MVR Export

Design NeonFlex LED tubes in 3D, configure LED pixels with DMX patching, and export as MVR for direct import into Capture, WYSIWYG, Depence, or any MVR-compatible visualizer.

---

## Try It Now

**Open in your browser (no install needed):**

https://neonflexer.netlify.app/

---

## Download for Offline Use

1. Unzip the provided NEONFLEXER_v1.2.1.zip
2. Double-click **NEONFLEXER.bat** (Windows)
3. The app opens in your browser — no install required

> **Mac:** Use the online version — offline launcher is Windows only for now.

---

## Features

**Drawing**
- Click-to-place or freehand drawing in 3D
- Draw on Ground (XZ), Front (XY), or Side (YZ) planes
- Switch planes mid-draw with seamless anchoring
- Adjustable grid size (2m to 200m) with snap and boundary clamping

**Shape Tools**
- Rectangle (press 4) — click two corners
- Circle (press 5) — click center then edge
- Auto-segment when fixture preset has a max length

**Fixture Presets**
- Select real-world products (LEDStructures LS360FLEX, Generic 60/30/144 px/m)
- Auto-fills profile, pixel pitch, DMX channels, and max tube length

**Auto-Segmenting**
- Tubes exceeding fixture max length are automatically split into correct-length segments
- Connector pieces placed at each junction

**Tube Configuration**
- Round, square, or rectangular cross sections
- Preset sizes: 10mm, 12mm, 16mm, 20mm, 25mm round — 6x12, 8x16 flat
- PBR silicone materials: Dark, Clear, Milky White, Frosted
- Adjustable wall thickness and curve tension

**LED Pixels**
- Per-tube pixel mode: Discrete Pixels or UV Mapped
- Configurable pixel pitch: 30, 60, 96, 144 px/m or custom
- Editable total pixel count (reverse-calculates px/m)
- RGB or RGBW color modes
- Emissive glow preview in viewport (discrete mode)
- Pixels placed with arc-length precision along the tube curve

**DMX Patching**
- Per-tube fixture ID, universe, and start address
- Automatic universe wrapping at 512 channel limit
- Live DMX range summary in properties panel
- RGB (3ch) or RGBW (4ch) per pixel

**Reference Model Import**
- Import GLB, OBJ, 3DS, or MVR files as semi-transparent reference geometry
- MVR import parses scene XML for correct 3DS model placement
- Auto-scale detection for mm/m mismatches
- Snap tube control points to reference model surfaces

**Tube Grouping**
- Multi-select tubes with Shift+Click or Ctrl+Click in the list panel
- Group (Ctrl+G) — grouped tubes move together as a unit
- Ungroup (Ctrl+B) — break back into independent tubes
- Connectors move with the group

**Cut / Split Tool**
- Press C to enter cut mode, click on a tube to split it
- Both halves inherit all original settings

**MVR Export**
- One-click export to .mvr file
- Tube bodies exported as GLB with PBR materials
- Discrete mode: each pixel exported as a GDTF generic LED fixture
- UV Mapped mode: clean 0-1 UV mapping for Capture's pixel/texture generator
- Auto-split UV-mapped tubes into named parts at 512-channel limit
- Absolute DMX addressing across universes

**Editing**
- Select and move entire tubes in 3D
- Move individual control points with transform gizmo
- Duplicate tubes with Ctrl+D
- Undo points, delete tubes, toggle visibility
- Save/Load projects as .neon files

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 1 | Select / Move mode |
| 2 | Click Place mode |
| 3 | Freehand Draw mode |
| 4 | Rectangle shape tool |
| 5 | Circle shape tool |
| C | Cut / Split tube tool |
| Ctrl+D | Duplicate selected tube |
| Ctrl+G | Group selected tubes |
| Ctrl+B | Ungroup tubes |
| Del | Delete selected tube or point |
| G | Toggle grid snap |
| H | Toggle Y-axis on gizmo |
| F1 / F2 / F3 | Switch plane (XZ / XY / YZ) |
| Shift+Drag | Adjust height off-plane |
| Shift/Ctrl+Click | Multi-select tubes in list |
| Enter | Finish tube |
| Backspace | Undo last point |
| Ctrl+S | Save project |
| Ctrl+O | Load project |
| Ctrl+I | Import reference model |
| Ctrl+E | Export MVR |
| ? | Help overlay |
| Esc | Cancel / close |

## Mouse

| Action | Function |
|--------|----------|
| Left click | Place points / Select |
| Middle mouse | Orbit camera |
| Right mouse | Pan camera |
| Scroll | Zoom |

---

## Requirements

- Any modern browser (Chrome, Firefox, Safari, Edge)
- Works on Windows and Mac
- No plugins or installs needed

---

## Links

- **Live App:** https://neonflexer.netlify.app/

---

Made by **BYFEIGNASSE** | MAGICTOOLBOX
