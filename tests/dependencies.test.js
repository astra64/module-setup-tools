import { describe, it, expect } from 'vitest';
import { installFoundryFakes } from './helpers/foundry-fakes.js';
import { createDependencyApi } from '../scripts/lib/dependencies.js';

function makeModule({ requires = [], active = false, title } = {}) {
  return { title, relationships: { requires: requires.map((id) => ({ id })) }, active };
}

describe('getModuleDependencies', () => {
  it("returns a module's direct requirements by key, deduped", () => {
    installFoundryFakes({ modules: { 'module-a': makeModule({ requires: ['module-b', 'module-b'] }) } });
    const api = createDependencyApi();
    expect(api.getModuleDependencies('module-a')).toEqual(['module-b']);
  });

  it('returns an empty array for a module that is not installed', () => {
    installFoundryFakes({ modules: {} });
    const api = createDependencyApi();
    expect(api.getModuleDependencies('not-installed')).toEqual([]);
  });

  it('falls back to metadata.relationships.requires for older manifest shapes', () => {
    installFoundryFakes({
      modules: { 'module-a': { metadata: { relationships: { requires: [{ id: 'legacy-dep' }] } } } },
    });
    const api = createDependencyApi();
    expect(api.getModuleDependencies('module-a')).toEqual(['legacy-dep']);
  });
});

describe('collectAllDependencies', () => {
  it('walks the full transitive dependency chain', () => {
    installFoundryFakes({
      modules: {
        'module-a': makeModule({ requires: ['module-b'] }),
        'module-b': makeModule({ requires: ['module-c'] }),
        'module-c': makeModule({ requires: [] }),
      },
    });
    const api = createDependencyApi();
    expect(api.collectAllDependencies(['module-a'])).toEqual(new Set(['module-b', 'module-c']));
  });

  it('does not loop forever on a dependency cycle', () => {
    installFoundryFakes({
      modules: {
        'module-a': makeModule({ requires: ['module-b'] }),
        'module-b': makeModule({ requires: ['module-a'] }),
      },
    });
    const api = createDependencyApi();
    // module-a is also recorded as a dependency here, since it's module-b's own requirement
    // (a real cycle) — collectAllDependencies records every dep it sees, seed modules included.
    expect(api.collectAllDependencies(['module-a'])).toEqual(new Set(['module-a', 'module-b']));
  });

  it('skips re-walking modules already present in the current config', () => {
    installFoundryFakes({
      modules: {
        'module-a': makeModule({ requires: ['module-b'] }),
        'module-b': makeModule({ requires: ['module-c'] }),
        'module-c': makeModule({ requires: [] }),
      },
    });
    const api = createDependencyApi();
    // module-b is already "visited" via currentModuleConfig, so its own dep (module-c)
    // is never walked even though module-a still requires it.
    const result = api.collectAllDependencies(['module-a'], { 'module-b': true });
    expect(result).toEqual(new Set(['module-b']));
  });
});

describe('resolveMissingDependencies', () => {
  it('flags a transitive dependency that is neither active nor already in the config', () => {
    installFoundryFakes({
      modules: {
        'module-a': makeModule({ requires: ['module-b'] }),
        'module-b': makeModule({ requires: [], active: false }),
      },
    });
    const api = createDependencyApi();
    expect(api.resolveMissingDependencies(['module-a'])).toEqual(['module-b']);
  });

  it('does not flag a dependency that is already active', () => {
    installFoundryFakes({
      modules: {
        'module-a': makeModule({ requires: ['module-b'] }),
        'module-b': makeModule({ requires: [], active: true }),
      },
    });
    const api = createDependencyApi();
    expect(api.resolveMissingDependencies(['module-a'])).toEqual([]);
  });

  it('does not flag a dependency already checked in the current module config', () => {
    installFoundryFakes({
      modules: {
        'module-a': makeModule({ requires: ['module-b'] }),
        'module-b': makeModule({ requires: [], active: false }),
      },
    });
    const api = createDependencyApi();
    expect(api.resolveMissingDependencies(['module-a'], { 'module-b': true })).toEqual([]);
  });

  it('silently ignores a dependency id that is not an installed module', () => {
    installFoundryFakes({
      modules: {
        'module-a': makeModule({ requires: ['ghost-module'] }),
      },
    });
    const api = createDependencyApi();
    expect(api.resolveMissingDependencies(['module-a'])).toEqual([]);
  });
});

describe('findModulesWithInvalidDependencyMetadata', () => {
  it('reports modules whose requires list has a blank, "null" or non-string id', () => {
    installFoundryFakes({
      modules: {
        good: makeModule({ requires: ['module-b'], title: 'Good' }),
        blank: makeModule({ requires: ['  '], title: 'Blank' }),
        nullString: makeModule({ requires: ['null', 'module-b'] }),
        noId: { relationships: { requires: [{}] } },
      },
    });
    const api = createDependencyApi();
    expect(api.findModulesWithInvalidDependencyMetadata()).toEqual([
      { id: 'blank', title: 'Blank', invalidCount: 1 },
      { id: 'nullString', title: 'nullString', invalidCount: 1 },
      { id: 'noId', title: 'noId', invalidCount: 1 },
    ]);
  });

  it('returns an empty list when every module is well-formed', () => {
    installFoundryFakes({ modules: { a: makeModule({ requires: ['b'] }), b: makeModule() } });
    expect(createDependencyApi().findModulesWithInvalidDependencyMetadata()).toEqual([]);
  });
});

describe('findActiveModulesWithMissingDependencies', () => {
  it('reports an active module whose requirement is not active, ignoring inactive modules', () => {
    installFoundryFakes({
      modules: {
        'module-a': makeModule({ requires: ['module-b', 'module-c'], active: true, title: 'A' }),
        'module-b': makeModule({ active: true }),
        'module-c': makeModule({ active: false }),
        'module-d': makeModule({ requires: ['module-c'], active: false }),
      },
    });
    const api = createDependencyApi();
    expect(api.findActiveModulesWithMissingDependencies()).toEqual([
      { moduleId: 'module-a', moduleTitle: 'A', missingDeps: ['module-c'] },
    ]);
  });
});
