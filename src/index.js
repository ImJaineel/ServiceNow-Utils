/**
 * servicenow-utils — Programmatic API
 *
 * Usage:
 *   import { codeSearch, legacyWFSearch, bulkUpdate, exportLegacyWFXml } from 'servicenow-utils';
 *
 * Credentials (SN_AUTH_TYPE + auth-specific vars) are read from environment
 * variables or a .env.servicenow file via loadEnv(). The target instance is
 * NOT part of that config — pass it explicitly to each function call.
 */

export { codeSearch }     from './commands/code-search.js';
export { legacyWFSearch } from './commands/legacy-wf-search.js';
export { bulkUpdate }     from './commands/bulk-update.js';
export { exportLegacyWFXml } from './commands/export-legacy-wf-xml.js';
export { deployUpdateSet } from './commands/deploy-updateset.js';
export { loadEnv }        from './lib/env.js';
export { createClient }   from './lib/client.js';
