import { MODULE_ID, DEFAULT_PRESET_ID } from "./constants.js";
import { createModuleSetupToolsApi } from "./lib/index.js";

export const api = createModuleSetupToolsApi({
  moduleId: MODULE_ID,
  defaultPresetId: DEFAULT_PRESET_ID
});
