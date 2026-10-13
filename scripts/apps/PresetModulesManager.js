import { MANAGER_APP_ID, MODULE_ID, REOPEN_FLAG_KEY, SETTINGS } from "../constants.js";
import { api } from "../api.js";
import { buildSelectionSignature, parseTitlesMap } from "../lib/preset-utils.js";
import { escapeHtml } from "../lib/html.js";
import { openPresetManagementDialog, promptForDependencyResolution } from "../dialogs.js";

const { presetApi, dependencyApi } = api;

export class PresetModulesManager extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: MANAGER_APP_ID,
      classes: ["mst-preset-modules"],
      title: "Module Setup Tools: Preset Modules",
      template: `modules/${MODULE_ID}/templates/preset-modules.hbs`,
      width: 720,
      height: 760,
      resizable: true,
      minimizable: true,
      popOut: true,
      minWidth: 640,
      minHeight: 560,
      submitOnChange: false,
      closeOnSubmit: false
    });
  }

  getData() {
    const selectedIds = new Set(presetApi.getActivePresetModuleIds());
    const installedModules = [...game.modules.values()]
      .filter((module) => module.id !== MODULE_ID)
      .map((module) => {
        const id = module.id;
        const title = module.title ?? id;
        const dependencies = dependencyApi.getModuleDependencies(id);
        const missingInstalledDependencies = dependencies.filter((depId) => {
          const depModule = game.modules.get(depId);
          return Boolean(depModule) && !depModule.active;
        });
        const missingUninstalledDependencies = dependencies.filter((depId) => !game.modules.has(depId));

        return {
          id,
          title,
          active: Boolean(module.active),
          selected: selectedIds.has(id),
          searchText: `${title} ${id}`.toLowerCase(),
          missingInstalledDependencyCount: missingInstalledDependencies.length,
          missingUninstalledDependencyCount: missingUninstalledDependencies.length,
          missingInstalledDependencyLabel: missingInstalledDependencies
            .map((depId) => game.modules.get(depId)?.title ?? depId)
            .join(", "),
          missingUninstalledDependencyLabel: missingUninstalledDependencies.join(", ")
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    const titlesMap = parseTitlesMap(game.settings.get(MODULE_ID, SETTINGS.presetModuleTitles));
    const configured = [...selectedIds]
      .filter((id) => id && String(id).trim().length > 0)
      .map((id) => {
        const module = game.modules.get(id);
        return {
          id,
          title: module?.title ?? titlesMap[id] ?? null,
          installed: Boolean(module),
          active: Boolean(module?.active)
        };
      })
      .sort((a, b) => {
        const aStatusOrder = !a.installed ? 0 : a.active ? 2 : 1;
        const bStatusOrder = !b.installed ? 0 : b.active ? 2 : 1;
        if (aStatusOrder !== bStatusOrder) return aStatusOrder - bStatusOrder;
        return (a.title ?? a.id).localeCompare(b.title ?? b.id);
      });

    const activePreset = presetApi.getActivePresetMeta();
    const appliedPreset = presetApi.getAppliedPresetMeta();
    const presets = Object.entries(presetApi.getPresetMap()).map(([id, preset]) => ({
      id,
      name: preset.name ?? id,
      moduleCount: preset.moduleIds?.length ?? 0,
      isActive: id === activePreset.id
    }));

    return {
      installedModules,
      hasInstalledModules: installedModules.length > 0,
      configured,
      hasConfigured: configured.length > 0,
      installedCount: installedModules.length,
      selectedCount: installedModules.filter((entry) => entry.selected).length,
      configuredCount: configured.length,
      presetSelectionSignature: buildSelectionSignature([...selectedIds]),
      presets,
      appliedPresetName: appliedPreset.name,
      isEditingPresetApplied: activePreset.id === appliedPreset.id
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const root = html[0];
    const applyButton = root.querySelector("[data-apply-preset]");
    const revertButton = root.querySelector("[data-revert-preset]");
    const searchInput = root.querySelector("[data-module-search]");
    const moduleRows = [...root.querySelectorAll("[data-module-row]")];
    const selectActiveButton = root.querySelector("[data-module-select-active]");
    const filterActiveButton = root.querySelector("[data-module-filter-active]");
    const visibleCountLabel = root.querySelector("[data-module-visible-count]");
    const clearSelectionButton = root.querySelector("[data-module-clear-selection]");
    const saveStateLabel = root.querySelector("[data-preset-save-state]");
    const selectionDeltaLabel = root.querySelector("[data-selection-delta]");
    const presetSelector = root.querySelector("[data-preset-selector]");
    const presetManageBtn = root.querySelector("[data-preset-manage]");

    const savedSignature = root.dataset.presetSelectionSignature ?? "";
    const savedSelection = new Set(savedSignature ? savedSignature.split("\n") : []);

    const getCurrentSelectionSignature = () => {
      const selectedIds = [];
      for (const row of moduleRows) {
        const checkbox = row.querySelector("input[type=checkbox]");
        if (!checkbox?.checked) continue;
        selectedIds.push(checkbox.value);
      }
      return buildSelectionSignature(selectedIds);
    };

    const updateSaveState = () => {
      if (!saveStateLabel) return;

      const hasUnsavedChanges = getCurrentSelectionSignature() !== savedSignature;
      saveStateLabel.textContent = hasUnsavedChanges
        ? "Status: unsaved changes"
        : "Status: matches preset";
      saveStateLabel.classList.toggle("mst-save-state-unsaved", hasUnsavedChanges);
      saveStateLabel.classList.toggle("mst-save-state-saved", !hasUnsavedChanges);
      if (revertButton) revertButton.disabled = !hasUnsavedChanges;
    };

    const updateSelectionDelta = () => {
      if (!selectionDeltaLabel) return;

      const currentIds = new Set(getCurrentSelectionSignature().split("\n").filter(Boolean));
      let additions = 0;
      let removals = 0;

      for (const id of currentIds) {
        if (!savedSelection.has(id)) additions += 1;
      }
      for (const id of savedSelection) {
        if (!currentIds.has(id)) removals += 1;
      }

      if (additions === 0 && removals === 0) {
        selectionDeltaLabel.textContent = "No changes";
        selectionDeltaLabel.classList.remove("mst-selection-delta-dirty");
        return;
      }

      selectionDeltaLabel.textContent = `+${additions} / -${removals}`;
      selectionDeltaLabel.classList.add("mst-selection-delta-dirty");
    };

    const updateSelectionState = () => {
      updateSaveState();
      updateSelectionDelta();
    };

    let activeOnlyFilterEnabled = false;

    const updateActiveFilterButtonState = () => {
      if (!filterActiveButton) return;
      filterActiveButton.setAttribute("aria-pressed", activeOnlyFilterEnabled ? "true" : "false");
      filterActiveButton.classList.toggle("is-active", activeOnlyFilterEnabled);
      root.classList.toggle("mst-active-filter-on", activeOnlyFilterEnabled);
    };

    const applyModuleFilters = () => {
      const term = (searchInput?.value ?? "").toLowerCase().trim();
      let visibleCount = 0;

      for (const row of moduleRows) {
        const searchText = (row.dataset.search ?? "").toLowerCase();
        const matchesSearch = !term || searchText.includes(term);
        const matchesActiveOnly = !activeOnlyFilterEnabled || row.dataset.active === "true";
        const isVisible = matchesSearch && matchesActiveOnly;
        row.style.display = isVisible ? "" : "none";
        if (isVisible) visibleCount += 1;
      }

      if (visibleCountLabel) {
        const totalCount = moduleRows.length;
        visibleCountLabel.textContent = activeOnlyFilterEnabled
          ? `${visibleCount}/${totalCount}`
          : `${totalCount}`;
      }
    };

    searchInput?.addEventListener("input", applyModuleFilters);

    filterActiveButton?.addEventListener("click", () => {
      activeOnlyFilterEnabled = !activeOnlyFilterEnabled;
      updateActiveFilterButtonState();
      applyModuleFilters();
    });

    selectActiveButton?.addEventListener("click", () => {
      for (const row of moduleRows) {
        const checkbox = row.querySelector("input[type=checkbox]");
        if (checkbox) checkbox.checked = row.dataset.active === "true";
      }
      updateSelectionState();
    });

    clearSelectionButton?.addEventListener("click", () => {
      for (const row of moduleRows) {
        const checkbox = row.querySelector("input[type=checkbox]");
        if (checkbox) checkbox.checked = false;
      }
      updateSelectionState();
    });

    revertButton?.addEventListener("click", () => {
      for (const row of moduleRows) {
        const checkbox = row.querySelector("input[type=checkbox]");
        if (checkbox) checkbox.checked = savedSelection.has(checkbox.value);
      }
      updateSelectionState();
    });

    root.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.name !== "presetModulesSelected") return;
      updateSelectionState();
    });

    applyButton?.addEventListener("click", async () => {
      await this._onApplyPreset();
    });

    presetSelector?.addEventListener("change", async (event) => {
      await game.settings.set(MODULE_ID, SETTINGS.activePresetId, event.target.value);
      await this.render(true);
    });

    presetManageBtn?.addEventListener("click", () => openPresetManagementDialog());

    // Handle removal of missing modules from preset contents
    for (const btn of root.querySelectorAll("[data-remove-configured]")) {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        const moduleIdToRemove = btn.dataset.removeConfigured;

        const updated = presetApi.getActivePresetModuleIds().filter((id) => id !== moduleIdToRemove);
        await presetApi.setActivePresetModuleIds(updated);

        // Update DOM directly to avoid re-rendering the whole dialog
        const row = btn.closest("[data-removed]");
        if (row) {
          row.style.animation = "mst-fade-out 0.2s ease-out";
          setTimeout(() => row.remove(), 200);
        }

        const summaryEl = root.querySelector(".mst-configured-summary strong");
        if (summaryEl) {
          const currentCount = parseInt(summaryEl.textContent) || 0;
          if (currentCount > 0) {
            summaryEl.textContent = currentCount - 1;
          }
        }

        ui.notifications?.info("Removed missing module from preset.");
      });
    }

    updateActiveFilterButtonState();
    applyModuleFilters();
    updateSelectionState();
  }

  async _onApplyPreset() {
    const activePreset = presetApi.getActivePresetMeta();

    const diff = this._calculateApplyDiff();
    const confirmed = await this._showApplyDiff(activePreset, diff);
    if (!confirmed) {
      ui.notifications?.info("Module Setup Tools: apply cancelled.");
      return;
    }

    await this._performApply();
  }

  async _performApply() {
    const activePreset = presetApi.getActivePresetMeta();
    const configuredIds = presetApi.getActivePresetModuleIds();

    const currentModuleConfig = foundry.utils.deepClone(
      game.settings.get("core", "moduleConfiguration") ?? {}
    );

    const missingDeps = dependencyApi.resolveMissingDependencies(configuredIds, currentModuleConfig);

    if (missingDeps.length > 0) {
      const resolution = await promptForDependencyResolution(configuredIds, missingDeps);
      if (!resolution.resolved) {
        ui.notifications?.info("Module Setup Tools: apply cancelled.");
        return;
      }
      const uniqueIds = [...new Set(resolution.modulesToEnable)];
      configuredIds.length = 0;
      configuredIds.push(...uniqueIds);
    }

    const enabledNow = [];
    const disabledNow = [];

    const moduleConfiguration = foundry.utils.deepClone(currentModuleConfig);
    const desiredIdSet = new Set(configuredIds);

    for (const id of configuredIds) {
      const module = game.modules.get(id);
      if (!module || module.active) continue;

      moduleConfiguration[id] = true;
      enabledNow.push(id);
    }

    // Authoritative apply: disable any currently enabled module not in the desired preset.
    for (const module of game.modules.values()) {
      const id = module.id;
      if (id === MODULE_ID) continue;
      if (desiredIdSet.has(id)) continue;

      const currentlyEnabled = module.active || moduleConfiguration[id] === true;
      if (!currentlyEnabled) continue;

      moduleConfiguration[id] = false;
      disabledNow.push(id);
    }

    if (enabledNow.length > 0 || disabledNow.length > 0) {
      await game.settings.set("core", "moduleConfiguration", moduleConfiguration);
    }

    await game.settings.set(MODULE_ID, SETTINGS.appliedPresetId, activePreset.id);
    ui.notifications?.info(`Module Setup Tools: preset applied: +${enabledNow.length} enabled, -${disabledNow.length} disabled.`);

    // Reload the world if module activation state changed.
    if (enabledNow.length > 0 || disabledNow.length > 0) {
      ui.notifications?.info("Reloading world to activate modules...");
      localStorage.setItem(REOPEN_FLAG_KEY, "1");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      await this.render(true);
    }
  }

  _calculateSaveDiff(newIds) {
    const currentSet = new Set(presetApi.getActivePresetModuleIds());
    const newSet = new Set(newIds);

    const willAdd = [];
    const willRemove = [];
    const alreadyIn = [];

    for (const id of newSet) {
      if (!id || !String(id).trim() || String(id) === "null") continue;

      const entry = { id, title: game.modules.get(id)?.title ?? id };
      if (currentSet.has(id)) {
        alreadyIn.push(entry);
      } else {
        willAdd.push(entry);
      }
    }

    for (const id of currentSet) {
      if (!newSet.has(id)) {
        willRemove.push({ id, title: game.modules.get(id)?.title ?? id });
      }
    }

    return { willAdd, willRemove, alreadyIn };
  }

  async _showSaveDiff(preset, diff) {
    let content = `<div class="mst-diff-dialog">`;
    content += `<p><strong>Preset:</strong> ${escapeHtml(preset.name)}</p>`;
    content += `<p>Review your changes before saving to this preset.</p>`;
    content += this._diffSection("Will Add to Preset", diff.willAdd, "color: #7a9928;");
    content += this._diffSection("Will Remove from Preset", diff.willRemove, "color: #c48b2b;");
    content += this._diffSection("Already in Preset", diff.alreadyIn, "opacity: 0.7;", "opacity: 0.7;");
    content += `</div>`;

    return new Promise((resolve) => {
      new Dialog({
        title: "Save Preset",
        content,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save",
            callback: () => resolve("save")
          },
          saveApply: {
            icon: '<i class="fas fa-rocket"></i>',
            label: "Save & Apply",
            callback: () => resolve("save-and-apply")
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve("cancel")
          }
        },
        default: "save",
        close: () => resolve("cancel")
      }).render(true);
    });
  }

  _diffSection(label, entries, headingStyle, listStyle = "") {
    if (entries.length === 0) return "";

    const items = entries
      .map((entry) => `<li>${escapeHtml(entry.title ?? entry.id)}</li>`)
      .join("");

    return `<div class="mst-diff-section">`
      + `<strong style="${headingStyle}">${label} (${entries.length}):</strong>`
      + `<ul style="margin: 0.5rem 0; padding-left: 1.5rem; ${listStyle}">${items}</ul>`
      + `</div>`;
  }

  _calculateApplyDiff() {
    const configuredIds = presetApi.getActivePresetModuleIds();
    const currentModuleConfig = game.settings.get("core", "moduleConfiguration") ?? {};

    const missing = [];
    const alreadyEnabled = [];
    const willEnable = [];
    const willDisable = [];

    const desiredIdSet = new Set(configuredIds);

    for (const id of configuredIds) {
      const module = game.modules.get(id);
      if (!module) {
        missing.push({ id, title: null });
        continue;
      }

      const entry = { id, title: module.title ?? id };
      if (module.active) {
        alreadyEnabled.push(entry);
      } else {
        willEnable.push(entry);
      }
    }

    for (const module of game.modules.values()) {
      const id = module.id;
      if (id === MODULE_ID) continue;
      if (desiredIdSet.has(id)) continue;

      const currentlyEnabled = module.active || currentModuleConfig[id] === true;
      if (!currentlyEnabled) continue;

      willDisable.push({ id, title: module.title ?? id });
    }

    return { willEnable, willDisable, alreadyEnabled, missing };
  }

  async _showApplyDiff(preset, diff) {
    let content = `<div class="mst-diff-dialog">`;
    content += `<p><strong>Preset:</strong> ${escapeHtml(preset.name)}</p>`;
    content += `<p>Review what will change when this preset is applied to the world.</p>`;
    content += this._diffSection("Will Enable in World", diff.willEnable, "color: #7a9928;");
    content += this._diffSection("Will Disable in World", diff.willDisable, "color: #c48b2b;");
    content += this._diffSection("Already Enabled in World", diff.alreadyEnabled, "opacity: 0.7;", "opacity: 0.7;");

    if (diff.missing.length > 0) {
      const items = diff.missing
        .map((entry) => `<li><code>${escapeHtml(entry.id)}</code></li>`)
        .join("");
      content += `<div class="mst-diff-section">`
        + `<strong style="color: #cc3333;">Missing / Not Installed (${diff.missing.length}):</strong>`
        + `<ul style="margin: 0.5rem 0; padding-left: 1.5rem; opacity: 0.8;">${items}</ul>`
        + `</div>`;
    }

    content += `</div>`;

    return Dialog.confirm({
      title: "Apply Preset to World",
      content,
      yes: () => true,
      no: () => false,
      defaultYes: true
    });
  }

  async _updateObject(_event, formData) {
    const values = formData.presetModulesSelected;
    const selected = Array.isArray(values) ? values : (values ? [values] : []);
    const deduped = [...new Set(selected.map((entry) => String(entry).trim()).filter((id) => id && id !== "null"))];

    // Check if any selected modules have installed dependencies not also selected
    const selectedSet = new Set(deduped);
    const missingDeps = [...dependencyApi.collectAllDependencies(deduped)]
      .filter((depId) => game.modules.has(depId) && !selectedSet.has(depId));

    let finalIds = deduped;
    if (missingDeps.length > 0) {
      const resolution = await promptForDependencyResolution(deduped, missingDeps);
      if (!resolution.resolved) return;
      finalIds = resolution.modulesToEnable;
    }

    const activePreset = presetApi.getActivePresetMeta();
    const action = await this._showSaveDiff(activePreset, this._calculateSaveDiff(finalIds));

    if (action === "save") {
      await presetApi.setActivePresetModuleIds(finalIds);
      await presetApi.updateTitleCache(finalIds);
      ui.notifications?.info("Module Setup Tools: preset saved.");
      await this.render(true);
    } else if (action === "save-and-apply") {
      await presetApi.setActivePresetModuleIds(finalIds);
      await presetApi.updateTitleCache(finalIds);
      ui.notifications?.info("Module Setup Tools: preset saved. Applying to world...");
      await this._performApply();
    }
  }
}
