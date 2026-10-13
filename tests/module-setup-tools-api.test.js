/**
 * Module Setup Tools must work in any Foundry world — no game system, no compendium content, no
 * other module installed. These tests exercise the full API surface (createModuleSetupToolsApi)
 * against a fake `game` with no `.system` property and no packs, to catch a system- or
 * content-specific assumption creeping in.
 */
import { describe, it, expect } from 'vitest';
import { installFoundryFakes } from './helpers/foundry-fakes.js';
import { createModuleSetupToolsApi } from '../scripts/lib/index.js';
import { MODULE_ID, DEFAULT_PRESET_ID } from '../scripts/constants.js';

function installSystemlessFakes(options = {}) {
  const fakes = installFoundryFakes(options);
  // installFoundryFakes never sets game.system or game.packs with content by default, but
  // assert that explicitly so this test fails loudly if that default ever changes.
  expect(globalThis.game.system).toBeUndefined();
  expect([...globalThis.game.packs]).toEqual([]);
  return fakes;
}

function makeApi() {
  return createModuleSetupToolsApi({ moduleId: MODULE_ID, defaultPresetId: DEFAULT_PRESET_ID });
}

describe('createModuleSetupToolsApi runs with no game system and no compendium content', () => {
  it('builds successfully and exposes the presetApi/dependencyApi surface', () => {
    installSystemlessFakes();
    const api = makeApi();

    expect(api.presetApi.getPresetMap()).toBeTruthy();
    expect(typeof api.dependencyApi.resolveMissingDependencies).toBe('function');
  });

  it('resolves dependencies for an installed module graph', () => {
    installSystemlessFakes({
      modules: {
        'module-a': { relationships: { requires: [{ id: 'module-b' }] }, active: false },
        'module-b': { relationships: { requires: [] }, active: false },
      },
    });
    expect(makeApi().dependencyApi.resolveMissingDependencies(['module-a'])).toEqual(['module-b']);
  });

  it('updateTitleCache reads module titles and settings without touching game.system or packs', async () => {
    const { settingsStore } = installSystemlessFakes({
      modules: { 'module-a': { title: 'Module A' } },
    });
    await makeApi().presetApi.updateTitleCache(['module-a']);
    expect(JSON.parse(settingsStore.get('presetModuleTitles'))).toEqual({ 'module-a': 'Module A' });
  });

  it('setActivePresetModuleIds/getActivePresetModuleIds round-trip with no system or content dependency', async () => {
    installSystemlessFakes();
    const { presetApi } = makeApi();

    await presetApi.setActivePresetModuleIds(['module-a', 'module-b']);
    expect(presetApi.getActivePresetModuleIds()).toEqual(['module-a', 'module-b']);
  });
});
