# Module Setup Tools - Development and Roadmap

Extracted from the private `swade-fantasy-world-kit` hub in its v0.10.0 (2026-10-14), where it was called "World Setup Tools". The hub's pack visibility selector did not move: it is compendium-specific and stays in the hub. This module has no dependency on that hub, on any game system, or on any other module.

---

## Current Architecture

- `scripts/main.js`
  - Runtime orchestrator: `init`/`ready` hooks, keybinding, settings-sidebar quick-access button hooks, `module.api` exposure.
- `scripts/constants.js`
  - `MODULE_ID`, `DEFAULT_PRESET_ID`, the `SETTINGS` key map, the app id and the reopen-after-reload localStorage key.
- `scripts/api.js`
  - Builds the `presetApi`/`dependencyApi` singleton shared by the app and dialogs.
- `scripts/settings.js`
  - Settings and settings-menu registration.
- `scripts/ui.js`
  - Injects the GM "Preset Modules" quick-access button into the Settings sidebar.
- `scripts/dialogs.js`
  - Manage Presets dialog (create/rename/duplicate/delete/export/import), dependency-resolution prompt, active-module dependency warning.
- `scripts/apps/PresetModulesManager.js`
  - The manager FormApplication: module checklist, preset selector, save-with-diff, apply-with-diff, revert, remove-missing-module.
- `scripts/lib/preset-utils.js`
  - Preset state and CRUD (`createPresetApi`), title cache, export/import (`exportPresetToClipboard`, `importPreset`, `validatePresetExport`). Pure logic over `game.settings`/`game.modules`.
- `scripts/lib/dependencies.js`
  - Dependency graph traversal/resolution and dependency-metadata checks (`createDependencyApi`).
- `scripts/lib/index.js`
  - `createModuleSetupToolsApi`, composing the two libs above.
- `scripts/lib/html.js`
  - `escapeHtml` for module titles/preset names interpolated into dialog HTML.
- `templates/preset-modules.hbs`, `styles/module-setup-tools.css`
  - Manager template and styles (`mst-` class prefix).
- `tests/`
  - Vitest suite. `module-setup-tools-api.test.js` runs the API against a fake `game` with no system and no compendiums.

Other modules can reach the API through `game.modules.get("module-setup-tools").api` (`presetApi`, `dependencyApi`, `openPresetManager`).

---

## Current Behavior

- Named presets (create, rename, duplicate, delete); the Default preset can't be renamed or deleted.
- Editing flow: choose preset, adjust checked modules, Save (with diff), Apply (with diff).
- Apply is authoritative: enables installed modules in the preset, disables every other active module except this one, skips uninstalled modules, and reloads the world when activation changes.
- The applied preset id is tracked separately from the editing preset id.
- Dependencies of selected modules are checked on save and on apply, with an offer to include installed-but-inactive ones.

---

## Settings Inventory

### World Scope

- `presetModuleTitles` (title cache so uninstalled modules in a preset keep a readable name)
- `activePresetId` (preset being edited)
- `appliedPresetId` (preset last applied)

### Client Scope

- `presets` (the preset map, JSON)
- `gmQuickAccessSidebarButton`

---

## Validation Checklist

Run after significant code changes and before release.

1. Module loads in Foundry v14 with no init/ready errors, in a world with no game-system-specific content.
2. Manager opens from the settings menu, the Settings sidebar button and `Ctrl+Shift+B`.
3. Save Preset shows the diff and persists to the selected preset; Save & Apply saves then applies.
4. Apply Preset to World:
   - enables modules in the preset,
   - disables active modules not in the preset (and never disables Module Setup Tools),
   - prompts for installed-but-inactive dependencies,
   - skips uninstalled modules,
   - reloads the world and reopens the manager afterward.
5. Manage Presets: create, rename (Default is blocked), duplicate, delete (active preset falls back to Default), export to clipboard, import from file with and without missing modules.
6. Revert discards unsaved checkbox edits; removing a missing module from Preset Contents updates the preset.
7. The dependency warning appears for an active module whose requirement is inactive.

---

## Roadmap

1. **Publish.** Create the GitHub repo, then submit to the Foundry package registry.
2. **Transfer module settings between worlds.** Move chosen modules' settings from one world to another, via copy/paste, export/import, or another method. Not designed yet. Open questions: which settings are exportable (world vs. client scope), and how to handle settings whose values reference world-specific ids.

### Parked

- **ApplicationV2 migration.** `PresetModulesManager` and the dialogs still use V1 `FormApplication`/`Dialog`. Deferred to the Foundry v16 era.

---

## Notes for Contributors

- Prefer small, behavior-preserving edits.
- Keep setting keys stable once published, or include a migration.
- Treat preset apply behavior as a core contract: the preset is authoritative.
- Keep the library code (`scripts/lib/`) free of any game-system or compendium assumptions; `tests/module-setup-tools-api.test.js` guards this.
- Validate in Foundry after refactors even when the unit tests pass; the manager and dialogs aren't covered by them.
