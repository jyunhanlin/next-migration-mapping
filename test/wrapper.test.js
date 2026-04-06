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
