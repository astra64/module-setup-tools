import { MANAGER_APP_ID, MODULE_ID, REOPEN_FLAG_KEY } from "./constants.js";
import { api } from "./api.js";
import { setupSettings } from "./settings.js";
import { setupUI } from "./ui.js";
import { PresetModulesManager } from "./apps/PresetModulesManager.js";
import { warnAboutDependencyIssues } from "./dialogs.js";

const { presetApi, dependencyApi } = api;

function openPresetManager() {
  const existing = Object.values(ui.windows ?? {}).find((app) => app.options?.id === MANAGER_APP_ID);
  if (existing) {
    existing.render(false, { focus: true });
    existing.bringToTop?.();
    return existing;
  }
  return new PresetModulesManager().render(true);
}

const { injectSettingsQuickAccessButton, tryInjectSettingsQuickAccessButton } = setupUI({ openPresetManager });

Hooks.once("init", () => {
  game.keybindings.register(MODULE_ID, "openPresetManager", {
    name: "Open Preset Modules",
    hint: "Open the Preset Modules manager quickly.",
    editable: [{ key: "KeyB", modifiers: ["Control", "Shift"] }],
    onDown: () => {
      if (!game.user?.isGM) return false;
      openPresetManager();
      return true;
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  setupSettings({ PresetModulesManager });

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { ...api, openPresetManager };
});

Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;

  await presetApi.sanitizePresets();
  await presetApi.sanitizeAppliedPresetId();

  const offenders = dependencyApi.findModulesWithInvalidDependencyMetadata();
  if (offenders.length > 0) {
    const lines = offenders.map((entry) => `${entry.id} (${entry.invalidCount})`).join("\n");
    console.warn(`[${MODULE_ID}] Modules with invalid dependency metadata:\n${lines}`);
    ui.notifications?.warn(`Module Setup Tools: ${offenders.length} module(s) have invalid dependency metadata. See console.`);
  }

  if (localStorage.getItem(REOPEN_FLAG_KEY) === "1") {
    localStorage.removeItem(REOPEN_FLAG_KEY);
    openPresetManager();
  }

  warnAboutDependencyIssues();

  // Fallback injection if Settings tab is already in DOM.
  tryInjectSettingsQuickAccessButton();
  setTimeout(() => tryInjectSettingsQuickAccessButton(), 250);
  setTimeout(() => tryInjectSettingsQuickAccessButton(), 1000);
});

Hooks.on("renderSidebarTab", (app, html) => {
  if (app?.options?.id === "settings" || app?.id === "settings") {
    injectSettingsQuickAccessButton(html);
  }
});

Hooks.on("renderSettings", (_app, html) => {
  injectSettingsQuickAccessButton(html);
});

Hooks.on("renderSidebar", (_app, html) => {
  injectSettingsQuickAccessButton(html);
});
