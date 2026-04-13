import https from 'https';
import fs from 'fs';
import path from 'path';

const MAX_RETRIES = 5;
const INITIAL_DELAY = 500;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates a configured ServiceNow API client.
 */
export function createClient() {
  const TOKEN_CACHE_FILE = path.join(process.cwd(), '.sn-token.json');

  const instance = process.env.SN_INSTANCE;

  const baseUrl = `https://${instance}.service-now.com`;

  let cachedAuthHeader = null;

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
        } catch (e) {
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

      // Save the newly fetched token to the local cache file
      try {
        const expires_at = Date.now() + ((tokenData.expires_in || 1800) * 1000);
        fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({
          access_token: tokenData.access_token,
          expires_at
        }, null, 2), 'utf8');
      } catch (e) {
        console.warn('[Warn] Failed to write token cache file:', e.message);
      }

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
