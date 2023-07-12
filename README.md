# next-migration-mapping

Map your own implementation when applying incremental migration

## Why

The webpack resolve alias allow use to map node_modules packages to others node_modules packages.
But it does not allow us to map our own legacy implementation to another new implementation

## When

When applying incremental migration, we want to reuse the code.
We can implement some component or some library with Next.js API, so the legacy code can reuse on both legacy codebase and the Next.js codebase.

## How

### Install

### Usage

```js
// next.config.js
const path = require('path');

const withMigrationMapping = require('next-migration-mapping');
module.exports = withMigrationMapping({
  'existedComponentA.jsx': path.resolve(__dirname, 'path/newComponentA.jsx'),
  thirdPartyPackage: path.resolve(__dirname, 'path/ownImplementation.js'),
})({});
```
