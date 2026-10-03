import fs from 'node:fs';
import path from 'node:path';

const AUTH_FIELDS = {
  authType: 'SN_AUTH_TYPE',
  grantType: 'SN_GRANT_TYPE',
  username: 'SN_USERNAME',
  password: 'SN_PASSWORD',
  clientId: 'SN_CLIENT_ID',
  clientSecret: 'SN_CLIENT_SECRET',
  refreshToken: 'SN_REFRESH_TOKEN',
  authorizationCode: 'SN_AUTHORIZATION_CODE',
  redirectUri: 'SN_REDIRECT_URI',
  tokenUrl: 'SN_TOKEN_URL',
};

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    let value = (match[2] || '').trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    values[match[1]] = value;
  }
  return values;
}

function profileAuth(entry) {
  const authType = String(entry.authType || entry.auth_type || entry.auth || '').toLowerCase();
  return {
    authType,
    grantType: entry.grantType || entry.grant_type,
    username: entry.username,
    password: entry.password,
    clientId: entry.clientId || entry.client_id,
    clientSecret: entry.clientSecret || entry.client_secret,
    refreshToken: entry.refreshToken || entry.refresh_token,
    authorizationCode: entry.authorizationCode || entry.authorization_code,
    redirectUri: entry.redirectUri || entry.redirect_uri,
    tokenUrl: entry.tokenUrl || entry.token_url,
  };
}

function normalizeInstance(instance) {
  return String(instance).trim().replace(/^https?:\/\//i, '').replace(/\.service-now\.com\/?$/i, '').replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
}

function environmentAuth(instance, fileValues) {
  const prefix = instance ? `${normalizeInstance(instance)}_` : '';
  const auth = {};
  for (const [field, suffix] of Object.entries(AUTH_FIELDS)) {
    const instanceKey = prefix ? `${prefix}${suffix}` : null;
    auth[field] = (instanceKey && fileValues[instanceKey]) ?? fileValues[suffix] ??
      (instanceKey && process.env[instanceKey]) ?? process.env[suffix];
  }
  auth.authType = auth.authType?.toLowerCase();
  auth.grantType = auth.grantType?.toLowerCase();
  if (!auth.authType && prefix) return environmentAuth(null, fileValues);
  return auth;
}

function validateAuth(auth) {
  if (auth.authType === 'basic') {
    if (!auth.username || !auth.password) throw new Error('Basic auth requires username and password.');
  } else if (auth.authType === 'oauth2') {
    if (!auth.grantType || !auth.clientId || !auth.clientSecret) {
      throw new Error('OAuth 2.0 auth requires grantType, clientId, and clientSecret.');
    }
    if (!['client_credentials', 'password', 'authorization_code'].includes(auth.grantType)) {
      throw new Error(`Unsupported OAuth grant type "${auth.grantType}".`);
    }
    if (auth.grantType === 'password' && (!auth.username || !auth.password)) {
      throw new Error('OAuth password grant requires username and password.');
    }
    if (auth.grantType === 'authorization_code' && !auth.refreshToken && !auth.authorizationCode) {
      throw new Error('OAuth authorization_code grant requires a refreshToken or authorizationCode.');
    }
  } else {
    throw new Error('authType must be "basic" or "oauth2".');
  }
  return auth;
}

/** Resolve one instance's auth without writing to process.env or local files. */
export function resolveConfig({ profilePath, alias, instance, forceEnv = false, envPath = path.join(process.cwd(), '.env.servicenow') } = {}) {
  if (profilePath && !forceEnv) {
    const profile = JSON.parse(fs.readFileSync(path.resolve(profilePath), 'utf8'));
    const selectedAlias = alias || profile.default;
    const entry = profile.instances?.find((candidate) => candidate.alias === selectedAlias);
    if (!entry) throw new Error(`Profile alias "${selectedAlias || ''}" was not found.`);
    if (!entry.instance) throw new Error(`Profile alias "${selectedAlias}" is missing its instance.`);
    return { instance: entry.instance, alias: selectedAlias, auth: validateAuth(profileAuth(entry)) };
  }

  if (!instance) throw new Error('An instance is required when using environment credentials.');
  const fileValues = parseEnvFile(envPath);
  return { instance, auth: validateAuth(environmentAuth(instance, fileValues)) };
}

/** Backward-compatible SDK helper; returns resolved auth and never mutates process.env. */
export function loadEnv(options = {}) {
  return resolveConfig({ ...options, instance: options.instance || 'default' }).auth;
}
