# MAGICTOOLBOX NEONFLEXER — Beta v1.1.0

3D NeonFlex LED tube designer for lighting professionals. Draw tubes in 3D, configure LED pixels, set DMX patch, and export as MVR for direct import into Capture, WYSIWYG, Depence, or any MVR-compatible visualizer.

![MAGICTOOLBOX NEONFLEXER](screenshot.png)

[![Watch the Demo](https://img.shields.io/badge/Demo-Watch%20on%20YouTube-red?style=for-the-badge&logo=youtube)](https://youtu.be/SFRwDIBtE8Q)

## Features

- **3D Tube Drawing** — Click-to-place or freehand draw on XZ, XY, or YZ planes
- **Realistic Materials** — PBR silicone materials (Dark, Clear, Milky White, Frosted) with transmission
- **Cross Sections** — Round, square, or rectangular tubes with preset sizes
- **LED Pixel Placement** — Configurable pitch (30, 60, 96, 144 px/m or custom), editable pixel count
- **Pixel Mode Toggle** — Discrete (individual GDTF fixtures) or UV Mapped (for Capture's pixel generator)
- **UV Mapped Auto-Split** — Tubes exceeding 512 DMX channels are split into named parts (e.g. `Tube1_milky_PT1_170px`)
- **DMX Patching** — Per-tube fixture ID, universe, address, RGB/RGBW with automatic universe wrapping
- **MVR Export** — Full MVR 1.6 file with GDTF generic LED fixtures and GLB tube models
- **Tube Editing** — Move whole tubes or individual control points, duplicate, delete
- **Multi-Plane Drawing** — Switch planes mid-draw with auto-anchoring
- **Help Overlay** — Press `?` to see all keyboard shortcuts

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

The exported `.mvr` file contains:
- **GeneralSceneDescription.xml** — Scene with layers, grouped model + fixtures per tube
- **GenericLED.gdtf** — Generic RGB/RGBW LED pixel fixture (discrete mode only)
- **models/TubeModel.glb** — Tube body meshes with PBR materials

### Discrete Pixels Mode
Each pixel is exported as a GDTF fixture with correct DMX addressing (absolute, auto-wrapping across universes). Import directly into Capture or any MVR-compatible software.

### UV Mapped Mode
Tube bodies are exported as GLB meshes with clean 0→1 UV mapping along the tube path. No individual pixel fixtures are created — use Capture's pixel/texture generator to map DMX channels onto the UV. Tubes with more than 170 pixels (RGB) or 128 pixels (RGBW) are automatically split into separate named parts (e.g. `Tube1_milky_PT1_170px`, `Tube1_milky_PT2_25px`) to fit Capture's 512-channel texture generator limit.

## Changelog

### Beta v1.1.0
- **Pixel Mode Toggle** — Per-tube Discrete Pixels / UV Mapped selector
- **UV Mapped export** — Clean 0→1 UV mapping, no pixel fixtures, no end caps
- **Auto-split** — UV-mapped tubes split into named material parts at 512-channel limit
- **Pixel Count input** — Editable total pixel count (reverse-calculates px/m)
- **Parts info** — Properties panel shows part breakdown for UV-mapped tubes

### Beta v1.0.1
- Save/Load project (.neon files)

### Beta v1.0.0
- Initial release

## Tech Stack

- [Three.js](https://threejs.org/) v0.170 — 3D rendering via CDN
- Pure HTML / CSS / JavaScript — no build tools, no dependencies to install
- Works in Chrome, Firefox, Safari, and Edge on Windows and Mac

## License

MIT License — see [LICENSE](LICENSE)

---

Made by **BYFEIGNASSE** | MAGICTOOLBOX
