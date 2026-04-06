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
