/**
 * Tests for src/lib/client.js (issue #22)
 * Run with: node --test test/client.test.js
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

let savedEnv;
beforeEach(() => { savedEnv = { ...process.env }; });
afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in savedEnv)) delete process.env[k];
  }
  Object.assign(process.env, savedEnv);
});

describe('createClient — instance validation', () => {
  it('throws on invalid SN_INSTANCE', async () => {
    process.env.SN_INSTANCE = 'bad instance!';
    process.env.SN_AUTH_TYPE = 'basic';
    const { createClient } = await import('../src/lib/client.js');
    assert.throws(
      () => createClient(),
      /Invalid SN_INSTANCE/
    );
  });

  it('throws on empty SN_INSTANCE', async () => {
    process.env.SN_INSTANCE = '';
    process.env.SN_AUTH_TYPE = 'basic';
    const { createClient } = await import('../src/lib/client.js');
    assert.throws(
      () => createClient(),
      /Invalid SN_INSTANCE/
    );
  });

  it('accepts a valid SN_INSTANCE and returns correct baseUrl', async () => {
    process.env.SN_INSTANCE = 'dev99999';
    process.env.SN_AUTH_TYPE = 'basic';
    process.env.SN_USERNAME = 'admin';
    process.env.SN_PASSWORD = 'pass';
    const { createClient } = await import('../src/lib/client.js');
    const client = createClient();
    assert.equal(client.baseUrl, 'https://dev99999.service-now.com');
  });

  it('exposes put and delete methods', async () => {
    process.env.SN_INSTANCE = 'dev99999';
    process.env.SN_AUTH_TYPE = 'basic';
    process.env.SN_USERNAME = 'admin';
    process.env.SN_PASSWORD = 'pass';
    const { createClient } = await import('../src/lib/client.js');
    const client = createClient();
    assert.equal(typeof client.put, 'function');
    assert.equal(typeof client.delete, 'function');
  });
});

describe('createClient — basic auth header', () => {
  it('builds a correct Basic auth header', async () => {
    process.env.SN_INSTANCE = 'dev99999';
    process.env.SN_AUTH_TYPE = 'basic';
    process.env.SN_USERNAME = 'admin';
    process.env.SN_PASSWORD = 'secret';
    const { createClient } = await import('../src/lib/client.js');
    const client = createClient();
    const header = await client.getAuthHeader();
    const expected = 'Basic ' + Buffer.from('admin:secret').toString('base64');
    assert.equal(header, expected);
  });
});
