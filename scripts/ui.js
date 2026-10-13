import { MODULE_ID, SETTINGS } from "./constants.js";

export function setupUI({ openPresetManager }) {
  function injectSettingsQuickAccessButton(htmlRoot) {
    if (!game.user?.isGM) return;
    if (!game.settings.get(MODULE_ID, SETTINGS.quickAccessButton)) return;

    const root = htmlRoot?.[0] ?? htmlRoot ?? document;
    if (!root?.querySelector) return;

    if (document.querySelector("[data-mst-quick-access-section]")) return;

    const candidateContainers = [
      "#settings-buttons",
      ".tab[data-tab='settings'] #settings-buttons",
      "#sidebar .tab[data-tab='settings'] #settings-buttons",
      "#sidebar .tab[data-tab='settings'] .settings-list",
      "#sidebar #settings .settings-list",
      "#sidebar #settings",
      "#settings"
    ];

    let settingsButtons = null;
    for (const selector of candidateContainers) {
      settingsButtons = root.querySelector(selector) ?? document.querySelector(selector);
      if (settingsButtons) break;
    }
    if (!settingsButtons) return;

    const section = document.createElement("section");
    section.dataset.mstQuickAccessSection = "1";
    section.className = "mst-gm-quick-access-section";

    const title = document.createElement("h2");
    title.className = "mst-gm-quick-access-title";
    title.textContent = "Module Setup Tools";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "mst-gm-quick-access";
    button.innerHTML = '<i class="fas fa-puzzle-piece"></i> Preset Modules';
    button.addEventListener("click", () => openPresetManager());

    section.appendChild(title);
    section.appendChild(button);
    settingsButtons.appendChild(section);
  }

  function tryInjectSettingsQuickAccessButton() {
    injectSettingsQuickAccessButton(document);
  }

  return {
    injectSettingsQuickAccessButton,
    tryInjectSettingsQuickAccessButton
  };
}
