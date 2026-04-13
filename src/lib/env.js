import fs from 'node:fs';
import path from 'node:path';

/**
 * Loads credentials for the CLI. Resolution order:
 *   1. .env.servicenow file in the current working directory
 *   2. Environment variables already set in the shell
 *
 * Hard exits if neither source provides the required variables based on auth type.
 */
export function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.servicenow');

  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
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
