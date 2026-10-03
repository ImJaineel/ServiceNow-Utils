import https from 'https';

const MAX_RETRIES = 5;
const INITIAL_DELAY = 500;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates a configured ServiceNow API client for a specific instance.
 * @param {string} instance - Instance name, e.g. 'flexdev' (no .service-now.com suffix)
 */
export function createClient(instance, credentials) {
  if (!instance) throw new Error('An instance is required to create a ServiceNow client.');
  const instanceHost = /^https?:\/\//i.test(instance)
    ? new URL(instance).host
    : /\./.test(instance) ? instance.replace(/\/$/, '') : `${instance}.service-now.com`;
  const baseUrl = `https://${instanceHost}`;
  const auth = credentials || {
    authType: process.env.SN_AUTH_TYPE?.toLowerCase(),
    grantType: process.env.SN_GRANT_TYPE?.toLowerCase(),
    username: process.env.SN_USERNAME,
    password: process.env.SN_PASSWORD,
    clientId: process.env.SN_CLIENT_ID,
    clientSecret: process.env.SN_CLIENT_SECRET,
    refreshToken: process.env.SN_REFRESH_TOKEN,
    authorizationCode: process.env.SN_AUTHORIZATION_CODE,
    redirectUri: process.env.SN_REDIRECT_URI,
    tokenUrl: process.env.SN_TOKEN_URL,
  };
  let cachedAuthHeader = null;
  let tokenExpiresAt = 0;

  /**
   * Fetches an OAuth token and caches it.
   */
  function fetchOAuthToken(paramsString) {
    return new Promise((resolve, reject) => {
      const url = auth.tokenUrl || `${baseUrl}/oauth_token.do`;
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(paramsString),
        },
      };

      const req = https.request(url, options, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          if (res.statusCode === 401) {
            return reject(new Error('OAuth authentication failed (HTTP 401). Check the client credentials and grant configuration.'));
          }
          try {
            const data = JSON.parse(raw);
            if (data.error) {
              return reject(new Error(`OAuth authentication failed: ${data.error_description || data.error}`));
            }
            resolve(data);
          } catch (e) {
            reject(new Error(`Failed to parse OAuth response: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.write(paramsString);
      req.end();
    });
  }

  /**
   * Resolves the correct Authorization header value based on the selected Auth Type.
   */
  async function getAuthHeader() {
    if (cachedAuthHeader && (auth.authType !== 'oauth2' || tokenExpiresAt > Date.now() + 60000)) return cachedAuthHeader;

    const authType = String(auth.authType || auth.auth_type || auth.auth || '').toLowerCase();

    if (authType === 'basic') {
      const username = auth.username;
      const password = auth.password;
      if (!username || !password) throw new Error('Basic auth requires username and password.');
      cachedAuthHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
      return cachedAuthHeader;
    }

    if (authType === 'oauth2') {
      const grantType = String(auth.grantType || auth.grant_type || '').toLowerCase();
      if (!grantType || !auth.clientId || !auth.clientSecret) {
        throw new Error('OAuth 2.0 auth requires grantType, clientId, and clientSecret.');
      }
      const params = new URLSearchParams();
      params.append('client_id', auth.clientId || auth.client_id);
      params.append('client_secret', auth.clientSecret || auth.client_secret);

      if (grantType === 'password') {
        params.append('grant_type', 'password');
        params.append('username', auth.username);
        params.append('password', auth.password);
      } else if (grantType === 'client_credentials') {
        params.append('grant_type', 'client_credentials');
      } else if (grantType === 'authorization_code') {
        if (auth.refreshToken || auth.refresh_token) {
          params.append('grant_type', 'refresh_token');
          params.append('refresh_token', auth.refreshToken || auth.refresh_token);
        } else if (auth.authorizationCode || auth.authorization_code) {
          params.append('grant_type', 'authorization_code');
          params.append('code', auth.authorizationCode || auth.authorization_code);
          if (auth.redirectUri || auth.redirect_uri) params.append('redirect_uri', auth.redirectUri || auth.redirect_uri);
        } else {
          throw new Error('OAuth authorization_code grant requires a refreshToken or authorizationCode.');
        }
      } else {
        throw new Error(`Unsupported SN_GRANT_TYPE: ${grantType}`);
      }

      const tokenData = await fetchOAuthToken(params.toString());
      if (!tokenData.access_token) throw new Error('OAuth response did not contain an access_token.');
      cachedAuthHeader = `Bearer ${tokenData.access_token}`;
      tokenExpiresAt = Date.now() + ((tokenData.expires_in || 1800) * 1000);

      return cachedAuthHeader;
    }

    throw new Error('Invalid or missing SN_AUTH_TYPE. Must be "basic" or "oauth2"');
  }

  /**
   * Makes an HTTPS request to the ServiceNow instance.
   * @param {string} method - HTTP method (GET, PATCH, POST, etc.)
   * @param {string} path   - URL path (e.g. /api/now/table/incident)
   * @param {object} [body] - Optional request body for PATCH/POST
   * @param {number} [retries] - Internal retry counter
   * @returns {Promise<{status: number, data: any}>}
   */
  async function request(method, path, body = null, retries = 0) {
    const authHeader = await getAuthHeader();
    return new Promise((resolve, reject) => {
      const url = `${baseUrl}${path}`;
      const bodyStr = body ? JSON.stringify(body) : null;

      const options = {
        method,
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      };

      const req = https.request(url, options, async (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', async () => {
          // Retry on rate limiting
          if (res.statusCode === 429) {
            if (retries < MAX_RETRIES) {
              const wait = INITIAL_DELAY * 2 ** retries;
              console.warn(`[Warn] Rate limited (429). Retrying in ${wait / 1000}s...`);
              await delay(wait);
              return resolve(request(method, path, body, retries + 1));
            } else {
              return reject(new Error('Too many requests (429). Max retries reached.'));
            }
          }

          if (res.statusCode === 401) {
            return reject(new Error(`Authentication failed for ${instanceHost} (HTTP 401). Check the configured credentials.`));
          }
          if (res.statusCode === 403) {
            return reject(new Error(`Access denied for ${instanceHost} (HTTP 403). Check the account permissions.`));
          }

          try {
            const data = raw ? JSON.parse(raw) : null;
            resolve({ status: res.statusCode, data });
          } catch (e) {
            reject(new Error(`Failed to parse response JSON: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Convenience wrappers
   */
  return {
    get: (path) => request('GET', path),
    patch: (path, body) => request('PATCH', path, body),
    post: (path, body) => request('POST', path, body),
    getAuthHeader,
  };
}
