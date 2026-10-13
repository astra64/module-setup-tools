import { describe, it, expect } from 'vitest';
import { installFoundryFakes } from './helpers/foundry-fakes.js';
import {
  parseTitlesMap,
  buildSelectionSignature,
  createPresetApi,
  validatePresetExport,
} from '../scripts/lib/preset-utils.js';
import { escapeHtml } from '../scripts/lib/html.js';
import { MODULE_ID, DEFAULT_PRESET_ID, SETTINGS } from '../scripts/constants.js';

describe('parseTitlesMap', () => {
  it('parses a JSON object, defaulting to {} for missing/invalid input', () => {
    expect(parseTitlesMap('{"a":"A Title"}')).toEqual({ a: 'A Title' });
    expect(parseTitlesMap(undefined)).toEqual({});
    expect(parseTitlesMap('not json')).toEqual({});
  });
});

describe('buildSelectionSignature', () => {
  it('trims, dedupes, drops blanks and sorts', () => {
    expect(buildSelectionSignature([' module-b ', 'module-a', 'module-a', '', null])).toBe('module-a\nmodule-b');
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that would break out of text or an attribute value', () => {
    expect(escapeHtml('<b a="1">&</b>')).toBe('&lt;b a=&quot;1&quot;&gt;&amp;&lt;/b&gt;');
    expect(escapeHtml(null)).toBe('');
  });
});

describe('validatePresetExport', () => {
  it('accepts a well-formed schema-version-1 preset', () => {
    const json = JSON.stringify({ schemaVersion: 1, presetName: 'My Preset', moduleIds: ['a', 'b'] });
    const result = validatePresetExport(json);
    expect(result.valid).toBe(true);
    expect(result.data.presetName).toBe('My Preset');
  });

  it('accepts an already-parsed object, not just a JSON string', () => {
    const result = validatePresetExport({ schemaVersion: 1, presetName: 'x', moduleIds: [] });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid JSON text', () => {
    expect(validatePresetExport('{not json')).toEqual({ valid: false, error: 'Preset file is not valid JSON' });
  });

  it('rejects null/non-object data', () => {
    expect(validatePresetExport('null').valid).toBe(false);
    expect(validatePresetExport('42').valid).toBe(false);
  });

  it('rejects a missing or non-numeric schema version', () => {
    const { valid, error } = validatePresetExport({ presetName: 'x', moduleIds: [] });
    expect(valid).toBe(false);
    expect(error).toMatch(/schema version/);
  });

  it('rejects an unsupported schema version', () => {
    const { valid, error } = validatePresetExport({ schemaVersion: 2, presetName: 'x', moduleIds: [] });
    expect(valid).toBe(false);
    expect(error).toMatch(/not supported/);
  });

  it('rejects a missing or blank preset name', () => {
    expect(validatePresetExport({ schemaVersion: 1, presetName: '  ', moduleIds: [] }).valid).toBe(false);
    expect(validatePresetExport({ schemaVersion: 1, moduleIds: [] }).valid).toBe(false);
  });

  it('rejects a non-array moduleIds', () => {
    const { valid, error } = validatePresetExport({ schemaVersion: 1, presetName: 'x', moduleIds: 'not-an-array' });
    expect(valid).toBe(false);
    expect(error).toMatch(/module IDs/);
  });
});

