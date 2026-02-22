# MAGICTOOLBOX NEONFLEXER — Beta v1.3.0

3D NeonFlex LED tube designer for lighting professionals. Draw tubes in 3D, configure LED pixels, set DMX patch, and export as MVR for direct import into Capture, WYSIWYG, Depence, or any MVR-compatible visualizer.

> **macOS users:** The downloadable offline version is currently Windows only. Mac users can use the full app online at [neonflexer.pages.dev](https://neonflexer.pages.dev) — no install needed.

![MAGICTOOLBOX NEONFLEXER](screenshot.png)

[![v1.2.1 Demo](https://img.shields.io/badge/v1.2.1_Demo-Watch%20on%20YouTube-red?style=for-the-badge&logo=youtube)](https://youtu.be/LIAZG-y8xZI) [![v1.0 Demo](https://img.shields.io/badge/v1.0_Demo-Watch%20on%20YouTube-red?style=for-the-badge&logo=youtube)](https://youtu.be/SFRwDIBtE8Q)

## Features

### 3D Tube Drawing
- Click-to-place or freehand draw on Ground (XZ), Front (XY), or Side (YZ) planes
- Switch planes mid-draw with seamless auto-anchoring
- Adjustable grid size (2m to 200m) with snap-to-grid toggle
- Adjustable curve tension and closed loop option

### Tube Configuration
- **Cross Sections** — Round, square, or rectangular profiles
- **Preset Sizes** — 10mm, 12mm, 16mm, 20mm, 25mm round / 6x12, 8x16 flat
- **Housing + Diffuser** — Square/rect tubes have separate black housing (open U-channel) and selectable diffuser cap
- **Diffuser Shapes** — Flat, Square (taller cap), or Dome for square/rectangular profiles
- **Diffuser Materials** — Choose from PBR silicone presets: Dark, Clear, Milky White, Frosted (with transmission)
- **Wall Thickness** — Adjustable per tube (affects housing channel depth and inner pixel sizing)

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

### Fixture Presets & Auto-Segmenting
- **Fixture Presets** — Select real-world products (LEDStructures LS360FLEX, Generic 60/30/144 px/m) from the toolbar dropdown. Presets auto-fill profile, pixel pitch, DMX channels, and max tube length.
- **Auto-Segmenting** — When a preset has a max length (e.g. LS360FLEX = 6000mm), tubes exceeding it are automatically split into segments of exactly that length, with connector pieces placed at each junction.
- **Connectors** — Visual connector meshes between auto-segmented tube pieces. Exported in MVR alongside tube models.

### Shape Tools
- **Rectangle** (`4`) — Click two corners to draw a rectangular tube path
- **Circle** (`5`) — Click center then edge to draw a circular tube path
- Both auto-segment if the fixture preset has a max length

### Cut / Split Tool
- **Cut Tool** (`C`) — Hover over any tube and click to split
- First cut on a closed tube opens it; second cut splits into two pieces
- Both halves inherit all properties from the original

### Reference Models
- **Import** (`Ctrl+I`) — Load GLB, OBJ, 3DS, or MVR files as semi-transparent reference geometry
- **MVR Import** — Parses MVR scene XML for correct placement of 3DS models (common from Capture)
- **Auto-scale** — Detects mm/m scale mismatches and corrects automatically
- **Snap to Ref** — Snap tube control points to the nearest surface of a reference model
- **Trace Edges** — One-click "Trace Circle" or "Trace Rectangle" buttons generate a tube following the selected model's outline. Works correctly on rotated models.
- **Isolation Mode** (`I`) — Solo the selected reference model(s) to work in a clean environment. Drawing auto-snaps to isolated models.
- **Multi-select** — Click to select, Shift+Click to add, click empty space to deselect
- **Marquee Select** — Alt+drag a rectangle in the viewport to select multiple models at once
- **Smooth Shading** — Toggle to smooth hard edges on reference models for a cleaner look
- **Ghost entries** — Saved projects remember ref model metadata; reimport the file to restore geometry

### Tube Grouping
- **Multi-select** — `Shift+Click` or `Ctrl+Click` tubes in the list panel to select multiple
- **Group** (`Ctrl+G`) — Group selected tubes so they move together as a unit
- **Ungroup** (`Ctrl+B`) — Break a group back into independent tubes
- **Group-aware movement** — Dragging one tube in a group moves all members + connectors
- **Visual indicators** — Grouped tubes show a colored left border and chain-link badge in the list

### Start Pixel Picker
- Pick the start pixel visually by hovering over pixels on a tube and clicking
- Useful for offsetting the DMX start point along a tube

### Undo / Redo
- **Undo** (`Ctrl+Z`) and **Redo** (`Ctrl+Shift+Z` / `Ctrl+R`) for all tube and connector operations
- Up to 50 undo steps

### Camera Views
- **Orthographic views** — Numpad `7` Top, `1` Front, `3` Right (hold Ctrl for opposite side), `0` Perspective
- **View dropdown** in toolbar for quick view switching
- **Focus selected** (`F`) — Zoom to and center on selected tube or reference model
- **Auto-view** — Camera automatically orients when tracing or isolating reference models

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

### Command Panel
- Press `P` to open a floating, draggable command pad with all available actions
- Searchable — type to filter commands
- Organized by category (View, Edit, Tube, Shapes, File, etc.)
- Shows keyboard shortcuts for each command

### Custom Fixture Presets
- Create your own fixture presets with custom profile, pixel pitch, max length, and connector dimensions
- Saved presets persist in the browser and appear in the toolbar dropdown alongside built-in presets

### Help Overlay
Press `?` to see all keyboard shortcuts and mouse controls at a glance

## Quick Start

### Online (no install)

Open in your browser: **[neonflexer.pages.dev](https://neonflexer.pages.dev)**

### Offline (Windows)

1. **Download** — Click the green **Code** button above → **Download ZIP**
2. **Unzip** anywhere on your computer
3. **Launch:** Double-click `NEONFLEXER.bat`
4. The app opens automatically in your browser

> **Windows 10/11:** No install required — the launcher uses PowerShell as fallback.
> **Mac:** Use the online version at [neonflexer.pages.dev](https://neonflexer.pages.dev).

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Select / Move mode |
| `2` | Click Place mode |
| `3` | Freehand Draw mode |
| `4` | Rectangle shape tool |
| `5` | Circle shape tool |
| `C` | Cut / Split tube tool |
| `F` | Focus selected |
| `I` | Toggle isolation mode |
| `P` | Toggle command panel |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+D` | Duplicate selected tube |
| `Ctrl+G` | Group selected tubes |
| `Ctrl+B` | Ungroup selected tubes |
| `Del` | Delete selected tube or point |
| `G` | Toggle grid snap |
| `H` | Toggle Y-axis on move gizmo |
| `F1` `F2` `F3` | Switch drawing plane (XZ / XY / YZ) |
| `Numpad 7/1/3` | Top / Front / Right view |
| `Numpad 0` | Perspective view |
| `Shift+Drag` | Adjust height off-plane |
| `Shift/Ctrl+Click` | Multi-select tubes or ref models |
| `Alt+Drag` | Marquee select reference models |
| `Enter` / `Dbl-Click` | Finish tube |
| `Backspace` | Undo last point |
| `Ctrl+S` | Save project |
| `Ctrl+O` | Load project |
| `Ctrl+I` | Import reference model |
| `Ctrl+E` | Export MVR |
| `?` | Help overlay |
| `Esc` | Cancel / exit isolation |

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

**Auto-split for long tubes:** Tubes exceeding 512 DMX channels (170px RGB / 128px RGBW) are automatically split into separate named meshes in the GLB (e.g. `Tube1_Diffuser_milky_PT1_170px`, `Tube1_Diffuser_milky_PT2_25px`). Apply a separate texture generator to each part in Capture.

**Diffuser-only UV mapping:** For square/rect tubes with housing, only the diffuser cap gets UV-mapped. The housing is exported as a separate non-UV-mapped black mesh.

### Mixed Mode
You can have some tubes in Discrete mode and others in UV Mapped mode in the same project. The MVR export handles both correctly — discrete tubes get fixture elements, UV-mapped tubes get clean mesh geometry only.

## Changelog

### Beta v1.3.0 — Housing + Diffuser Materials, Pixel Beam Orientation
- **Housing + Diffuser Split** — Square and rectangular tubes now render as two separate meshes: a black opaque U-channel housing and a selectable transparent diffuser cap
- **Open U-Channel Housing** — Housing geometry is a proper open U-shape (outer walls + bottom + inner walls), not a closed box. Diffuser sits in the open top.
- **Diffuser Shapes** — Three options for square/rect profiles: Flat (thin top strip), Square (taller cap at 40% height), Dome (semicircular arc)
- **Separate Materials in MVR** — Housing exports as `_Housing` (opaque black) and diffuser as `_Diffuser_<preset>` (chosen transparent material) — two distinct materials in the GLB for Capture
- **Pixel Beam Orientation** — Discrete pixel fixtures in MVR now include a per-pixel rotation matrix so the GDTF beam points toward the diffuser (up). Previously all pixels used an identity matrix.
- **Pixel Positioning** — Pixels in square/rect tubes are placed at the inner bottom of the housing channel, not at the tube center. Both viewport and MVR export match.
- **UV-Mapped Diffuser Only** — For UV-mapped square/rect tubes, only the diffuser mesh gets UV-mapped for Capture's texture generator. Housing is exported as a single non-UV-mapped black mesh.
- **Apply & Draw** — Custom Fixture dialog now switches directly to Click Place drawing mode after clicking "Apply & Draw"
- **Shape Rotation Fix** — Cross-section shapes are correctly oriented so the diffuser always faces up when extruded along curves
- Removed Oval diffuser option (replaced by Square diffuser)

### Beta v1.2.1 — Undo/Redo, Camera Views, Isolation Mode & Trace Edges
- **Undo / Redo** — `Ctrl+Z` / `Ctrl+Shift+Z` for all tube and connector operations (up to 50 steps)
- **Camera Views** — Numpad shortcuts for Top/Front/Right/Perspective views, plus a View dropdown in the toolbar
- **Focus Selected** — Press `F` to zoom camera to selected tube or reference model
- **Isolation Mode** — Press `I` to solo selected reference model(s). Drawing and shapes auto-snap to isolated models. Exit with `Esc` or `I`.
- **Trace Edges** — One-click "Trace Circle" and "Trace Rectangle" in the properties panel to create a tube following a reference model's outline. Now works correctly on rotated and tilted models.
- **Marquee Select** — `Alt+Drag` in the viewport to select multiple reference models at once
- **Reference Model Deselection** — Click empty space or click a selected model again to deselect. Proper deselect when switching to tubes.
- **Smooth Shading** — Toggle smooth edges on reference models in the properties panel
- **Command Panel** — Press `P` for a floating, searchable command pad with all available actions
- **Custom Fixture Presets** — Create and save your own fixture presets with custom profile, pixel pitch, and max length
- **Loading Overlay** — Animated loading screen with progress bar during reference model imports
- **Multi-object Import** — Models with multiple parts are automatically split into separate reference models
- **OBB-based Snap** — Snap to Ref now uses oriented bounding boxes for correct projection on rotated models

### Beta v1.2.0 — Fixture Presets, Auto-Segmenting, Grouping & Reference Models
- **Fixture Presets** — Toolbar dropdown for real-world NeonFlex products (LEDStructures LS360FLEX, Generic 60/30/144 px/m). Auto-fills profile, pixel pitch, DMX channels, max tube length.
- **Auto-Segmenting** — Tubes exceeding fixture max length are automatically split into precise segments with connector pieces at junctions. Binary search ensures each segment hits the exact target length.
- **Connectors** — Visual connector meshes at segment junctions, included in MVR export and save/load.
- **Shape Tools** — Rectangle (`4`) and Circle (`5`) drawing modes. Auto-segment when preset has max length. Auto-snap to reference model surfaces.
- **Cut / Split Tool** — Press `C` to enter cut mode. Click on a tube to split it. First cut on a closed tube opens it; second cut splits into two pieces.
- **Reference Model Import** — Load GLB, OBJ, 3DS, or full MVR files (`Ctrl+I`) as semi-transparent reference geometry. MVR import parses scene XML for correct 3DS model placement. Auto-scale detection.
- **Snap to Ref** — Button in properties panel snaps tube control points to the nearest reference model surface.
- **Tube Grouping** — Multi-select with `Shift+Click` or `Ctrl+Click` in the list panel. Group (`Ctrl+G`) and Ungroup (`Ctrl+B`). Moving one grouped tube moves all members and their connectors.
- **Start Pixel Picker** — Visually pick the start pixel offset by hovering and clicking on tube pixels.
- **Improved Arc Length** — `CurveBuilder.getLength` now scales arc-length divisions proportionally to control point count for sub-mm measurement accuracy on dense curves.
- **Ghost Ref Models** — Saved projects store reference model metadata; ref models appear as ghost entries on load with a one-click reimport button.
- **Auto Grid Resize** — Grid automatically grows when importing a reference model larger than the current grid.
- Grouped tubes show colored left border and chain-link badge in the tube list
- Save/load preserves groups, connectors, and reference model metadata
- Updated help overlay with all new shortcuts

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
