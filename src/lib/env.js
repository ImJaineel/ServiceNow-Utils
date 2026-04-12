import fs from 'node:fs';
import path from 'node:path';

/**
 * Loads credentials for the CLI. Resolution order:
 *   1. .env.servicenow file in the current working directory
 *   2. Environment variables already set in the shell
 *
 * Hard exits if neither source provides the required variables based on auth type.
 *
 * NOTE: process.loadEnvFile was introduced in Node.js 20.12.0. This package
 * requires Node >=22 (see engines in package.json), so this is always safe.
 * If you are using Node 20.0–20.11 you must upgrade to use .env.servicenow
 * file loading; shell-exported variables still work on any Node >=18.
 *
 * SECURITY NOTE: SN_JWT_ASSERTION contains a sensitive credential. Avoid
 * logging process.env or passing it to error reporters in your own tooling.
 */
export function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.servicenow');

  if (fs.existsSync(envPath)) {
    // process.loadEnvFile is available in Node >=20.12.0 / >=22.0.0 (issue #8)
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
    } else {
      // Graceful fallback for older Node versions: parse manually
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key && !(key in process.env)) process.env[key] = val;
      }
    }
  }

  const missing = [];
  const authType = process.env.SN_AUTH_TYPE?.toLowerCase();

  if (!process.env.SN_INSTANCE) missing.push('SN_INSTANCE');

  if (authType === 'basic') {
    if (!process.env.SN_USERNAME) missing.push('SN_USERNAME');
    if (!process.env.SN_PASSWORD) missing.push('SN_PASSWORD');
  } else if (authType === 'oauth2') {
    if (!process.env.SN_GRANT_TYPE) missing.push('SN_GRANT_TYPE');
    if (!process.env.SN_CLIENT_ID) missing.push('SN_CLIENT_ID');
    if (!process.env.SN_CLIENT_SECRET) missing.push('SN_CLIENT_SECRET');

    const grant = process.env.SN_GRANT_TYPE?.toLowerCase();
    if (grant === 'password') {
      if (!process.env.SN_USERNAME) missing.push('SN_USERNAME');
      if (!process.env.SN_PASSWORD) missing.push('SN_PASSWORD');
    } else if (grant === 'jwt-bearer' || grant === 'urn:ietf:params:oauth:grant-type:jwt-bearer') {
      if (!process.env.SN_JWT_ASSERTION) missing.push('SN_JWT_ASSERTION');
    }
  } else {
    missing.push('SN_AUTH_TYPE (must be "basic" or "oauth2")');
  }

  if (missing.length > 0) {
    console.error(
      '\n[Error] Missing required environment variables: ' + missing.join(', ') + '\n\n' +
      'Please provide them via a .env.servicenow file in the current directory,\n' +
      'or export them as environment variables before running the command.\n' +
      'Check .env.servicenow.example for reference.\n'
    );
    process.exit(1);
  }
}
