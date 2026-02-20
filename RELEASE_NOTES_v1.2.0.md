# NEONFLEXER Beta v1.2.0 — Release Notes

**Use it online:** https://neonflexer.netlify.app/

---

## What's New

### Fixture Presets
Select a real NeonFlex product from the toolbar dropdown (e.g. LEDStructures LS360FLEX) and the app auto-fills the correct tube profile, pixel pitch, DMX channels, and maximum tube length. No more manual setup for common products.

### Auto-Segmenting
When your drawn tube is longer than the fixture allows, the app automatically cuts it into segments of the correct length and places connector pieces at each junction — just like in real life. Each segment gets its own DMX patch.

### Shape Tools
- **Rectangle** (press `4`) — Click two corners to instantly draw a rectangular tube path
- **Circle** (press `5`) — Click center then edge to draw a circular tube path

Both shapes auto-segment when a fixture preset with a max length is active.

### Cut / Split Tool
Press `C` to enter cut mode, then click anywhere on a tube to split it in two. Both halves keep all the original settings. Great for breaking up long runs or adjusting segments.

### Reference Model Import
Load your venue or set design as a reference model (press `Ctrl+I`). Supports GLB, OBJ, 3DS, and even full MVR files exported from Capture. The model appears as a semi-transparent overlay so you can draw tubes directly on your design.

**Snap to Ref** — A button in the properties panel snaps your tube's control points to the nearest surface of a reference model.

### Tube Grouping
Select multiple tubes in the left panel (hold `Shift` or `Ctrl` and click), then press `Ctrl+G` to group them. Now when you move one tube in the group, all of them move together — including connectors. Press `Ctrl+B` to ungroup.

Grouped tubes show a colored left border and chain icon in the list so you can see at a glance which tubes belong together.

### Start Pixel Picker
Visually pick where the first DMX pixel starts by hovering over the tube and clicking on a pixel position. Useful when your DMX chain doesn't start at the beginning of the tube.

### Improved Measurement Accuracy
Tube length measurements are now more accurate on complex curves with many control points.

---

## Quick Reference — New Shortcuts

| Key | What it does |
|-----|-------------|
| `4` | Rectangle tool |
| `5` | Circle tool |
| `C` | Cut / Split tool |
| `Ctrl+G` | Group selected tubes |
| `Ctrl+B` | Ungroup tubes |
| `Ctrl+I` | Import reference model |
| `Shift+Click` | Multi-select tubes in list |

---

## Offline Version
Unzip the provided file, double-click `NEONFLEXER.bat`, and the app opens in your browser. No install needed.

---

## Known Limitations
- Shape tools (Rectangle/Circle) may not work perfectly when multiple reference models are loaded — we're working on it
- Auto-segment lengths can be off by a few millimeters on very complex curves
- Windows offline only — Mac users please use the online version

---

Made by **BYFEIGNASSE** | MAGICTOOLBOX
