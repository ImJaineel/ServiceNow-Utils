import https from 'https';
import fs from 'fs';
import path from 'path';

const MAX_RETRIES = 5;
const INITIAL_DELAY = 500;
const REQUEST_TIMEOUT_MS = 30000;

// Validates that SN_INSTANCE is a safe hostname segment (issue #7)
const INSTANCE_RE = /^[a-zA-Z0-9-]+$/;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates a configured ServiceNow API client.
 */
export function createClient() {
  const TOKEN_CACHE_FILE = path.join(process.cwd(), '.sn-token.json');

  const instance = process.env.SN_INSTANCE;

  if (!INSTANCE_RE.test(instance)) {
    throw new Error(
      `Invalid SN_INSTANCE value "${instance}". ` +
      'Must contain only alphanumeric characters and hyphens.'
    );
  }

  const baseUrl = `https://${instance}.service-now.com`;

  let cachedAuthHeader = null;

  /**
   * Clears the in-memory auth header cache so the next request re-authenticates.
   * Called automatically when a 401 is received (issue #5).
   */
  function clearAuthCache() {
    cachedAuthHeader = null;
    // Also remove the on-disk token cache so OAuth2 re-fetches a fresh token
    try {
      if (fs.existsSync(TOKEN_CACHE_FILE)) fs.unlinkSync(TOKEN_CACHE_FILE);
    } catch {
      // Best-effort; ignore errors
    }
  }

  /**
   * Fetches an OAuth token and caches it.
   */
  function fetchOAuthToken(paramsString) {
    return new Promise((resolve, reject) => {
      const url = `${baseUrl}/oauth_token.do`;
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
          try {
            const data = JSON.parse(raw);
            if (data.error) {
              return reject(new Error(`OAuth Error: ${data.error_description || data.error}`));
            }
            resolve(data);
          } catch (e) {
            reject(new Error(`Failed to parse OAuth response: ${e.message}`));
          }
        });
      });

      // Timeout guard (issue #12)
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error(`OAuth token request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
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
    if (cachedAuthHeader) return cachedAuthHeader;

    const authType = process.env.SN_AUTH_TYPE?.toLowerCase();

    if (authType === 'basic') {
      const username = process.env.SN_USERNAME;
      const password = process.env.SN_PASSWORD;
      cachedAuthHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
      return cachedAuthHeader;
    }

    if (authType === 'oauth2') {
      // Try loading a valid token from the local cache file first
      if (fs.existsSync(TOKEN_CACHE_FILE)) {
        try {
          const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
          // Ensure token exists and isn't expiring within the next 60 seconds
          if (cached.access_token && cached.expires_at > Date.now() + 60000) {
            cachedAuthHeader = `Bearer ${cached.access_token}`;
            return cachedAuthHeader;
          }
        } catch {
          // Ignore cache read/parse errors, proceed to fetch a new token
        }
      }

      const grantType = process.env.SN_GRANT_TYPE?.toLowerCase();
      const params = new URLSearchParams();
      params.append('client_id', process.env.SN_CLIENT_ID);
      params.append('client_secret', process.env.SN_CLIENT_SECRET);

      if (grantType === 'password') {
        params.append('grant_type', 'password');
        params.append('username', process.env.SN_USERNAME);
        params.append('password', process.env.SN_PASSWORD);
      } else if (grantType === 'client_credentials') {
        params.append('grant_type', 'client_credentials');
      } else if (grantType === 'jwt-bearer' || grantType === 'urn:ietf:params:oauth:grant-type:jwt-bearer') {
        params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        params.append('assertion', process.env.SN_JWT_ASSERTION);
      } else {
        throw new Error(`Unsupported SN_GRANT_TYPE: ${grantType}`);
      }

      const tokenData = await fetchOAuthToken(params.toString());
      cachedAuthHeader = `Bearer ${tokenData.access_token}`;

      // Save the newly fetched token to the local cache file.
      // Write with mode 0o600 so only the owner can read it (issue #6).
      try {
        const expires_at = Date.now() + ((tokenData.expires_in || 1800) * 1000);
        fs.writeFileSync(
          TOKEN_CACHE_FILE,
          JSON.stringify({ access_token: tokenData.access_token, expires_at }, null, 2),
          { encoding: 'utf8', mode: 0o600 }
        );
      } catch (e) {
        console.warn('[Warn] Failed to write token cache file:', e.message);
      }

      return cachedAuthHeader;
    }

    throw new Error('Invalid or missing SN_AUTH_TYPE. Must be "basic" or "oauth2"');
  }

  /**
   * Makes an HTTPS request to the ServiceNow instance.
   * @param {string} method     - HTTP method (GET, PATCH, POST, PUT, DELETE, etc.)
   * @param {string} urlPath    - URL path (e.g. /api/now/table/incident)
   * @param {object} [body]     - Optional request body for PATCH/POST/PUT
   * @param {number} [retries]  - Internal retry counter
   * @returns {Promise<{status: number, data: any}>}
   */
  async function request(method, urlPath, body = null, retries = 0) {
    const authHeader = await getAuthHeader();
    return new Promise((resolve, reject) => {
      const url = `${baseUrl}${urlPath}`;
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
          // Clear auth cache on 401 so the next call re-authenticates (issue #5)
          if (res.statusCode === 401) {
            clearAuthCache();
            return reject(new Error('Unauthorized (401). Credentials may be invalid or expired.'));
          }

          // Retry on rate limiting and transient server errors (issue #11)
          if (res.statusCode === 429 || res.statusCode >= 500) {
            if (retries < MAX_RETRIES) {
              const wait = INITIAL_DELAY * 2 ** retries;
              const reason = res.statusCode === 429 ? 'Rate limited (429)' : `Server error (${res.statusCode})`;
              console.warn(`[Warn] ${reason}. Retrying in ${wait / 1000}s...`);
              await delay(wait);
              return resolve(request(method, urlPath, body, retries + 1));
            } else {
              return reject(new Error(`Request failed with status ${res.statusCode}. Max retries reached.`));
            }
          }

          try {
            const data = raw ? JSON.parse(raw) : null;
            resolve({ status: res.statusCode, data });
          } catch (e) {
            reject(new Error(`Failed to parse response JSON: ${e.message}`));
          }
        });
      });

      // Timeout guard (issue #12)
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${method} ${urlPath}`));
      });

      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Convenience wrappers.
   * Includes put and delete for full Table API coverage (issue #17).
   */
  return {
    get:    (urlPath)        => request('GET',    urlPath),
    post:   (urlPath, body)  => request('POST',   urlPath, body),
    patch:  (urlPath, body)  => request('PATCH',  urlPath, body),
    put:    (urlPath, body)  => request('PUT',    urlPath, body),
    delete: (urlPath)        => request('DELETE', urlPath),
    getAuthHeader,
    baseUrl,
  };
}
