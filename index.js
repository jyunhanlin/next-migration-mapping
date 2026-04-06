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
