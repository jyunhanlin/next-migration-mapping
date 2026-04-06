# next-migration-mapping Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the library for public npm release by adding wildcard matching, input validation, debug mode, TypeScript types, tests, and improved docs.

**Architecture:** Two-file design preserved (`index.js` + `migration-mapping.js`). Matching refactored to a strategy chain (exact → wildcard → suffix). New API `{ mappings, debug }` with backward compat for the plain mapping object. Tests use `node:test` + `enhanced-resolve`.

**Tech Stack:** Node.js 18+ built-in test runner, enhanced-resolve (devDep only), plain CommonJS.

---

## Task 1: Set up test infrastructure

**Files:**
- Modify: `package.json`
- Create: `test/fixtures/src/original.js`
- Create: `test/fixtures/src/components/Button.jsx`
- Create: `test/fixtures/src/components/NewButton.jsx`
- Create: `test/fixtures/src/components/Input.jsx`
- Create: `test/fixtures/legacy/components/OldButton.jsx`

- [ ] **Step 1: Install enhanced-resolve as devDependency**

Run: `npm install --save-dev enhanced-resolve`

- [ ] **Step 2: Add test script to package.json**

In `package.json`, add the `test` script:

```json
{
  "scripts": {
    "test": "node --test test/*.test.js",
    "semantic-release": "semantic-release",
    "prepare": "husky install"
  }
}
```

- [ ] **Step 3: Create test fixture files**

These files are needed for enhanced-resolve integration tests. They just need to exist — content is minimal.

`test/fixtures/src/original.js`:
```js
module.exports = 'original';
```

`test/fixtures/src/components/Button.jsx`:
```js
module.exports = 'Button';
```

`test/fixtures/src/components/NewButton.jsx`:
```js
module.exports = 'NewButton';
```

`test/fixtures/src/components/Input.jsx`:
```js
module.exports = 'Input';
```

`test/fixtures/legacy/components/OldButton.jsx`:
```js
module.exports = 'OldButton';
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json test/fixtures/
git commit -m "chore: add test infrastructure and fixture files"
```

---

## Task 2: Matching engine (TDD)

**Files:**
- Create: `test/matching.test.js`
- Modify: `migration-mapping.js`

- [ ] **Step 1: Write the matching test file**

