# Module Setup Tools

A Foundry VTT tool for managing which modules a world uses. Save named **presets** of modules, then apply a preset to a world in one click. It works with any game system and bundles no content.

## AI Disclosure

Claude Code was used during this module's development, alongside human coding, design, review, and testing.

## Features

- **Named presets.** Create, rename, duplicate and delete lists of modules.
- **Explicit workflow.** Choose a preset, check the modules you want, save, then apply. Nothing changes in the world until you click **Apply Preset to World**.
- **Review before anything changes.** Saving shows a diff of what will be added to or removed from the preset. Applying shows exactly which modules will be enabled and disabled.
- **Authoritative apply.** Applying a preset enables the installed modules in it and disables every other active module (except Module Setup Tools itself). Modules in the preset that aren't installed are skipped.
- **Dependency aware.** If a selected module requires installed-but-inactive modules, you're offered to include them automatically. Active modules with missing dependencies are flagged on load.
- **Export / Import.** Copy a preset to the clipboard as JSON, or import one from a `.json` file, to move presets between worlds or browsers.

## Installation

Install via the Foundry package browser, or manually with this manifest URL:

```
https://github.com/astra64/module-setup-tools/releases/latest/download/module.json
```

Requires Foundry VTT v14. No dependency on any game system or other module.

## Usage

Open the manager from **Game Settings → Configure Settings → Module Settings → Module Setup Tools → Preset Modules**, from the **Preset Modules** button in the Settings sidebar (GM only; can be turned off in the module settings), or with `Ctrl+Shift+B` (GM only, rebindable).

1. Pick the preset to edit under **Editing Preset** (or use **Manage Presets** to create one).
2. Check the modules you want in the preset.
3. Click **Save Preset** and review the diff. Choose **Save**, or **Save & Apply**.
4. Click **Apply Preset to World** to enable and disable modules to match. Foundry reloads when activation changes.

**Revert** discards unsaved checkbox edits. The summary row shows which preset was last applied to this world.

### Where presets are stored

Presets are saved as a client setting, which Foundry keeps in your browser rather than on the server. To move presets to another browser, machine or world, use **Manage Presets → Export** and **Import**. Which preset is being edited and which was last applied are tracked per world.

## Known limitations

- The manager and its dialogs still use Foundry's V1 `FormApplication`/`Dialog` classes and will log deprecation warnings in newer Foundry versions until migrated to ApplicationV2.

## License

MIT. See [LICENSE](LICENSE).
