# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**next-migration-mapping** is an npm package that provides a Next.js webpack plugin for mapping module imports during incremental migrations. It solves the limitation that webpack's `resolve.alias` only maps between node_modules packages — this plugin lets you map any import path (including your own files) to a different implementation.

Current version: 1.0.0-rc.1 (pre-release on `rc` branch).

## Architecture

Two-file design with no production dependencies:

- **index.js** — Next.js config wrapper using the curried `withX(options)(nextConfig)` plugin pattern. Injects `MigrationMappingPlugin` into webpack's resolver plugins.
- **migration-mapping.js** — Webpack resolver plugin (`MigrationMappingPlugin`) that hooks into `described-resolve` to intercept and redirect module resolution. Based on TypeScript/Next.js `jsconfig-paths-plugin`. Matches import paths by exact match, wildcard pattern (`*`), or suffix, with explicit priority order. Skips `.d.ts` files, and delegates unmatched requests back to webpack's resolver chain.

## Development

No build step — plain CommonJS JavaScript, published directly to npm.

### Install dependencies

```sh
npm install
```

### Commit conventions

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, etc.). Enforced by commitlint via a husky `commit-msg` hook.

### Release process

Fully automated via semantic-release on CI (GitHub Actions):
- Push to `main` → production npm release
- Push to `rc` → pre-release with rc tag
- Version, changelog, npm publish, and GitHub release are all handled automatically
- No manual version bumps or publish commands needed

### Testing

Tests use Node.js built-in test runner (`node:test` + `node:assert`). Integration tests use `enhanced-resolve` (devDependency) for real webpack resolver pipeline testing.

```sh
npm test
```
