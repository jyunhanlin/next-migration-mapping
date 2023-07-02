module.exports =
  (migrationMapping = {}) =>
  (nextConfig = {}) => {
    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        const { MigrationMappingPlugin } = require('./migration-mapping');

        config.resolve.plugins.push(
          new MigrationMappingPlugin({
            paths: migrationMapping,
          })
        );

        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, options);
        }

        return config;
      },
    });
  };
