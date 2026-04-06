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
