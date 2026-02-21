# NEONFLEXER Beta v1.2.1 — Release Notes

**Use it online:** https://neonflexer.netlify.app/

---

## What's New

### Undo / Redo
Press `Ctrl+Z` to undo and `Ctrl+Shift+Z` to redo. Works for all tube and connector operations. Up to 50 undo steps are stored in memory.

### Camera Views
Quickly switch to standard views using numpad keys (like Blender):
- `Numpad 7` — Top view (Ctrl for Bottom)
- `Numpad 1` — Front view (Ctrl for Back)
- `Numpad 3` — Right view (Ctrl for Left)
- `Numpad 0` — Perspective view

There's also a **View dropdown** in the toolbar and you can press `F` to focus on the selected tube or reference model.

### Isolation Mode
Select one or more reference models and press `I` to isolate them. Everything else is hidden so you can work cleanly. When you draw a shape in isolation mode, it automatically snaps to the isolated model's surface. Press `Esc` or `I` again to exit.

### Trace Edges (One-Click Tube from Model Outline)
Select a reference model and click **Trace Circle** or **Trace Rectangle** in the properties panel. A tube is created following the model's outline and snapped to its surface. This now works correctly on rotated and tilted models — the trace follows the model's actual orientation instead of forcing it to an axis-aligned plane.

### Marquee Select
Hold `Alt` and drag a rectangle in the viewport to select multiple reference models at once.

### Reference Model Deselection
You can now properly deselect reference models:
- Click on empty space in the viewport
- Click an already-selected model in the list panel to toggle it off
- Selecting a tube automatically deselects any reference models

### Smooth Shading
Toggle smooth shading on reference models in the properties panel to hide hard edges for a cleaner look.

### Command Panel
Press `P` to open a floating command pad with all available actions, organized by category. You can search/filter by typing, and it shows the keyboard shortcut for each action. Drag it anywhere on screen.

### Custom Fixture Presets
Create your own fixture presets with custom profile, pixel pitch, max length, and connector dimensions. Saved presets persist in your browser and appear in the toolbar dropdown alongside the built-in presets.

### Loading Overlay
Importing large reference models now shows an animated progress bar with status messages so you know what's happening.

### Multi-Object Import
When you import a model that contains multiple parts (common in stage design files), each part is automatically split into a separate reference model so you can select and work with them individually.

---

## Bug Fixes
- Trace Circle / Trace Rectangle now works correctly on models with unusual rotations
- Snap to Ref now uses oriented bounding box projection for accurate results on tilted models
- Reference model selection state is properly cleared when switching between tubes and models
- Multi-select set is now properly cleaned up on deselection

---

## Quick Reference — New Shortcuts

| Key | What it does |
|-----|-------------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `F` | Focus selected |
| `I` | Isolation mode |
| `P` | Command panel |
| `Alt+Drag` | Marquee select ref models |
| `Numpad 7` | Top view |
| `Numpad 1` | Front view |
| `Numpad 3` | Right view |
| `Numpad 0` | Perspective view |

---

## Offline Version
Unzip the provided file, double-click `NEONFLEXER.bat`, and the app opens in your browser. No install needed.

---

## Known Limitations
- Numpad camera shortcuts require a physical numpad (no alternative binding yet)
- Windows offline only — Mac users please use the online version

---

Made by **BYFEIGNASSE** | MAGICTOOLBOX
