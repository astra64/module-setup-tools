import { DEFAULT_PRESET_ID, MODULE_ID, SETTINGS } from "./constants.js";

export function setupSettings({ PresetModulesManager }) {
  game.settings.registerMenu(MODULE_ID, "presetModulesMenu", {
    name: "Preset Modules",
    label: "Configure and Apply",
    hint: "Edit preset module selections and apply installed modules to this world.",
    icon: "fas fa-puzzle-piece",
    type: PresetModulesManager,
    restricted: true
  });

  // Presets are client-scoped: each GM's browser keeps its own list. Use Export/Import in the
  // Manage Presets dialog to move a preset between browsers or worlds.
  game.settings.register(MODULE_ID, SETTINGS.presets, {
    name: "Presets",
    scope: "client",
    config: false,
    type: String,
    default: "{}"
  });

  game.settings.register(MODULE_ID, SETTINGS.presetModuleTitles, {
    name: "Preset Module Titles Cache",
    scope: "world",
    config: false,
    type: String,
    default: "{}"
  });

  game.settings.register(MODULE_ID, SETTINGS.activePresetId, {
    name: "Editing Preset Id",
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_PRESET_ID
  });

  game.settings.register(MODULE_ID, SETTINGS.appliedPresetId, {
    name: "Applied Preset Id",
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_PRESET_ID
  });

  game.settings.register(MODULE_ID, SETTINGS.quickAccessButton, {
    name: "GM Quick Access Button",
    hint: "Show a quick-open button in the Settings sidebar for Preset Modules.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
}
