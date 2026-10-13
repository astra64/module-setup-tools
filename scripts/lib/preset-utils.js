import { SETTINGS } from "../constants.js";

export function parseTitlesMap(raw) {
  try { return JSON.parse(raw ?? "{}"); } catch { return {}; }
}

function normalizeModuleIdArray(ids) {
  if (!Array.isArray(ids)) return [];

  return [...new Set(
    ids
      .map((id) => String(id ?? "").trim())
      .filter((id) => id.length > 0 && id !== "null" && id !== "undefined")
  )];
}

export function buildSelectionSignature(ids) {
  return [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join("\n");
}

function parsePresetMap(raw, defaultPresetId) {
  try {
    const parsed = JSON.parse(raw ?? "{}");
    const source = parsed && typeof parsed === "object" ? parsed : {};
    const map = {};

    for (const [id, preset] of Object.entries(source)) {
      const normalizedId = String(id ?? "").trim();
      if (!normalizedId) continue;

      const name = typeof preset?.name === "string" && preset.name.trim().length > 0
        ? preset.name.trim()
        : normalizedId;
      const moduleIds = normalizeModuleIdArray(preset?.moduleIds);

      map[normalizedId] = { name, moduleIds };
    }

    if (!map[defaultPresetId]) {
      map[defaultPresetId] = { name: "Default", moduleIds: [] };
    }
    return map;
  } catch {
    return { [defaultPresetId]: { name: "Default", moduleIds: [] } };
  }
}

function presetNameExists(name, presets, excludeId = null) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (!normalized) return false;

  for (const [id, preset] of Object.entries(presets)) {
    if (excludeId && id === excludeId) continue;
    const presetName = String(preset?.name ?? id).trim().toLowerCase();
    if (presetName === normalized) return true;
  }

  return false;
}

export function suggestUniquePresetName(baseName, presets, excludeId = null) {
  const base = String(baseName ?? "").trim() || "Preset";
  if (!presetNameExists(base, presets, excludeId)) return base;

  let i = 2;
  while (presetNameExists(`${base} ${i}`, presets, excludeId)) {
    i += 1;
  }

  return `${base} ${i}`;
}

