/**
 * servicenow-utils — Programmatic API
 *
 * Usage:
 *   import { codeSearch, legacyWFSearch, bulkUpdate, exportLegacyWFXml } from 'servicenow-utils';
 *
 * SDK callers pass an auth object with each instance. `resolveConfig` and
 * `loadEnv` are available when applications explicitly want file/profile
 * resolution; neither mutates process.env.
 */

export { codeSearch }     from './commands/code-search.js';
export { legacyWFSearch } from './commands/legacy-wf-search.js';
export { bulkUpdate }     from './commands/bulk-update.js';
export { exportLegacyWFXml } from './commands/export-legacy-wf-xml.js';
export { deployUpdateSet } from './commands/deploy-updateset.js';
export { loadEnv, resolveConfig } from './lib/env.js';
export { createClient }   from './lib/client.js';
