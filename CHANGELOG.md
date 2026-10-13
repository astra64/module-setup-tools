# Changelog

## 0.1.0 (unreleased)

### Added

- Named presets of modules: create, rename, duplicate and delete. The Default preset starts empty and can't be renamed or deleted.
- Preset Modules manager with a module checklist, a preset selector, save-with-diff, apply-with-diff and revert. Opens from the module settings menu, a GM-only Settings sidebar button (can be turned off) and `Ctrl+Shift+B`.
- Authoritative apply: enables the preset's installed modules, disables every other active module except Module Setup Tools, skips uninstalled modules, and reloads the world when activation changes.
- Dependency checks on save and apply, with an offer to include installed-but-inactive dependencies, plus a warning on load for active modules whose requirements are inactive.
- Export a preset to the clipboard and import one from a `.json` file.
- Tracking of the preset being edited and the preset last applied, per world.
- Public API at `game.modules.get("module-setup-tools").api` (`presetApi`, `dependencyApi`, `openPresetManager`).
- Vitest suite covering the library code.
