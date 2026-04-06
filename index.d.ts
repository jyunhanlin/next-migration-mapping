import type { NextConfig } from 'next';

export interface MigrationMappingOptions {
  /** Import path mappings. Key is source pattern, value is target path. */
  mappings: Record<string, string>;
  /** Enable debug logging for mapping resolution. Default: false */
  debug?: boolean;
}

/**
 * Accepts either:
 * - `MigrationMappingOptions` — new API with `mappings` and optional `debug`
 * - `Record<string, string>` — legacy API, plain mapping object
 */
type MigrationMappingInput = MigrationMappingOptions | Record<string, string>;

declare function withMigrationMapping(
  options?: MigrationMappingInput
): (nextConfig?: NextConfig) => NextConfig;

export default withMigrationMapping;
