# MAGICTOOLBOX NEONFLEXER — Beta v1.1.0

## 3D NeonFlex LED Tube Designer with MVR Export

Design NeonFlex LED tubes in 3D, configure LED pixels with DMX patching, and export as MVR for direct import into Capture, WYSIWYG, Depence, or any MVR-compatible visualizer.

---

## Try It Now

**Open in your browser (no install needed):**

https://amonsch1979.github.io/neonflexer/

---

## Download for Offline Use

1. Go to https://github.com/amonsch1979/neonflexer
2. Click the green **Code** button → **Download ZIP**
3. Unzip anywhere on your computer
4. Double-click **NEONFLEXER.bat** (Windows)
5. The app opens in your browser — no install required

> **Mac:** Use the online version — offline launcher is Windows only for now.

---

## Features

**Drawing**
- Click-to-place or freehand drawing in 3D
- Draw on Ground (XZ), Front (XY), or Side (YZ) planes
- Switch planes mid-draw with seamless anchoring
- Adjustable grid size (2m to 200m) with snap and boundary clamping

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

**MVR Export**
- One-click export to .mvr file
- Tube bodies exported as GLB with PBR materials
- Discrete mode: each pixel exported as a GDTF generic LED fixture
- UV Mapped mode: clean 0→1 UV mapping for Capture's pixel/texture generator
- Auto-split UV-mapped tubes into named parts at 512-channel limit (170px RGB / 128px RGBW)
- Model + Pixels grouped per tube for easy handling in visualizers
- Absolute DMX addressing across universes

**Editing**
- Select and move entire tubes in 3D
- Move individual control points with transform gizmo
- Duplicate tubes with Ctrl+D
- Undo points, delete tubes, toggle visibility

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 1 | Select / Move mode |
| 2 | Click Place mode |
| 3 | Freehand Draw mode |
| Ctrl+D | Duplicate selected tube |
| Del | Delete selected tube or point |
| G | Toggle grid snap |
| F1 / F2 / F3 | Switch plane (XZ / XY / YZ) |
| Shift+Drag | Adjust height off-plane |
| Enter | Finish tube |
| Backspace | Undo last point |
| Ctrl+E | Export MVR |
| H | Toggle Y-axis on gizmo |
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

- **Live App:** https://amonsch1979.github.io/neonflexer/
- **GitHub:** https://github.com/amonsch1979/neonflexer

---

Made by **BYFEIGNASSE** | MAGICTOOLBOX
