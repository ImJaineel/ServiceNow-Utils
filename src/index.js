/**
 * servicenow-utils — Programmatic API
 *
 * Usage:
 *   import { codeSearch, legacyWFSearch, bulkUpdate, exportLegacyWFXml } from 'servicenow-utils';
 *
 * All functions read credentials from:
 *   Environment variables or a .env.servicenow file.
 *   Requires SN_INSTANCE, SN_AUTH_TYPE, and specific credentials based on the auth type.
 */

export { codeSearch }     from './commands/code-search.js';
export { legacyWFSearch } from './commands/legacy-wf-search.js';
export { bulkUpdate }     from './commands/bulk-update.js';
export { exportLegacyWFXml } from './commands/export-legacy-wf-xml.js';
export { loadEnv }        from './lib/env.js';
export { createClient }   from './lib/client.js';
