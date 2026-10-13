import { createPresetApi } from "./preset-utils.js";
import { createDependencyApi } from "./dependencies.js";

/**
 * Builds the module's full API surface. Nothing here assumes a game system or any compendium
 * content, so it works in any Foundry world.
 */
export function createModuleSetupToolsApi({ moduleId, defaultPresetId }) {
  const presetApi = createPresetApi({ moduleId, defaultPresetId });
  const dependencyApi = createDependencyApi();

  return { presetApi, dependencyApi };
}
