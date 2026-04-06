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
