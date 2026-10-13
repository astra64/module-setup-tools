import { DEFAULT_PRESET_ID, MANAGER_APP_ID, MODULE_ID, SETTINGS } from "./constants.js";
import { api } from "./api.js";
import { exportPresetToClipboard, importPreset } from "./lib/preset-utils.js";
import { escapeHtml } from "./lib/html.js";

const { presetApi, dependencyApi } = api;

export async function rerenderManagers() {
  const managers = Object.values(ui.windows ?? {}).filter((app) => app.options?.id === MANAGER_APP_ID);
  for (const manager of managers) {
    await manager.render(true);
  }
}

function createNewPreset(onComplete) {
  new Dialog({
    title: "Create New Preset",
    content: '<input type="text" id="presetName" placeholder="Preset name..." style="width: 100%;">',
    buttons: {
      create: {
        label: "Create",
        callback: async (html) => {
          const name = String(html.find("#presetName").val() ?? "").trim();
          if (!name) return;

          const created = await presetApi.createPreset(name);
          if (created.name !== name) {
            ui.notifications?.info(`Preset name already existed; created "${created.name}".`);
          } else {
            ui.notifications?.info(`Preset "${created.name}" created.`);
          }

          onComplete?.(created.id);
        }
      },
      cancel: { label: "Cancel" }
    }
  }).render(true);
}

function renamePreset(presetId, onComplete) {
  if (presetId === DEFAULT_PRESET_ID) {
    ui.notifications?.warn("Cannot rename the default preset.");
    return;
  }

  const preset = presetApi.getPresetMap()[presetId];
  if (!preset) return;

  new Dialog({
    title: "Rename Preset",
    content: `<input type="text" id="presetName" value="${escapeHtml(preset.name)}" style="width: 100%;">`,
    buttons: {
      rename: {
        label: "Rename",
        callback: async (html) => {
          const name = String(html.find("#presetName").val() ?? "").trim();
          if (!name) return;

          const renamed = await presetApi.renamePreset(presetId, name);
          if (!renamed) return;

          if (renamed.name !== name) {
            ui.notifications?.info(`Preset name already existed; renamed to "${renamed.name}".`);
          } else {
            ui.notifications?.info(`Preset renamed to "${renamed.name}".`);
          }

          onComplete?.(presetId);
        }
      },
      cancel: { label: "Cancel" }
    }
  }).render(true);
}

async function duplicatePreset(presetId, onComplete) {
  const duplicated = await presetApi.duplicatePreset(presetId);
  if (!duplicated) return;

  ui.notifications?.info(`Preset duplicated: "${duplicated.name}".`);
  onComplete?.(duplicated.id);
}

async function deletePreset(presetId, onComplete) {
  if (presetId === DEFAULT_PRESET_ID) {
    ui.notifications?.warn("Cannot delete the default preset.");
    return;
  }

  const presetName = escapeHtml(presetApi.getPresetMap()[presetId]?.name ?? presetId);
  const isActivePreset = presetApi.getActivePresetId() === presetId;

  const confirmed = await Dialog.confirm({
    title: "Delete Preset",
    content: isActivePreset
      ? `<p>Delete preset "${presetName}"? This cannot be undone.</p><p><strong>This preset is currently active.</strong> Active preset will switch to "Default" after deletion.</p>`
      : `<p>Delete preset "${presetName}"? This cannot be undone.</p>`,
    yes: () => true,
    no: () => false
  });

  if (!confirmed) return;

  await presetApi.deletePreset(presetId);
  ui.notifications?.info("Preset deleted.");
  onComplete?.(DEFAULT_PRESET_ID);
}