`test/matching.test.js`:
```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyMappings, matchMapping } = require('../migration-mapping');

describe('classifyMappings', () => {
  it('puts non-wildcard keys into nonWildcard bucket', () => {
    const result = classifyMappings({
      'lodash': '/path/lodash-es',
      'Button.jsx': '/path/NewButton.jsx',
    });
    assert.deepStrictEqual(result.nonWildcard, {
      'lodash': '/path/lodash-es',
      'Button.jsx': '/path/NewButton.jsx',
    });
    assert.deepStrictEqual(result.wildcard, []);
  });

  it('puts wildcard keys into wildcard bucket with parsed prefix/suffix', () => {
    const result = classifyMappings({
      'components/*': '/new/components/*',
    });
    assert.equal(result.wildcard.length, 1);
    assert.equal(result.wildcard[0].key, 'components/*');
    assert.equal(result.wildcard[0].prefix, 'components/');
    assert.equal(result.wildcard[0].suffix, '');
    assert.equal(result.wildcard[0].target, '/new/components/*');
    assert.deepStrictEqual(result.nonWildcard, {});
  });

  it('handles mixed keys', () => {
    const result = classifyMappings({
      'lodash': '/path/lodash-es',
      'components/*': '/new/*',
    });
    assert.deepStrictEqual(result.nonWildcard, { 'lodash': '/path/lodash-es' });
    assert.equal(result.wildcard.length, 1);
  });
});

describe('matchMapping', () => {
  describe('exact match', () => {
    it('matches when module name equals key exactly', () => {
      const classified = classifyMappings({ 'lodash': '/path/lodash-es' });
      const result = matchMapping('lodash', classified);
      assert.deepStrictEqual(result, {
        pattern: 'lodash',
        target: '/path/lodash-es',
      });
    });

    it('returns null when no exact match', () => {
      const classified = classifyMappings({ 'lodash': '/path/lodash-es' });
      assert.equal(matchMapping('underscore', classified), null);
    });
  });

  describe('wildcard match', () => {
    it('matches and substitutes captured portion into target', () => {
      const classified = classifyMappings({
        'components/*': '/new/components/*',
      });
      const result = matchMapping('components/Button', classified);
      assert.deepStrictEqual(result, {
        pattern: 'components/*',
        target: '/new/components/Button',
      });
    });

    it('matches with suffix after wildcard', () => {
      const classified = classifyMappings({
        'legacy/*.util': '/new/*.util',
      });
      const result = matchMapping('legacy/date.util', classified);
      assert.deepStrictEqual(result, {
        pattern: 'legacy/*.util',
        target: '/new/date.util',
      });
    });

    it('captures nested paths through wildcard', () => {
      const classified = classifyMappings({
        'old/*': '/new/*',
      });
      const result = matchMapping('old/deep/nested/file', classified);
      assert.deepStrictEqual(result, {
        pattern: 'old/*',
        target: '/new/deep/nested/file',
      });
    });

    it('returns null when prefix does not match', () => {
      const classified = classifyMappings({
        'components/*': '/new/*',
      });
      assert.equal(matchMapping('other/Button', classified), null);
    });

    it('does not match when module is shorter than prefix+suffix', () => {
      const classified = classifyMappings({
        'a*b': '/new/a*b',
      });
      assert.equal(matchMapping('a', classified), null);
    });
  });

  describe('suffix match', () => {
    it('matches when module ends with key after a / boundary', () => {
      const classified = classifyMappings({
        'Button.jsx': '/new/Button.jsx',
      });
      const result = matchMapping('legacy/ui/Button.jsx', classified);
      assert.deepStrictEqual(result, {
        pattern: 'Button.jsx',
        target: '/new/Button.jsx',
      });
    });

    it('does not match partial suffix without / boundary', () => {
      const classified = classifyMappings({
        'on.jsx': '/new/on.jsx',
      });
      assert.equal(matchMapping('Button.jsx', classified), null);
    });

    it('returns null when suffix does not match at all', () => {
      const classified = classifyMappings({
        'Button.jsx': '/new/Button.jsx',
      });
      assert.equal(matchMapping('Input.jsx', classified), null);
    });

    it('does not match the key itself as suffix (exact match handles that)', () => {
      const classified = classifyMappings({
        'Button.jsx': '/new/Button.jsx',
      });
      // 'Button.jsx' matches via exact, not suffix
      const result = matchMapping('Button.jsx', classified);
      assert.equal(result.pattern, 'Button.jsx');
      assert.equal(result.target, '/new/Button.jsx');
    });
  });

  describe('priority', () => {
    it('exact takes precedence over wildcard', () => {
      const classified = classifyMappings({
        'components/Button': '/exact/Button',
        'components/*': '/wildcard/*',
      });
      const result = matchMapping('components/Button', classified);
      assert.equal(result.target, '/exact/Button');
    });

    it('wildcard takes precedence over suffix', () => {
      const classified = classifyMappings({
        'components/*': '/wildcard/*',
        'Button': '/suffix/Button',
      });
      const result = matchMapping('components/Button', classified);
      assert.equal(result.target, '/wildcard/Button');
    });
  });

  describe('edge cases', () => {
    it('returns null for empty mappings', () => {
      const classified = classifyMappings({});
      assert.equal(matchMapping('anything', classified), null);
    });

    it('wildcard matches empty captured string', () => {
      const classified = classifyMappings({
        'prefix/*': '/new/*',
      });
      const result = matchMapping('prefix/', classified);
      assert.deepStrictEqual(result, {
        pattern: 'prefix/*',
        target: '/new/',
      });
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `node --test test/matching.test.js`
Expected: Errors like `classifyMappings is not a function` (functions don't exist yet).

- [ ] **Step 3: Implement classifyMappings and matchMapping**

Add these functions to the top of `migration-mapping.js` (above the existing `matchPatternOrExact` function), and export them. Keep the existing code intact for now — Task 4 will wire them into the plugin.

Add to `migration-mapping.js`, replacing the old `matchPatternOrExact` function:

```js
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
```

Update the `module.exports` at the bottom of `migration-mapping.js` to:

```js
module.exports = {
  MigrationMappingPlugin,
  classifyMappings,
  matchMapping,
};
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `node --test test/matching.test.js`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add test/matching.test.js migration-mapping.js
git commit -m "feat: add matching engine with exact, wildcard, and suffix strategies"
```

---

## Task 3: Validation (TDD)

**Files:**
- Create: `test/validation.test.js`
- Modify: `migration-mapping.js`

- [ ] **Step 1: Write the validation test file**

`test/validation.test.js`:
```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateMappings } = require('../migration-mapping');

