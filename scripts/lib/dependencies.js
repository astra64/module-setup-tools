function readRequiredIds(module) {
  const requires =
    module?.relationships?.requires ??
    module?.metadata?.relationships?.requires ??
    [];

  return requires;
}

export function createDependencyApi() {
  function getModuleDependencies(moduleKey) {
    const module = game.modules.get(moduleKey);
    if (!module) return [];

    return [...new Set(
      readRequiredIds(module)
        .map((entry) => entry?.id)
        .filter((id) => typeof id === "string" && id.length > 0)
    )];
  }

  function collectAllDependencies(moduleIds, currentModuleConfig = {}) {
    const visited = new Set(Object.keys(currentModuleConfig));
    const toVisit = [...moduleIds];
    const allDependencies = new Set();

    while (toVisit.length > 0) {
      const id = toVisit.shift();
      if (visited.has(id)) continue;

      visited.add(id);
      const deps = getModuleDependencies(id);

      for (const dep of deps) {
        allDependencies.add(dep);
        if (!visited.has(dep)) {
          toVisit.push(dep);
        }
      }
    }

    return allDependencies;
  }

  function resolveMissingDependencies(moduleIds, currentModuleConfig = {}) {
    const allNeededDeps = collectAllDependencies(moduleIds, currentModuleConfig);
    const missingDeps = [];

    for (const depId of allNeededDeps) {
      const depModule = game.modules.get(depId);

      if (!depModule) continue;

      const isActive = depModule.active ?? false;
      const isInConfig = currentModuleConfig[depId] === true;
      if (!isActive && !isInConfig) {
        missingDeps.push(depId);
      }
    }

    return missingDeps;
  }

  /** Installed modules whose `requires` list has a missing/blank/"null" id. */
  function findModulesWithInvalidDependencyMetadata() {
    const offenders = [];

    for (const module of game.modules.values()) {
      const requires = readRequiredIds(module);
      if (!Array.isArray(requires) || requires.length === 0) continue;

      const invalidEntries = requires.filter((entry) => {
        const id = entry?.id;
        if (typeof id !== "string") return true;
        const trimmed = id.trim();
        return trimmed.length === 0 || trimmed === "null" || trimmed === "undefined";
      });

      if (invalidEntries.length > 0) {
        offenders.push({
          id: module.id,
          title: module.title ?? module.id,
          invalidCount: invalidEntries.length
        });
      }
    }

    return offenders;
  }

  /** Active modules that require a module which isn't active. */
  function findActiveModulesWithMissingDependencies() {
    const issues = [];

    for (const module of game.modules.values()) {
      if (!module.active) continue;

      const missingDeps = getModuleDependencies(module.id).filter((depId) => !game.modules.get(depId)?.active);
      if (missingDeps.length > 0) {
        issues.push({
          moduleId: module.id,
          moduleTitle: module.title ?? module.id,
          missingDeps
        });
      }
    }

    return issues;
  }

  return {
    getModuleDependencies,
    collectAllDependencies,
    resolveMissingDependencies,
    findModulesWithInvalidDependencyMetadata,
    findActiveModulesWithMissingDependencies
  };
}
