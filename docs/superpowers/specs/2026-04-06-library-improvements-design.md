# next-migration-mapping Improvement Design

## Context

`next-migration-mapping` is a Next.js webpack plugin for mapping module imports during incremental migrations. Currently at `1.0.0-rc.1` (pre-release), it's a two-file, zero-dependency library.

**Goal:** Prepare the library for public npm release by improving code quality, expanding functionality, enhancing DX, and adding tests — while preserving its core value of being minimal and dependency-free at runtime.

## Constraints

- No production dependencies
- No build step — plain CommonJS
- Two-file architecture maintained (`index.js` + `migration-mapping.js`)
- Backward compatible with current API (auto-detect old vs new format)
- Node.js 18+ (required for `node:test`)

---

## 1. Matching Engine

### Current State

`matchPatternOrExact` mixes exact and suffix matching in one loop with no clear priority and no extensibility.

### New Design

A strategy chain with explicit priority order:

1. **Exact match** — key equals import path (e.g., `lodash` → `lodash-es`)
2. **Wildcard match** — key contains a single `*`, splits into prefix/suffix for matching (e.g., `components/*` matches `components/Button`, captures `Button` and fills into target's `*`)
3. **Suffix match** — import path ends with key, **and the character before the match is `/` or it matches from the start of the string**. This prevents `on.jsx` from accidentally matching `Button.jsx`. (e.g., key `Button.jsx` matches `legacy/ui/Button.jsx` but not `AnotherButton.jsx`)

**Priority rationale:** Exact is most specific, so it goes first. Wildcard is an explicit user-defined pattern and should take precedence over the implicit suffix match. Suffix is the fallback.

### Wildcard Syntax

Only a **single `*`** is supported, consistent with TypeScript `paths` behavior:

```js
withMigrationMapping({
  mappings: {
    // exact
    'lodash': path.resolve(__dirname, 'node_modules/lodash-es'),
    // wildcard
    'legacy/components/*': path.resolve(__dirname, 'src/components/*'),
    // suffix
    'Button.jsx': path.resolve(__dirname, 'src/components/NewButton.jsx'),
  }
})
```

The `*` in the key captures the remaining portion and substitutes it into the target's `*`. Both key and value must contain exactly one `*` when using wildcard — validated at initialization.

---

## 2. Validation & Error Handling

### Input Validation (at config wrapper layer, initialization time)

1. **Type check** — `options` must be a plain object. Throw otherwise.
2. **Key/Value check** — iterate each mapping entry:
   - Value must be a string. Throw otherwise.
   - Key must be non-empty. Throw otherwise.
   - If key contains `*`: must be exactly one `*`; corresponding value must also contain exactly one `*`. Throw otherwise.
3. **Target existence check** — if value is an absolute path (non-wildcard), check file existence. **`console.warn`** if not found (don't throw, since files may be generated during build).

### Runtime Error Handling (at resolver plugin layer)

- **Mapping matched but resolve fails** (e.g., wildcard-expanded path doesn't exist): `console.warn` indicating which mapping failed, then fallback to webpack's resolver chain.
- **Resolver throws an exception**: don't swallow — pass through callback to let webpack handle it.

### Debug Mode

Enabled via options:

```js
withMigrationMapping({
  mappings: { ... },
  debug: true,
})(nextConfig)
```

When enabled, logs:
- **Initialization:** all registered mappings with their match type (exact/wildcard/suffix)
- **Each resolve:** which import path was intercepted by which mapping, redirected to where
- **Resolve failure:** failure reason

---

## 3. API Change

### New API

```js
withMigrationMapping({
  mappings: { 'source': 'target' },
  debug: true,
})(nextConfig)
```

### Backward Compatibility

Since we're still in rc, this breaking change is acceptable. However, we provide auto-detection for the old API:

- If the passed object has a `mappings` key whose value is an object → new API
- Otherwise, treat the entire object as a plain mapping object (legacy API)

```js
// Both work:
withMigrationMapping({ 'source': 'target' })(nextConfig)           // legacy
withMigrationMapping({ mappings: { 'source': 'target' } })(nextConfig) // new
```

---

## 4. Config Wrapper (`index.js`)

### Changes

- Replace `Object.assign({}, nextConfig, {...})` with `{ ...nextConfig, ... }` for readability
- Structure remains the same — the curried `withX(options)(nextConfig)` pattern is correct for Next.js plugin composition
- Add parameter parsing logic (new API vs legacy detection)
- Add input validation calls

---

## 5. TypeScript Type Definitions

### New file: `index.d.ts`

```ts
import type { NextConfig } from 'next';

export interface MigrationMappingOptions {
  /** Import path mappings. Key is source pattern, value is target path. */
  mappings: Record<string, string>;
  /** Enable debug logging for mapping resolution. Default: false */
  debug?: boolean;
}

type MigrationMappingInput = MigrationMappingOptions | Record<string, string>;

declare function withMigrationMapping(
  options?: MigrationMappingInput
): (nextConfig?: NextConfig) => NextConfig;

export default withMigrationMapping;
```

### `package.json` updates

- Add `"types": "index.d.ts"`
- Add `index.d.ts` to `"files"` array

---

## 6. Testing Strategy

### Framework

Node.js built-in test runner (`node:test` + `node:assert`). Zero extra dependencies for unit tests.

### Test Structure

```
test/
  matching.test.js    — matching logic unit tests (zero deps)
  validation.test.js  — input validation unit tests (zero deps)
  plugin.test.js      — resolver plugin integration tests (real enhanced-resolve)
  wrapper.test.js     — config wrapper tests (lightweight mock)
```

### Unit Tests (zero dependencies)

**Matching logic (`test/matching.test.js`):**
- Exact match: hit and miss
- Suffix match: hit and miss, boundary check (`on.jsx` should NOT match `Button.jsx`)
- Wildcard match: hit (with correct capture/substitution) and miss
- Priority: exact > wildcard > suffix
- Edge cases: empty mapping object, `.d.ts` target skipped

**Validation (`test/validation.test.js`):**
- Valid input passes
- Non-object input throws
- Non-string value throws
- Multiple `*` in key or value throws
- Key has `*` but value doesn't (and vice versa) throws
- Non-existent absolute path target warns (doesn't throw)

### Integration Tests (real enhanced-resolve)

**Resolver plugin (`test/plugin.test.js`):**

Uses `enhanced-resolve` (devDependency) to create a real resolver pipeline:

```js
const { ResolverFactory } = require('enhanced-resolve');
const resolver = ResolverFactory.createResolver({
  fileSystem: fs,
  plugins: [new MigrationMappingPlugin({ paths: { ... } })],
});
```

- Match correctly redirects resolution
- No match falls through to normal resolution
- Resolve failure falls back with warning
- All three match types work in real resolver context

### Lightweight Mock Tests

**Config wrapper (`test/wrapper.test.js`):**
- Plugin injected into `config.resolve.plugins`
- Chains correctly with existing `nextConfig.webpack`
- New API and legacy API both parsed correctly
- Debug mode activates logging

### devDependencies Addition

- `enhanced-resolve` — webpack's resolver, for plugin integration tests

### npm script

```json
{
  "scripts": {
    "test": "node --test test/*.test.js"
  }
}
```

---

## 7. README Improvements

1. **Install section** — add `npm install next-migration-mapping`
2. **API documentation** — document both new and legacy API, `debug` option
3. **Matching behavior** — explain three match types (exact/wildcard/suffix) with priority order and examples
4. **Complete usage examples** — cover all mapping patterns
5. **Difference from `resolve.alias`** — rewrite existing "Why" section for clarity
6. **Plugin composition** — show usage alongside other Next.js plugins (e.g., `@next/mdx`)

---

## Summary of Changes

| Area | What Changes |
|---|---|
| `migration-mapping.js` | Refactor matching to strategy chain (exact → wildcard → suffix), add validation, add debug logging |
| `index.js` | Spread instead of Object.assign, new API parsing with backward compat, validation calls |
| `index.d.ts` (new) | TypeScript type definitions |
| `test/` (new) | 4 test files: matching, validation, plugin (real enhanced-resolve), wrapper |
| `package.json` | Add `types`, `test` script, `enhanced-resolve` devDep, `index.d.ts` in files |
| `README.md` | Install, API docs, matching behavior, examples, plugin composition |

### Files Modified
- `index.js`
- `migration-mapping.js`
- `package.json`
- `README.md`

### Files Created
- `index.d.ts`
- `test/matching.test.js`
- `test/validation.test.js`
- `test/plugin.test.js`
- `test/wrapper.test.js`

### No Breaking Changes at Runtime
The old `withMigrationMapping(plainObject)` API continues to work via auto-detection. The new `withMigrationMapping({ mappings, debug })` API is additive.
