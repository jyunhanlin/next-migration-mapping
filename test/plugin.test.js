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
