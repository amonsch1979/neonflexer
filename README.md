# MAGICTOOLBOX NEONFLEXER — Beta v1.1.0

3D NeonFlex LED tube designer for lighting professionals. Draw tubes in 3D, configure LED pixels, set DMX patch, and export as MVR for direct import into Capture, WYSIWYG, Depence, or any MVR-compatible visualizer.

> **macOS users:** The downloadable offline version is currently Windows only. Mac users can use the full app online at **[amonsch1979.github.io/neonflexer](https://amonsch1979.github.io/neonflexer/)** — no install needed.

![MAGICTOOLBOX NEONFLEXER](screenshot.png)

[![Watch the Demo](https://img.shields.io/badge/Demo-Watch%20on%20YouTube-red?style=for-the-badge&logo=youtube)](https://youtu.be/SFRwDIBtE8Q)

## Features

### 3D Tube Drawing
- Click-to-place or freehand draw on Ground (XZ), Front (XY), or Side (YZ) planes
- Switch planes mid-draw with seamless auto-anchoring
- Adjustable grid size (2m to 200m) with snap-to-grid toggle
- Adjustable curve tension and closed loop option

### Tube Configuration
- **Cross Sections** — Round, square, or rectangular profiles
- **Preset Sizes** — 10mm, 12mm, 16mm, 20mm, 25mm round / 6x12, 8x16 flat
- **Materials** — PBR silicone presets: Dark, Clear, Milky White, Frosted (with transmission)
- **Wall Thickness** — Adjustable per tube (affects inner pixel sizing)

### LED Pixels & Pixel Modes
Each tube has a **Pixel Mode** selector in the Properties panel:

- **Discrete Pixels** (default) — Individual LED pixel spheres rendered in the viewport. Each pixel is exported as a separate GDTF fixture in MVR with its own DMX address. Best for small pixel counts or when you need individual fixture control in your visualizer.

- **UV Mapped** — No pixel spheres in the viewport. The tube body is exported with clean 0→1 UV mapping along the tube path. In Capture, you apply a **pixel/texture generator** to the mesh and set the number of columns to match your pixel count. Much lighter on resources for high pixel counts.

Both modes share these settings:
- **Pitch presets** — 30, 60, 96, 144 px/m or custom value
- **Pixel Count** — Editable field that shows the total number of pixels. Change it directly and the px/m is recalculated automatically from the tube length.
- **DMX Patch** — Fixture ID, universe, start address, RGB (3ch) or RGBW (4ch) per pixel with live range summary

### UV Mapped Auto-Split
Capture's texture generator is limited to **512 DMX channels** per material (170 pixels for RGB, 128 for RGBW). When a UV-mapped tube exceeds this limit, NeonFlexer automatically splits the tube body into multiple parts in the exported GLB. Each part gets a **named material** so you can identify it in Capture:

| Total Pixels | Parts in GLB |
|-------------|-------------|
| 150 RGB | `Tube1_milky_150px` (1 part) |
| 340 RGB | `Tube1_milky_PT1_170px` + `Tube1_milky_PT2_170px` (2 parts) |
| 195 RGB | `Tube1_milky_PT1_170px` + `Tube1_milky_PT2_25px` (2 parts) |

The **Parts** info row in the Properties panel shows the breakdown before you export.

### DMX Patching
- Per-tube fixture ID, universe, and start address
- Automatic universe wrapping at the 512-channel boundary
- RGB (3ch) or RGBW (4ch) per pixel
- Live patch range summary: `195px → U1.1 – U2.73 (585ch, 2 uni)`

### Tube Editing
- Select and move entire tubes in 3D with transform gizmo
- Move individual control points
- Duplicate tubes with `Ctrl+D`
- Delete tubes or individual points
- Toggle tube visibility

### Save / Load
- Save your full project as a `.neon` file (`Ctrl+S`)
- Load projects back with all tube properties preserved (`Ctrl+O`)
- Backward compatible — old .neon files load with default settings for new features

### Help Overlay
Press `?` to see all keyboard shortcuts and mouse controls at a glance

## Quick Start

### Online (no install)

Open in your browser: **[amonsch1979.github.io/neonflexer](https://amonsch1979.github.io/neonflexer/)**

### Offline (Windows)

1. **Download** — Click the green **Code** button above → **Download ZIP**
2. **Unzip** anywhere on your computer
3. **Launch:** Double-click `NEONFLEXER.bat`
4. The app opens automatically in your browser

> **Windows 10/11:** No install required — the launcher uses PowerShell as fallback.
> **Mac:** Use the online version at the link above.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Select / Move mode |
| `2` | Click Place mode |
| `3` | Freehand Draw mode |
| `Ctrl+D` | Duplicate selected tube |
| `Del` | Delete selected tube or point |
| `G` | Toggle grid snap |
| `F1` `F2` `F3` | Switch drawing plane (XZ / XY / YZ) |
| `Shift+Drag` | Adjust height off-plane |
| `Enter` / `Dbl-Click` | Finish tube |
| `Backspace` | Undo last point |
| `Ctrl+E` | Export MVR |
| `H` | Toggle Y-axis on move gizmo |
| `?` | Help overlay |
| `Esc` | Cancel / close |

## Mouse Controls

| Action | Function |
|--------|----------|
| Left click | Place points (drawing) / Select (select mode) |
| Middle mouse | Orbit camera (always) |
| Right mouse | Pan camera |
| Scroll wheel | Zoom |

## MVR Export

Press `Ctrl+E` to export. The `.mvr` file (MVR 1.6 standard) is a ZIP archive containing:

| File | Description |
|------|-------------|
| `GeneralSceneDescription.xml` | Scene structure — layers, groups, fixtures, model references |
| `GenericLED.gdtf` | Embedded GDTF fixture for LED pixels (discrete mode only) |
| `models/TubeModel.glb` | All tube body meshes with PBR materials in one GLB |

### Discrete Pixels Mode
Each pixel is exported as an individual **GDTF Fixture** element in the MVR XML with:
- Correct 3D position (converted from Three.js Y-up to MVR Z-up, in millimeters)
- Absolute DMX addressing with automatic universe wrapping at channel 512
- RGB or RGBW mode matching your per-tube setting
- Unique fixture ID and custom ID for grouping

Import the `.mvr` directly into Capture, WYSIWYG, Depence, or any MVR-compatible visualizer. Each pixel appears as a controllable light fixture.

### UV Mapped Mode
Tube bodies are exported as **GLB meshes with clean 0→1 UV coordinates** along the tube path:
- **U axis** (0→1) = position along the tube from start to end
- **V axis** (0→1) = position around the tube circumference
- No end caps on the geometry (they would corrupt the UV range)
- No GDTF fixture elements — the `.gdtf` file is omitted when all tubes are UV-mapped

**In Capture:** Select the tube mesh, add a pixel/texture generator, and set the number of columns to your pixel count. Each column maps to one pixel via the UV coordinates.

**Auto-split for long tubes:** Tubes exceeding 512 DMX channels (170px RGB / 128px RGBW) are automatically split into separate named meshes in the GLB (e.g. `Tube1_milky_PT1_170px`, `Tube1_milky_PT2_25px`). Apply a separate texture generator to each part in Capture.

### Mixed Mode
You can have some tubes in Discrete mode and others in UV Mapped mode in the same project. The MVR export handles both correctly — discrete tubes get fixture elements, UV-mapped tubes get clean mesh geometry only.

## Changelog

### Beta v1.1.0 — Pixel Mode & UV Mapping
- **Pixel Mode Toggle** — Per-tube selector: Discrete Pixels or UV Mapped
- **Discrete mode** — Existing behavior: individual pixel spheres in viewport, GDTF fixtures in MVR
- **UV Mapped mode** — No pixel spheres, no fixtures; exports clean 0→1 UV-mapped tube mesh for Capture's texture generator
- **Auto-split** — UV-mapped tubes exceeding 512 channels are split into named parts (`_PT1_170px`, `_PT2_25px`) in the exported GLB
- **Pixel Count input** — New editable field in Properties panel; change the total count and px/m is recalculated from tube length
- **Parts info** — Properties panel shows the part breakdown (e.g. `2 parts (170px + 25px)`) for UV-mapped tubes
- **No end caps** — Round tubes in UV-mapped mode are exported without hemispherical end caps to preserve clean UV range
- **GDTF omission** — When all tubes are UV-mapped, the GenericLED.gdtf file is excluded from the MVR archive
- **Backward compatible** — Old .neon project files load correctly; tubes default to Discrete mode
- Removed Mac offline launcher (macOS users: use the online version)

### Beta v1.0.1 — Save/Load
- Save full project as `.neon` file (`Ctrl+S`)
- Load projects with all tube properties restored (`Ctrl+O`)

### Beta v1.0.0 — Initial Release
- 3D tube drawing (click-place, freehand) on XZ/XY/YZ planes
- Round, square, rectangular cross sections with presets
- PBR silicone materials (Dark, Clear, Milky White, Frosted)
- LED pixel placement with configurable pitch
- DMX patching with universe wrapping
- MVR 1.6 export with GDTF fixtures and GLB models
- Tube editing: move, duplicate, delete, visibility toggle
- Multi-plane drawing with auto-anchoring
- Grid snap, adjustable grid size
- Keyboard shortcuts and help overlay

## Tech Stack

- [Three.js](https://threejs.org/) v0.170 — 3D rendering via CDN
- Pure HTML / CSS / JavaScript — no build tools, no dependencies to install
- Works in Chrome, Firefox, Safari, and Edge on Windows and Mac

## License

MIT License — see [LICENSE](LICENSE)

---

Made by **BYFEIGNASSE** | MAGICTOOLBOX