describe('validateMappings', () => {
  it('accepts valid mappings', () => {
    assert.doesNotThrow(() => {
      validateMappings({
        'lodash': '/path/to/lodash-es',
        'components/*': '/new/components/*',
      });
    });
  });

  it('throws for non-object input', () => {
    assert.throws(() => validateMappings('string'), {
      message: /must be a plain object/,
    });
    assert.throws(() => validateMappings(null), {
      message: /must be a plain object/,
    });
    assert.throws(() => validateMappings([]), {
      message: /must be a plain object/,
    });
  });

  it('throws for empty key', () => {
    assert.throws(() => validateMappings({ '': '/path' }), {
      message: /key must not be empty/,
    });
  });

  it('throws for non-string value', () => {
    assert.throws(() => validateMappings({ 'a': 123 }), {
      message: /must be a string/,
    });
    assert.throws(() => validateMappings({ 'a': null }), {
      message: /must be a string/,
    });
  });

  it('throws for multiple wildcards in key', () => {
    assert.throws(() => validateMappings({ 'a/*/b/*': '/path/*' }), {
      message: /only one \* is allowed/,
    });
  });

  it('throws when key has wildcard but value does not', () => {
    assert.throws(() => validateMappings({ 'a/*': '/path/fixed' }), {
      message: /key .* has a wildcard but value .* does not/,
    });
  });

  it('throws when value has wildcard but key does not', () => {
    assert.throws(() => validateMappings({ 'a': '/path/*' }), {
      message: /value .* has a wildcard but key .* does not/,
    });
  });

  it('warns for non-existent absolute path target (does not throw)', () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      validateMappings({ 'a': '/nonexistent/path/to/file.js' });
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('/nonexistent/path/to/file.js'));
  });

  it('does not warn for relative path targets', () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      validateMappings({ 'a': './relative/path.js' });
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(warnings.length, 0);
  });

  it('does not warn for wildcard targets (cannot check existence)', () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      validateMappings({ 'a/*': '/nonexistent/*' });
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(warnings.length, 0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `node --test test/validation.test.js`
Expected: `validateMappings is not a function`.

- [ ] **Step 3: Implement validateMappings**

Add this function to `migration-mapping.js` (after `matchMapping`, before the class):

```js
const fs = require('fs');
const path = require('path');

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
```

Update `module.exports` to include `validateMappings`:

```js
module.exports = {
  MigrationMappingPlugin,
  classifyMappings,
  matchMapping,
  validateMappings,
};
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `node --test test/validation.test.js`
Expected: All tests pass.

- [ ] **Step 5: Run all tests to check nothing broke**

Run: `node --test test/*.test.js`
Expected: All tests pass (matching + validation).

- [ ] **Step 6: Commit**

```bash
git add test/validation.test.js migration-mapping.js
git commit -m "feat: add input validation for mapping entries"
```

---

## Task 4: Refactor MigrationMappingPlugin + integration tests

**Files:**
- Modify: `migration-mapping.js`
- Create: `test/plugin.test.js`

- [ ] **Step 1: Write the plugin integration test file**

`test/plugin.test.js`:
```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CachedInputFileSystem, ResolverFactory } = require('enhanced-resolve');
const { MigrationMappingPlugin } = require('../migration-mapping');

const FIXTURES = path.join(__dirname, 'fixtures');

function createResolver(mappings, debug = false) {
  return ResolverFactory.createResolver({
    fileSystem: new CachedInputFileSystem(fs, 0),
    extensions: ['.js', '.jsx'],
    plugins: [new MigrationMappingPlugin({ paths: mappings, debug })],
  });
}

function resolve(resolver, request) {
  return new Promise((res, rej) => {
    resolver.resolve({}, FIXTURES, request, {}, (err, result) => {
      if (err) rej(err);
      else res(result);
    });
  });
}

describe('MigrationMappingPlugin integration', () => {
  it('redirects exact match to target', async () => {
    const resolver = createResolver({
      './src/original': path.join(FIXTURES, 'src/components/NewButton.jsx'),
    });

    const result = await resolve(resolver, './src/original');
    assert.equal(result, path.join(FIXTURES, 'src/components/NewButton.jsx'));
  });

  it('redirects wildcard match to expanded target', async () => {
    const resolver = createResolver({
      './legacy/components/*': path.join(FIXTURES, 'src/components/*'),
    });

    const result = await resolve(resolver, './legacy/components/Button');
    assert.equal(result, path.join(FIXTURES, 'src/components/Button.jsx'));
  });

  it('redirects suffix match to target', async () => {
    const resolver = createResolver({
      'OldButton.jsx': path.join(FIXTURES, 'src/components/NewButton.jsx'),
    });

    const result = await resolve(resolver, './legacy/components/OldButton.jsx');
    assert.equal(result, path.join(FIXTURES, 'src/components/NewButton.jsx'));
  });

  it('falls through to normal resolution when no mapping matches', async () => {
    const resolver = createResolver({
      'nonexistent': '/some/path',
    });

    const result = await resolve(resolver, './src/components/Button');
    assert.equal(result, path.join(FIXTURES, 'src/components/Button.jsx'));
  });

  it('skips .d.ts targets and falls through', async () => {
    const resolver = createResolver({
      './src/components/Button': '/some/path/types.d.ts',
    });

    // Should fall through — the .d.ts target is skipped, and the original
    // path resolves normally because the file exists
    const result = await resolve(resolver, './src/components/Button');
    assert.equal(result, path.join(FIXTURES, 'src/components/Button.jsx'));
  });

  it('falls back when mapping target does not resolve', async () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      const resolver = createResolver({
        './src/original': '/nonexistent/absolute/path.js',
      });

      // Should fall back — the original ./src/original.js should resolve
      const result = await resolve(resolver, './src/original');
      assert.equal(result, path.join(FIXTURES, 'src/original.js'));
      assert.ok(warnings.some(w => w.includes('failed to resolve')));
    } finally {
      console.warn = originalWarn;
    }
  });

  it('logs mapping info when debug is enabled', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      const resolver = createResolver(
        { './src/original': path.join(FIXTURES, 'src/components/NewButton.jsx') },
        true
      );
      await resolve(resolver, './src/original');

      assert.ok(logs.some(l => l.includes('registered mappings')));
      assert.ok(logs.some(l => l.includes('mapping:')));
    } finally {
      console.log = originalLog;
    }
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `node --test test/plugin.test.js`
Expected: Failures because `MigrationMappingPlugin` still uses the old matching logic and doesn't accept `debug`.

- [ ] **Step 3: Refactor MigrationMappingPlugin**

Replace the entire `MigrationMappingPlugin` class in `migration-mapping.js` with:

```js
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
```

Also remove the old `matchPatternOrExact` function (it's been replaced by `classifyMappings` + `matchMapping`).

- [ ] **Step 4: Run plugin tests — verify they pass**

Run: `node --test test/plugin.test.js`
Expected: All tests pass.

- [ ] **Step 5: Run all tests**

Run: `node --test test/*.test.js`
Expected: All tests pass (matching + validation + plugin).

- [ ] **Step 6: Commit**

```bash
git add migration-mapping.js test/plugin.test.js
git commit -m "feat: refactor plugin to use strategy-chain matching with debug logging"
```

---

## Task 5: Refactor config wrapper (`index.js`) + tests

**Files:**
- Modify: `index.js`
- Create: `test/wrapper.test.js`

- [ ] **Step 1: Write the wrapper test file**

`test/wrapper.test.js`:
```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { MigrationMappingPlugin } = require('../migration-mapping');
const withMigrationMapping = require('../index');

function callWebpack(nextConfigResult) {
  const config = { resolve: { plugins: [] } };
  const options = { isServer: false };
  const result = nextConfigResult.webpack(config, options);
  return { config, result };
}

describe('withMigrationMapping', () => {
  it('injects MigrationMappingPlugin into resolve.plugins', () => {
    const result = withMigrationMapping({ 'a': path.resolve('a.js') })({});
    const { config } = callWebpack(result);
    assert.equal(config.resolve.plugins.length, 1);
    assert.ok(config.resolve.plugins[0] instanceof MigrationMappingPlugin);
  });

  it('chains with existing nextConfig.webpack', () => {
    let existingCalled = false;
    const nextConfig = {
      webpack(config) {
        existingCalled = true;
        config.customField = true;
        return config;
      },
    };
    const result = withMigrationMapping({ 'a': path.resolve('a.js') })(nextConfig);
    const { config } = callWebpack(result);
    assert.ok(existingCalled);
    assert.ok(config.customField);
  });

  it('accepts new API format { mappings, debug }', () => {
    const result = withMigrationMapping({
      mappings: { 'a': path.resolve('a.js') },
      debug: false,
    })({});
    const { config } = callWebpack(result);
    assert.equal(config.resolve.plugins.length, 1);
    assert.ok(config.resolve.plugins[0] instanceof MigrationMappingPlugin);
  });

  it('accepts legacy API format (plain mapping object)', () => {
    const result = withMigrationMapping({ 'a': path.resolve('a.js') })({});
    const { config } = callWebpack(result);
    assert.equal(config.resolve.plugins.length, 1);
  });

  it('preserves other nextConfig properties', () => {
    const result = withMigrationMapping({ 'a': path.resolve('a.js') })({
      reactStrictMode: true,
      images: { domains: ['example.com'] },
    });
    assert.equal(result.reactStrictMode, true);
    assert.deepStrictEqual(result.images, { domains: ['example.com'] });
  });

  it('throws for invalid mappings', () => {
    assert.throws(
      () => withMigrationMapping({ 'a': 123 })({}),
      { message: /must be a string/ }
    );
  });

  it('works with empty options (defaults)', () => {
    const result = withMigrationMapping()({});
    assert.ok(result.webpack);
    const { config } = callWebpack(result);
    assert.equal(config.resolve.plugins.length, 1);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `node --test test/wrapper.test.js`
Expected: Failures because `index.js` still uses the old API.

- [ ] **Step 3: Rewrite index.js**

Replace the contents of `index.js` with:

```js
const { MigrationMappingPlugin, validateMappings } = require('./migration-mapping');

function parseOptions(options) {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new Error('[next-migration-mapping] options must be a plain object');
  }

  // New API: { mappings: {...}, debug: true }
  if (
    options.mappings &&
    typeof options.mappings === 'object' &&
    !Array.isArray(options.mappings)
  ) {
    return {
      mappings: options.mappings,
      debug: Boolean(options.debug),
    };
  }

  // Legacy API: plain mapping object
  return {
    mappings: options,
    debug: false,
  };
}

module.exports = (options = {}) => (nextConfig = {}) => {
  const { mappings, debug } = parseOptions(options);
  validateMappings(mappings);

  return {
    ...nextConfig,
    webpack(config, webpackOptions) {
      config.resolve.plugins.push(
        new MigrationMappingPlugin({
          paths: mappings,
          debug,
        })
      );

      if (typeof nextConfig.webpack === 'function') {
        return nextConfig.webpack(config, webpackOptions);
      }

      return config;
    },
  };
};
```

- [ ] **Step 4: Run wrapper tests — verify they pass**

Run: `node --test test/wrapper.test.js`
Expected: All tests pass.

- [ ] **Step 5: Run all tests**

Run: `node --test test/*.test.js`
Expected: All tests pass (matching + validation + plugin + wrapper).

- [ ] **Step 6: Commit**

```bash
git add index.js test/wrapper.test.js
git commit -m "feat: refactor config wrapper with new API and backward compat"
```

---

## Task 6: TypeScript type definitions

**Files:**
- Create: `index.d.ts`
- Modify: `package.json`

- [ ] **Step 1: Create index.d.ts**

`index.d.ts`:
```ts
import type { NextConfig } from 'next';

export interface MigrationMappingOptions {
  /** Import path mappings. Key is source pattern, value is target path. */
  mappings: Record<string, string>;
  /** Enable debug logging for mapping resolution. Default: false */
  debug?: boolean;
}

/**
 * Accepts either:
 * - `MigrationMappingOptions` — new API with `mappings` and optional `debug`
 * - `Record<string, string>` — legacy API, plain mapping object
 */
type MigrationMappingInput = MigrationMappingOptions | Record<string, string>;

declare function withMigrationMapping(
  options?: MigrationMappingInput
): (nextConfig?: NextConfig) => NextConfig;

export default withMigrationMapping;
```

- [ ] **Step 2: Update package.json**

Add `"types"` field and `"index.d.ts"` to `"files"` array:

```json
{
  "types": "index.d.ts",
  "files": [
    "index.js",
    "index.d.ts",
    "LICENSE",
    "migration-mapping.js",
    "package.json",
    "README.md"
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add index.d.ts package.json
git commit -m "feat: add TypeScript type definitions"
```

---

## Task 7: README improvements

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README.md**

`README.md`:
````md
# next-migration-mapping

A Next.js webpack plugin for mapping module imports during incremental migrations.

Webpack's `resolve.alias` maps between `node_modules` packages, but can't redirect your own source files. This plugin lets you map **any** import path — your own files, internal packages, third-party modules — to a different implementation.

## Install

```bash
npm install next-migration-mapping
```

## Usage

```js
// next.config.js
const path = require('path');
const withMigrationMapping = require('next-migration-mapping');

module.exports = withMigrationMapping({
  mappings: {
    // Exact match: redirect a specific import
    'legacy-utils': path.resolve(__dirname, 'src/utils/modern-utils.js'),

    // Wildcard match: redirect a group of imports
    'legacy/components/*': path.resolve(__dirname, 'src/components/*'),

    // Suffix match: redirect by filename across directories
    'OldButton.jsx': path.resolve(__dirname, 'src/components/NewButton.jsx'),
  },
  debug: false, // set to true to log mapping resolutions
})({
  // your existing Next.js config
  reactStrictMode: true,
});
```

### Legacy API

You can also pass a plain mapping object directly (without the `mappings` wrapper):

```js
module.exports = withMigrationMapping({
  'legacy-utils': path.resolve(__dirname, 'src/utils/modern-utils.js'),
})({});
```

## Matching Behavior

Mappings are evaluated in this priority order:

1. **Exact match** — the import path equals the mapping key exactly
2. **Wildcard match** — the key contains `*`; the prefix and suffix are matched, and the captured portion is substituted into the target's `*`
3. **Suffix match** — the import path ends with the key, preceded by `/` (prevents partial filename matches)

### Examples

| Mapping key | Import path | Match type | Resolved target |
|---|---|---|---|
| `lodash` | `lodash` | Exact | `/path/to/lodash-es` |
| `components/*` | `components/Button` | Wildcard | `/new/components/Button` |
| `Button.jsx` | `legacy/ui/Button.jsx` | Suffix | `/new/Button.jsx` |
| `on.jsx` | `Button.jsx` | No match | — (no `/` boundary) |

## Debug Mode

Enable debug logging to see which imports are being intercepted:

```js
withMigrationMapping({
  mappings: { ... },
  debug: true,
})({ ... });
```

This logs:
- All registered mappings at initialization
- Each import that gets redirected, with source and target
- Any mapping that fails to resolve

## Composing with other plugins

```js
const withMDX = require('@next/mdx')();
const withMigrationMapping = require('next-migration-mapping');

const nextConfig = {
  reactStrictMode: true,
};

module.exports = withMDX(
  withMigrationMapping({
    mappings: { ... },
  })(nextConfig)
);
```

## License

MIT
````

- [ ] **Step 2: Run all tests one final time**

Run: `node --test test/*.test.js`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README with complete API docs and matching behavior"
```