export function createPresetApi({ moduleId, defaultPresetId }) {
  function getPresetMap() {
    return parsePresetMap(game.settings.get(moduleId, SETTINGS.presets), defaultPresetId);
  }

  async function savePresetMap(presetMap) {
    await game.settings.set(moduleId, SETTINGS.presets, JSON.stringify(presetMap));
  }

  function getActivePresetId() {
    return String(game.settings.get(moduleId, SETTINGS.activePresetId) ?? defaultPresetId);
  }

  function getAppliedPresetId() {
    return String(game.settings.get(moduleId, SETTINGS.appliedPresetId) ?? defaultPresetId);
  }

  function getActivePresetMeta() {
    const presetMap = getPresetMap();
    const activePresetId = getActivePresetId();
    const preset = presetMap[activePresetId];
    const presetName = typeof preset?.name === "string" && preset.name.trim().length > 0
      ? preset.name.trim()
      : (activePresetId === defaultPresetId ? "Default" : activePresetId);
    const moduleIds = normalizeModuleIdArray(preset?.moduleIds);

    return {
      id: activePresetId,
      name: presetName,
      moduleCount: moduleIds.length
    };
  }

  function getAppliedPresetMeta() {
    const presetMap = getPresetMap();
    const appliedPresetId = getAppliedPresetId();
    const resolvedId = presetMap[appliedPresetId] ? appliedPresetId : defaultPresetId;
    const preset = presetMap[resolvedId];
    const fallbackName = resolvedId === defaultPresetId ? "Default" : resolvedId;

    return {
      id: resolvedId,
      name: preset?.name ?? fallbackName
    };
  }

  async function sanitizeAppliedPresetId() {
    const presetMap = getPresetMap();
    const appliedPresetId = getAppliedPresetId();
    if (presetMap[appliedPresetId]) return;

    await game.settings.set(moduleId, SETTINGS.appliedPresetId, defaultPresetId);
  }

  /** Rewrites the stored preset map if normalizing it changed anything. */
  async function sanitizePresets() {
    const raw = game.settings.get(moduleId, SETTINGS.presets);
    let parsedRaw = {};
    try {
      parsedRaw = JSON.parse(raw ?? "{}");
    } catch {
      parsedRaw = {};
    }

    const normalized = parsePresetMap(raw, defaultPresetId);

    if (JSON.stringify(parsedRaw) !== JSON.stringify(normalized)) {
      await savePresetMap(normalized);
      console.log(`[${moduleId}] Sanitized stored presets`);
    }
  }

  function getActivePresetModuleIds() {
    const presetMap = getPresetMap();
    const preset = presetMap[getActivePresetId()];

    return normalizeModuleIdArray(preset?.moduleIds);
  }

  async function setActivePresetModuleIds(moduleIds) {
    const presetMap = getPresetMap();
    const activePresetId = getActivePresetId();
    const currentPreset = presetMap[activePresetId] ?? {
      name: activePresetId === defaultPresetId ? "Default" : activePresetId,
      moduleIds: []
    };

    presetMap[activePresetId] = {
      ...currentPreset,
      moduleIds: normalizeModuleIdArray(moduleIds)
    };

    await savePresetMap(presetMap);
  }

  /** Records a module-id -> title lookup so uninstalled modules in a preset keep a readable name. */
  async function updateTitleCache(ids) {
    const map = parseTitlesMap(game.settings.get(moduleId, SETTINGS.presetModuleTitles));
    const idSet = new Set(ids);
    for (const id of ids) {
      const title = game.modules.get(id)?.title;
      if (title) map[id] = title;
    }
    for (const id of Object.keys(map)) {
      if (!idSet.has(id)) delete map[id];
    }
    await game.settings.set(moduleId, SETTINGS.presetModuleTitles, JSON.stringify(map));
  }

  async function createPreset(name) {
    const presetMap = getPresetMap();
    const finalName = suggestUniquePresetName(name, presetMap);
    const newId = `preset-${Date.now()}`;
    presetMap[newId] = { name: finalName, moduleIds: [] };
    await savePresetMap(presetMap);
    return { id: newId, name: finalName };
  }

  async function renamePreset(presetId, name) {
    const presetMap = getPresetMap();
    const preset = presetMap[presetId];
    if (!preset) return null;

    const finalName = suggestUniquePresetName(name, presetMap, presetId);
    preset.name = finalName;
    await savePresetMap(presetMap);
    return { id: presetId, name: finalName };
  }

  async function duplicatePreset(presetId) {
    const presetMap = getPresetMap();
    const preset = presetMap[presetId];
    if (!preset) return null;

    const newId = `preset-${Date.now()}`;
    const newName = suggestUniquePresetName(`${preset.name ?? presetId} (copy)`, presetMap);
    presetMap[newId] = { name: newName, moduleIds: [...(preset.moduleIds ?? [])] };
    await savePresetMap(presetMap);
    return { id: newId, name: newName };
  }

  /** Deletes a preset, resetting the active/applied ids to the default if they pointed at it. */
  async function deletePreset(presetId) {
    if (presetId === defaultPresetId) return false;

    const presetMap = getPresetMap();
    if (!presetMap[presetId]) return false;

    delete presetMap[presetId];
    await savePresetMap(presetMap);

    if (getActivePresetId() === presetId) {
      await game.settings.set(moduleId, SETTINGS.activePresetId, defaultPresetId);
    }
    if (getAppliedPresetId() === presetId) {
      await game.settings.set(moduleId, SETTINGS.appliedPresetId, defaultPresetId);
    }
    return true;
  }

  async function addImportedPreset(presetName, moduleIds) {
    const presetMap = getPresetMap();
    const uniqueName = suggestUniquePresetName(presetName, presetMap);
    const newId = `preset-${Date.now()}`;
    presetMap[newId] = { name: uniqueName, moduleIds: normalizeModuleIdArray(moduleIds) };
    await savePresetMap(presetMap);
    return { id: newId, name: uniqueName };
  }

  return {
    getPresetMap,
    getActivePresetId,
    getAppliedPresetId,
    getActivePresetMeta,
    getAppliedPresetMeta,
    sanitizeAppliedPresetId,
    sanitizePresets,
    getActivePresetModuleIds,
    setActivePresetModuleIds,
    updateTitleCache,
    createPreset,
    renamePreset,
    duplicatePreset,
    deletePreset,
    addImportedPreset,
    parsePresetMap: (raw) => parsePresetMap(raw, defaultPresetId),
    presetNameExists,
    suggestUniquePresetName
  };
}

