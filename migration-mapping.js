/**
 * This webpack resolver is largely based on TypeScript's "paths" handling
 * The TypeScript license can be found here:
 * https://github.com/microsoft/TypeScript/blob/214df64e287804577afa1fea0184c18c40f7d1ca/LICENSE.txt
 *
 * refer to: https://github.com/vercel/next.js/blob/canary/packages/next/build/webpack/plugins/jsconfig-paths-plugin.ts
 */

const fs = require('fs');
const path = require('path');

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

/**
 * Validate mapping entries at initialization time.
 * Throws for invalid configuration, warns for suspicious but non-fatal issues.
 */
function validateMappings(mappings) {
  if (typeof mappings !== 'object' || mappings === null || Array.isArray(mappings)) {
    throw new Error('[next-migration-mapping] mappings must be a plain object');
  }

  for (const [key, value] of Object.entries(mappings)) {
    if (key === '') {
      throw new Error('[next-migration-mapping] mapping key must not be empty');
    }
    if (typeof value !== 'string') {
      throw new Error(
        `[next-migration-mapping] mapping value for "${key}" must be a string, got ${typeof value}`
      );
    }

    const keyStars = (key.match(/\*/g) || []).length;
    const valueStars = (value.match(/\*/g) || []).length;

    if (keyStars > 1) {
      throw new Error(
        `[next-migration-mapping] mapping key "${key}" contains ${keyStars} wildcards, only one * is allowed`
      );
    }
    if (keyStars === 1 && valueStars !== 1) {
      throw new Error(
        `[next-migration-mapping] mapping key "${key}" has a wildcard but value "${value}" does not`
      );
    }
    if (keyStars === 0 && valueStars > 0) {
      throw new Error(
        `[next-migration-mapping] mapping value "${value}" has a wildcard but key "${key}" does not`
      );
    }

    if (keyStars === 0 && path.isAbsolute(value) && !fs.existsSync(value)) {
      console.warn(
        `[next-migration-mapping] warning: target "${value}" for "${key}" does not exist`
      );
    }
  }
}

const PREFIX = '[next-migration-mapping]';

class MigrationMappingPlugin {
  constructor({ paths, debug = false }) {
    this.classified = classifyMappings(paths);
    this.debug = debug;

    if (debug) {
      console.log(`${PREFIX} registered mappings:`);
      for (const [key, value] of Object.entries(paths)) {
        const type = key.includes('*') ? 'wildcard' : 'exact/suffix';
        console.log(`${PREFIX}   ${key} → ${value} (${type})`);
      }
    }
  }

  apply(resolver) {
    const target = resolver.ensureHook('resolve');
    const classified = this.classified;
    const debug = this.debug;

    resolver
      .getHook('described-resolve')
      .tapAsync('MigrationMappingPlugin', (request, resolveContext, callback) => {
        const moduleName = request.request;

        const match = matchMapping(moduleName, classified);

        if (!match) {
          return callback();
        }

        // Skip .d.ts targets
        if (match.target.endsWith('.d.ts')) {
          return callback();
        }

        if (debug) {
          console.log(
            `${PREFIX} mapping: ${moduleName} → ${match.target} (via ${match.pattern})`
          );
        }

        const obj = { ...request, request: match.target };

        resolver.doResolve(
          target,
          obj,
          `Aliased for migration: ${match.pattern} to ${match.target}`,
          resolveContext,
          (resolverErr, resolverResult) => {
            if (resolverErr || resolverResult === undefined) {
              console.warn(
                `${PREFIX} warning: failed to resolve "${match.target}" for mapping "${match.pattern}"`
              );
              if (debug && resolverErr) {
                console.warn(`${PREFIX}   reason: ${resolverErr.message}`);
              }
              return callback();
            }
            return callback(null, resolverResult);
          }
        );
      });
  }
}

module.exports = {
  MigrationMappingPlugin,
  classifyMappings,
  matchMapping,
  validateMappings,
};