describe('createPresetApi', () => {
  function makeApi(settings = {}, modules = {}) {
    const fakes = installFoundryFakes({ settings, modules });
    const api = createPresetApi({ moduleId: MODULE_ID, defaultPresetId: DEFAULT_PRESET_ID });
    return { api, settingsStore: fakes.settingsStore };
  }

  const storedPresets = (settingsStore) => JSON.parse(settingsStore.get(SETTINGS.presets));

  it('getPresetMap always includes the default preset, even with no stored presets', () => {
    const { api } = makeApi();
    expect(api.getPresetMap()).toEqual({ [DEFAULT_PRESET_ID]: { name: 'Default', moduleIds: [] } });
  });

  it('getPresetMap normalizes stored preset entries (trims names, dedupes moduleIds)', () => {
    const { api } = makeApi({
      [SETTINGS.presets]: JSON.stringify({
        'preset-1': { name: '  My Kit  ', moduleIds: ['mod-a', 'mod-a', ' mod-b '] },
      }),
    });
    expect(api.getPresetMap()['preset-1']).toEqual({ name: 'My Kit', moduleIds: ['mod-a', 'mod-b'] });
  });

  it('getActivePresetId / getAppliedPresetId fall back to the default when unset', () => {
    const { api } = makeApi();
    expect(api.getActivePresetId()).toBe(DEFAULT_PRESET_ID);
    expect(api.getAppliedPresetId()).toBe(DEFAULT_PRESET_ID);
  });

  it('getActivePresetMeta reports the active preset name and module count', () => {
    const { api } = makeApi({
      [SETTINGS.presets]: JSON.stringify({ 'preset-1': { name: 'My Kit', moduleIds: ['a', 'b'] } }),
      [SETTINGS.activePresetId]: 'preset-1',
    });
    expect(api.getActivePresetMeta()).toEqual({ id: 'preset-1', name: 'My Kit', moduleCount: 2 });
  });

  it('getAppliedPresetMeta falls back to the default preset if the stored applied id no longer exists', () => {
    const { api } = makeApi({ [SETTINGS.appliedPresetId]: 'deleted-preset' });
    expect(api.getAppliedPresetMeta()).toEqual({ id: DEFAULT_PRESET_ID, name: 'Default' });
  });

  it('sanitizeAppliedPresetId resets to the default when the applied preset no longer exists', async () => {
    const { api, settingsStore } = makeApi({ [SETTINGS.appliedPresetId]: 'deleted-preset' });
    await api.sanitizeAppliedPresetId();
    expect(settingsStore.get(SETTINGS.appliedPresetId)).toBe(DEFAULT_PRESET_ID);
  });

  it('sanitizeAppliedPresetId leaves a still-valid applied preset untouched', async () => {
    const { api, settingsStore } = makeApi({
      [SETTINGS.presets]: JSON.stringify({ 'preset-1': { name: 'My Kit', moduleIds: [] } }),
      [SETTINGS.appliedPresetId]: 'preset-1',
    });
    await api.sanitizeAppliedPresetId();
    expect(settingsStore.get(SETTINGS.appliedPresetId)).toBe('preset-1');
  });

  it('sanitizePresets rewrites a malformed stored map and leaves an already-clean one alone', async () => {
    const dirty = makeApi({ [SETTINGS.presets]: 'not json' });
    await dirty.api.sanitizePresets();
    expect(storedPresets(dirty.settingsStore)).toEqual({ [DEFAULT_PRESET_ID]: { name: 'Default', moduleIds: [] } });

    const clean = JSON.stringify({ [DEFAULT_PRESET_ID]: { name: 'Default', moduleIds: [] } });
    const untouched = makeApi({ [SETTINGS.presets]: clean });
    await untouched.api.sanitizePresets();
    expect(untouched.settingsStore.get(SETTINGS.presets)).toBe(clean);
  });

  it('setActivePresetModuleIds writes normalized IDs back under the active preset, preserving its name', async () => {
    const { api, settingsStore } = makeApi({
      [SETTINGS.presets]: JSON.stringify({ 'preset-1': { name: 'My Kit', moduleIds: [] } }),
      [SETTINGS.activePresetId]: 'preset-1',
    });
    await api.setActivePresetModuleIds(['mod-a', 'mod-a', ' mod-b ']);

    expect(storedPresets(settingsStore)['preset-1']).toEqual({ name: 'My Kit', moduleIds: ['mod-a', 'mod-b'] });
    expect(api.getActivePresetModuleIds()).toEqual(['mod-a', 'mod-b']);
  });

  it('presetNameExists matches case-insensitively and can exclude a given preset id', () => {
    const { api } = makeApi();
    const presets = { a: { name: 'My Kit' }, b: { name: 'Other Kit' } };
    expect(api.presetNameExists('my kit', presets)).toBe(true);
    expect(api.presetNameExists('My Kit', presets, 'a')).toBe(false);
    expect(api.presetNameExists('Unused Name', presets)).toBe(false);
  });

  it('suggestUniquePresetName appends an incrementing number until the name is free', () => {
    const { api } = makeApi();
    const presets = { a: { name: 'Preset' }, b: { name: 'Preset 2' } };
    expect(api.suggestUniquePresetName('Preset', presets)).toBe('Preset 3');
    expect(api.suggestUniquePresetName('New Name', presets)).toBe('New Name');
  });

  it('updateTitleCache records titles for the given ids and prunes ids no longer listed', async () => {
    const { api, settingsStore } = makeApi(
      { [SETTINGS.presetModuleTitles]: JSON.stringify({ gone: 'Gone Module', kept: 'Old Title' }) },
      { kept: { title: 'Kept Module' }, added: { title: 'Added Module' } }
    );
    await api.updateTitleCache(['kept', 'added', 'not-installed']);
    expect(JSON.parse(settingsStore.get(SETTINGS.presetModuleTitles))).toEqual({
      kept: 'Kept Module',
      added: 'Added Module',
    });
  });

  describe('preset CRUD', () => {
    it('createPreset adds an empty preset and de-duplicates the name', async () => {
      const { api, settingsStore } = makeApi({
        [SETTINGS.presets]: JSON.stringify({ x: { name: 'My Kit', moduleIds: [] } }),
      });
      const created = await api.createPreset('My Kit');
      expect(created.name).toBe('My Kit 2');
      expect(storedPresets(settingsStore)[created.id]).toEqual({ name: 'My Kit 2', moduleIds: [] });
    });

    it('renamePreset renames in place and keeps module ids', async () => {
      const { api, settingsStore } = makeApi({
        [SETTINGS.presets]: JSON.stringify({ x: { name: 'Old', moduleIds: ['a'] } }),
      });
      const renamed = await api.renamePreset('x', 'New');
      expect(renamed).toEqual({ id: 'x', name: 'New' });
      expect(storedPresets(settingsStore).x).toEqual({ name: 'New', moduleIds: ['a'] });
      expect(await api.renamePreset('missing', 'Whatever')).toBeNull();
    });

    it('duplicatePreset copies module ids under a "(copy)" name', async () => {
      const { api, settingsStore } = makeApi({
        [SETTINGS.presets]: JSON.stringify({ x: { name: 'My Kit', moduleIds: ['a', 'b'] } }),
      });
      const copy = await api.duplicatePreset('x');
      expect(copy.name).toBe('My Kit (copy)');
      expect(storedPresets(settingsStore)[copy.id].moduleIds).toEqual(['a', 'b']);
    });

    it('deletePreset removes it and resets the active/applied ids that pointed at it', async () => {
      const { api, settingsStore } = makeApi({
        [SETTINGS.presets]: JSON.stringify({ x: { name: 'My Kit', moduleIds: [] } }),
        [SETTINGS.activePresetId]: 'x',
        [SETTINGS.appliedPresetId]: 'x',
      });
      expect(await api.deletePreset('x')).toBe(true);
      expect(storedPresets(settingsStore).x).toBeUndefined();
      expect(settingsStore.get(SETTINGS.activePresetId)).toBe(DEFAULT_PRESET_ID);
      expect(settingsStore.get(SETTINGS.appliedPresetId)).toBe(DEFAULT_PRESET_ID);
    });

    it('deletePreset refuses the default preset and unknown ids', async () => {
      const { api } = makeApi();
      expect(await api.deletePreset(DEFAULT_PRESET_ID)).toBe(false);
      expect(await api.deletePreset('missing')).toBe(false);
    });

    it('addImportedPreset normalizes ids and de-duplicates the name', async () => {
      const { api, settingsStore } = makeApi({
        [SETTINGS.presets]: JSON.stringify({ x: { name: 'My Kit', moduleIds: [] } }),
      });
      const imported = await api.addImportedPreset('My Kit', ['a', 'a', ' b ']);
      expect(imported.name).toBe('My Kit 2');
      expect(storedPresets(settingsStore)[imported.id].moduleIds).toEqual(['a', 'b']);
    });
  });
});
