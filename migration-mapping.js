/**
 * This webpack resolver is largely based on TypeScript's "paths" handling
 * The TypeScript license can be found here:
 * https://github.com/microsoft/TypeScript/blob/214df64e287804577afa1fea0184c18c40f7d1ca/LICENSE.txt
 *
 * refer to: https://github.com/vercel/next.js/blob/canary/packages/next/build/webpack/plugins/jsconfig-paths-plugin.ts
 */

/**
 * Classify mapping keys into buckets for the matching strategy chain.
 * Non-wildcard keys go to `nonWildcard` (used for both exact and suffix match).
 * Wildcard keys (containing *) go to `wildcard` with parsed prefix/suffix.
 */
function classifyMappings(paths) {
  const nonWildcard = {};
  const wildcard = [];

  for (const [key, value] of Object.entries(paths)) {
    if (key.includes('*')) {
      const starIndex = key.indexOf('*');
      wildcard.push({
        key,
        prefix: key.slice(0, starIndex),
        suffix: key.slice(starIndex + 1),
        target: value,
      });
    } else {
      nonWildcard[key] = value;
    }
  }

  return { nonWildcard, wildcard };
}

/**
 * Match a module name against classified mappings.
 * Priority: exact match → wildcard match → suffix match.
 * Returns { pattern, target } or null.
 */
function matchMapping(moduleName, classified) {
  // 1. Exact match
  if (classified.nonWildcard[moduleName] !== undefined) {
    return { pattern: moduleName, target: classified.nonWildcard[moduleName] };
  }

  // 2. Wildcard match
  for (const wc of classified.wildcard) {
    if (
      moduleName.startsWith(wc.prefix) &&
      moduleName.endsWith(wc.suffix) &&
      moduleName.length >= wc.prefix.length + wc.suffix.length
    ) {
      const endIndex = wc.suffix.length > 0
        ? moduleName.length - wc.suffix.length
        : moduleName.length;
      const captured = moduleName.slice(wc.prefix.length, endIndex);
      const starIndex = wc.target.indexOf('*');
      const target =
        wc.target.slice(0, starIndex) + captured + wc.target.slice(starIndex + 1);
      return { pattern: wc.key, target };
    }
  }

  // 3. Suffix match (with / boundary check)
  for (const [key, value] of Object.entries(classified.nonWildcard)) {
    if (moduleName.endsWith(key) && moduleName.length > key.length) {
      const matchStart = moduleName.length - key.length;
      if (moduleName[matchStart - 1] === '/') {
        return { pattern: key, target: value };
      }
    }
  }

  return null;
}

class MigrationMappingPlugin {
  constructor({ paths }) {
    this.paths = paths;
  }
  apply(resolver) {
    const target = resolver.ensureHook('resolve');
    resolver
      .getHook('described-resolve')
      .tapAsync('MigrationMappingPlugin', (request, resolveContext, callback) => {
        const paths = this.paths;
        const pathsKeys = Object.keys(paths);

        // If no aliases are added bail out
        if (pathsKeys.length === 0) {
          return callback();
        }

        const moduleName = request.request;

        // If the module name does not match any of the patterns in `paths` we hand off resolving to webpack
        const matchedPattern = matchPatternOrExact(pathsKeys, moduleName);

        if (!matchedPattern) {
          return callback();
        }

        if (!paths[matchedPattern]) return callback();

        const curPath = paths[matchedPattern];
        // Ensure .d.ts is not matched
        if (curPath.endsWith('.d.ts')) {
          // try next path candidate
          return callback();
        }
        const candidate = curPath;
        const obj = Object.assign({}, request, {
          request: candidate,
        });

        resolver.doResolve(
          target,
          obj,
          `Aliased for migration: ${matchedPattern} to ${candidate}`,
          resolveContext,
          (resolverErr, resolverResult) => {
            if (resolverErr || resolverResult === undefined) {
              return callback();
            }
            return callback(resolverErr, resolverResult);
          }
        );
      });
  }
}

module.exports = {
  MigrationMappingPlugin,
  classifyMappings,
  matchMapping,
};