export function validatePresetExport(json) {
  try {
    const data = typeof json === "string" ? JSON.parse(json) : json;

    if (!data || typeof data !== "object") {
      return { valid: false, error: "Preset file is invalid" };
    }

    if (typeof data.schemaVersion !== "number") {
      return { valid: false, error: "Preset file is missing schema version" };
    }

    if (data.schemaVersion !== 1) {
      return { valid: false, error: `Preset file schema version ${data.schemaVersion} is not supported` };
    }

    if (typeof data.presetName !== "string" || data.presetName.trim().length === 0) {
      return { valid: false, error: "Preset file is missing preset name" };
    }

    if (!Array.isArray(data.moduleIds)) {
      return { valid: false, error: "Preset file is missing module IDs list" };
    }

    return { valid: true, data };
  } catch {
    return { valid: false, error: "Preset file is not valid JSON" };
  }
}

export function exportPresetToClipboard(presetApi, presetId) {
  const preset = presetApi.getPresetMap()[presetId];
  if (!preset) {
    ui.notifications?.error("Preset not found");
    return;
  }

  const exportData = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    presetName: preset.name,
    moduleIds: preset.moduleIds ?? []
  };

  const jsonString = JSON.stringify(exportData, null, 2);

  navigator.clipboard.writeText(jsonString).then(() => {
    ui.notifications?.info(`Preset "${preset.name}" copied to clipboard`);
  }).catch(() => {
    ui.notifications?.error("Could not copy to clipboard");
  });
}

export function importPreset(presetApi, onComplete) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  const finishImport = async (presetName, moduleIds) => {
    const imported = await presetApi.addImportedPreset(presetName, moduleIds);
    ui.notifications?.info(`Preset "${imported.name}" imported`);
    onComplete?.(imported.id);
  };

  input.onchange = async () => {
    if (!input.files || !input.files[0]) return;

    try {
      const text = await input.files[0].text();
      const validation = validatePresetExport(text);

      if (!validation.valid) {
        ui.notifications?.error(`Invalid preset file: ${validation.error}`);
        return;
      }

      const { data } = validation;
      const presetName = String(data.presetName).trim();
      const moduleIds = normalizeModuleIdArray(data.moduleIds ?? []);

      const installedModules = new Set([...game.modules.keys()]);
      const missingModules = moduleIds.filter((id) => !installedModules.has(id));

      if (missingModules.length === 0) {
        await finishImport(presetName, moduleIds);
        return;
      }

      const missingList = missingModules
        .map((id) => `<li>${game.modules.get(id)?.title ?? id}</li>`)
        .join("");

      new Dialog({
        title: "Some modules not installed",
        content: `
          <p>The following modules in this preset are not installed:</p>
          <ul>${missingList}</ul>
          <p>Choose how to proceed:</p>
        `,
        buttons: {
          importAnyway: {
            label: "Import Anyway",
            callback: () => finishImport(presetName, moduleIds)
          },
          filterAndImport: {
            label: "Filter & Import",
            callback: () => finishImport(presetName, moduleIds.filter((id) => installedModules.has(id)))
          },
          cancel: {
            label: "Cancel"
          }
        },
        default: "importAnyway"
      }).render(true);
    } catch (err) {
      ui.notifications?.error("Could not read preset file");
      console.error(err);
    }
  };

  input.click();
}