export function openPresetManagementDialog() {
  const buildDialogContent = (selectedPresetId) => {
    const presetList = Object.entries(presetApi.getPresetMap())
      .map(([id, preset]) => `<option value="${escapeHtml(id)}" ${id === selectedPresetId ? "selected" : ""}>${escapeHtml(preset.name ?? id)}</option>`)
      .join("");

    return `
      <div style="display: grid; gap: 0.8rem;">
        <div style="display: grid; gap: 0.3rem;">
          <label for="presetSelect" style="font-weight: 600; font-size: 12px;">Select a preset:</label>
          <select id="presetSelect" style="width: 100%;">
            ${presetList}
          </select>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem;">
          <button type="button" id="presetRenameBtn" style="cursor: pointer;">Rename</button>
          <button type="button" id="presetDuplicateBtn" style="cursor: pointer;">Duplicate</button>
          <button type="button" id="presetDeleteBtn" style="cursor: pointer;">Delete</button>
          <button type="button" id="presetCreateBtn" style="cursor: pointer;">Create New</button>
        </div>
        <div style="display: grid; gap: 0.3rem; border-top: 1px solid #ddd; padding-top: 0.5rem; margin-top: 0.5rem;">
          <label style="font-weight: 600; font-size: 12px; color: #888;">Export / Import:</label>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem;">
            <button type="button" id="presetExportBtn" style="cursor: pointer;" title="Copy preset JSON to clipboard">Export</button>
            <button type="button" id="presetImportBtn" style="cursor: pointer;" title="Import preset from JSON file">Import</button>
          </div>
        </div>
      </div>
    `;
  };

  const refreshDialog = (presetIdToSelect) => {
    const contentDiv = dialog.element?.[0]?.querySelector(".dialog-content");
    if (!contentDiv) return;

    contentDiv.innerHTML = buildDialogContent(presetIdToSelect);
    attachDialogListeners();
    dialog.bringToTop?.();
  };

  const attachDialogListeners = () => {
    const root = dialog.element?.[0]?.querySelector(".dialog-content");
    if (!root) return;

    const presetSelect = root.querySelector("#presetSelect");
    const renameBtn = root.querySelector("#presetRenameBtn");
    const duplicateBtn = root.querySelector("#presetDuplicateBtn");
    const deleteBtn = root.querySelector("#presetDeleteBtn");
    const createBtn = root.querySelector("#presetCreateBtn");
    const exportBtn = root.querySelector("#presetExportBtn");
    const importBtn = root.querySelector("#presetImportBtn");

    const selectedId = () => presetSelect?.value ?? DEFAULT_PRESET_ID;

    const updateButtonState = () => {
      if (!presetSelect) return;
      const isDefaultSelected = presetSelect.value === DEFAULT_PRESET_ID;

      if (renameBtn) {
        renameBtn.disabled = isDefaultSelected;
        renameBtn.title = isDefaultSelected
          ? "Default preset cannot be renamed."
          : "Rename selected preset";
      }

      if (deleteBtn) {
        deleteBtn.disabled = isDefaultSelected;
        deleteBtn.title = isDefaultSelected
          ? "Default preset cannot be deleted."
          : "Delete selected preset";
      }
    };

    updateButtonState();
    presetSelect?.addEventListener("change", updateButtonState);

    renameBtn?.addEventListener("click", () => renamePreset(selectedId(), refreshDialog));
    duplicateBtn?.addEventListener("click", () => duplicatePreset(selectedId(), refreshDialog));
    deleteBtn?.addEventListener("click", () => {
      if (deleteBtn.disabled) return;
      deletePreset(selectedId(), refreshDialog);
    });
    createBtn?.addEventListener("click", () => createNewPreset(refreshDialog));
    exportBtn?.addEventListener("click", () => exportPresetToClipboard(presetApi, selectedId()));
    importBtn?.addEventListener("click", () => importPreset(presetApi, refreshDialog));
  };

  const dialog = new Dialog({
    title: "Manage Presets",
    content: buildDialogContent(presetApi.getActivePresetId()),
    buttons: {
      close: { label: "Close" }
    },
    default: "close",
    render: () => attachDialogListeners(),
    close: async () => {
      // The preset left selected when the dialog closes becomes the one being edited.
      const presetSelect = dialog.element?.[0]?.querySelector("#presetSelect");
      if (!presetSelect) return;

      const selectedPresetId = presetSelect.value ?? DEFAULT_PRESET_ID;
      if (selectedPresetId === presetApi.getActivePresetId()) return;

      await game.settings.set(MODULE_ID, SETTINGS.activePresetId, selectedPresetId);
      await rerenderManagers();
    }
  });

  dialog.render(true);
}

export async function promptForDependencyResolution(modulesToEnable, missingDeps) {
  if (missingDeps.length === 0) return { resolved: true, modulesToEnable };

  const depsList = missingDeps
    .map((id) => `<li>${escapeHtml(game.modules.get(id)?.title ?? id)}</li>`)
    .join("");

  const enable = await Dialog.confirm({
    title: "Enable Module Dependencies?",
    content: `
      <p>The modules you selected require the following installed dependencies to function properly:</p>
      <ul>${depsList}</ul>
      <p>Would you like to enable these dependencies automatically?</p>
    `,
    yes: () => true,
    no: () => false,
    defaultYes: true
  });

  if (!enable) return { resolved: false };

  return {
    resolved: true,
    modulesToEnable: [...modulesToEnable, ...missingDeps]
  };
}

export function warnAboutDependencyIssues() {
  if (!game.user?.isGM) return;

  const issues = dependencyApi.findActiveModulesWithMissingDependencies();
  if (issues.length === 0) return;

  ui.notifications?.warn("Module Setup Tools: module dependency issues detected. Check the console for details.");
  console.warn(`[${MODULE_ID}] Module dependency issues:`, issues);

  if (issues.length <= 2) return;

  const issueDetails = issues
    .map((issue) => {
      const depsList = issue.missingDeps
        .map((id) => `<li>${escapeHtml(game.modules.get(id)?.title ?? id)}</li>`)
        .join("");
      return `<strong>${escapeHtml(issue.moduleTitle)}</strong><ul>${depsList}</ul>`;
    })
    .join("");

  Dialog.prompt({
    title: "Module Dependency Issues",
    content: `
      <p><strong>Module Dependency Issues Detected:</strong></p>
      <p>The following active modules are missing required dependencies:</p>
      <div style="max-height: 300px; overflow-y: auto;">${issueDetails}</div>
      <p>You can use the Preset Modules manager to safely enable modules with all dependencies.</p>
    `,
    callback: () => {}
  });
}
