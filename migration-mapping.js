/**
 * This webpack resolver is largely based on TypeScript's "paths" handling
 * The TypeScript license can be found here:
 * https://github.com/microsoft/TypeScript/blob/214df64e287804577afa1fea0184c18c40f7d1ca/LICENSE.txt
 *
 * refer to: https://github.com/vercel/next.js/blob/canary/packages/next/build/webpack/plugins/jsconfig-paths-plugin.ts
 */

function matchPatternOrExact(patternStrings, candidate) {
  for (const patternString of patternStrings) {
    if (patternString === candidate) {
      // pattern was matched as is - no need to search further
      return patternString;
    } else if (candidate.endsWith(patternString)) {
      return patternString;
    }
  }
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
};
