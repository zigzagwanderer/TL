# Track Lab — Modular File Structure
**Version 0.5.8**

The original `tracklab0_5_8_refactored.html` (~8,662 lines) has been split into 14 focused module files plus a clean `index.html` loader.

---

## 📁 File Map

| File | Lines | What's Inside | When to Edit |
|---|---|---|---|
| `index.html` | 80 | HTML shell, library `<script>` tags, module loader | Adding new external libraries |
| `styles.css` | 34 | Global CSS (scrollbar, input styles, animations) | Changing global styles |
| `module1-constants.js` | ~107 | `CLS` genre/mood data, `VERSION`, `useHistory` hook | Adding new genre codes or classification digits |
| `module2-themes.js` | ~83 | `APP_THEMES`, `BASE_SCHEMES`, `FONTS`, `SIZE_PRESETS` | Adding new color themes or fonts |
| `module3-defaults-and-art-editor.js` | ~1,223 | `DEFAULT_SETTINGS`, `DEFAULT_FIELDS`, `ART_TEMPLATES`, `AlbumArtEditor` component | Changing default values, art canvas logic, or layer drawing |
| `module4-utilities.js` | ~62 | `todayStr`, `getColors`, `loadLS`, `saveLS`, `IDB` (IndexedDB wrapper) | Adding utility functions |
| `module5-audio-analysis.js` | ~1,943 | `performFullAudioAnalysis`, `SpectralGraph`, `LoudnessGraph`, `AnalysisPanel` | Changing audio analysis logic or display |
| `module6-filesystem.js` | ~324 | `FSAPI`, `useSavePath`, `saveEntryNow`, `saveAll` | Changing how files are saved to disk |
| `module7-ui-hooks.js` | ~440 | `useDragResize` hook | Changing sidebar drag-resize behavior |
| `module8-ui-primitives.js` | ~69 | `mkBtn`, `mkCard`, `TInp`, `TSel`, `Row2`, `Accordion` | Tweaking base UI component styles |
| `module9-label-components.js` | ~122 | `atkinsonDither`, `QRBlock`, `TrackLabel` | Changing the label print layout |
| `module10-label-panel.js` | ~366 | `MetaFieldsPanel`, `TextBlocksPanel`, `PresetPanel`, `ThemePopover` | Label editor side panels |
| `module11-archive-components.js` | ~81 | `EntryCard`, `SplitSheet` | Track archive card display |
| `module12-player-components.js` | ~512 | `PlayerView`, `DetailMiniPlayer`, `FloatingPlayer` | Audio player UI |
| `module13-gate-and-export.js` | ~78 | `LicenseGate`, batch export helper | License checking, ZIP export |
| `module14-app.js` | ~3,121 | `App` — main state, tab routing, all tabs rendered | App-level state, adding new tabs |

---

## 🛠 How to Edit a Feature

Instead of scrolling through 8,500 lines, just open the relevant module:

**Example: "I want to change how the spectral graph looks"**
→ Open `module5-audio-analysis.js` (~1,943 lines instead of 8,662)
→ Find `SpectralGraph` component
→ Edit, save

**Example: "I want to add a new color theme"**
→ Open `module2-themes.js` (~83 lines)
→ Add your theme to `APP_THEMES`

**Example: "I want to change a default setting"**
→ Open `module3-defaults-and-art-editor.js`
→ Find `DEFAULT_SETTINGS`

---

## 🤖 How to Prompt an AI to Edit a Module

Instead of pasting 8,500 lines:

```
Here is MODULE 5 (Audio Analysis) from Track Lab. 
Please refactor the SpectralGraph component to show peak frequency labels.

[paste contents of module5-audio-analysis.js — ~1,943 lines]
```

This dramatically reduces token usage and keeps the AI focused on the right code.

---

## ⚠️ Important Notes

1. **Load order matters.** The `index.html` loads modules in dependency order. Don't move the `<script>` tags around.
2. **All variables are still global.** Because Babel standalone doesn't support true ES modules without a bundler, all `const`/`function` declarations in the module files are still in a shared scope. This matches the original file's behavior.
3. **To serve locally**, you need a local web server (not just double-clicking `index.html`), because browsers block loading external JS files from `file://`. Use:
   ```
   npx serve .
   # or
   python3 -m http.server 8080
   ```
4. **The original file still works** — this refactor is additive. You can keep using the original `.html` for deployment if preferred.
