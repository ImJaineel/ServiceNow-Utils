# 🛠️ ServiceNow-Utils

✨ A CLI toolkit for common ServiceNow admin and developer operations using OOTB REST APIs. No extra plugins or scoped apps required! ✨

[![NPM Package](https://img.shields.io/npm/v/servicenow-utils)](https://www.npmjs.com/package/servicenow-utils)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/any_text-Personal_Use_Only-blue?label=License&color=blue)](LICENSE)

## 📂 File Structure

```
servicenow-utils/
├── bin/
│   └── cli.js                       ← npx entry point
├── src/
│   ├── commands/
│   │   ├── bulk-update.js
│   │   ├── code-search.js
│   │   ├── export-legacy-wf-xml.js
│   │   └── legacy-wf-search.js
│   ├── lib/
│   │   ├── client.js                ← shared HTTP client (retry, backoff, timeouts)
│   │   └── env.js                   ← .env.servicenow loader & validation
│   ├── index.js                     ← programmatic API exports
│   └── index.d.ts                   ← TypeScript type declarations
├── test/
│   ├── client.test.js
│   └── env.test.js
├── .github/workflows/
│   ├── npm-publish.yml              ← publishes to npmjs on release
│   └── github-publish.yml          ← publishes to GitHub Packages on release
├── .env.servicenow.example
├── .gitignore
├── package.json
└── README.md
```

## 📦 Installation

```bash
# Run directly with npx (no install needed)
npx servicenow-utils <command>

# Or install globally
npm install -g servicenow-utils
```

> **Note:** If you see `Permission denied` after cloning, run:
> ```bash
> chmod +x bin/cli.js
> ```

---

## 🔐 Authentication

Copy the example file and fill in your credentials:

```bash
cp .env.servicenow.example .env.servicenow
```

### Basic auth

```env
SN_INSTANCE=your-instance-name
SN_AUTH_TYPE=basic
SN_USERNAME=admin
SN_PASSWORD=your-password
```

### OAuth 2.0

```env
SN_INSTANCE=your-instance-name
SN_AUTH_TYPE=oauth2
SN_CLIENT_ID=your-client-id
SN_CLIENT_SECRET=your-client-secret

# Grant type: 'password' | 'client_credentials' | 'jwt-bearer'
SN_GRANT_TYPE=password

# Required for grant_type=password
SN_USERNAME=admin
SN_PASSWORD=your-password

# Required for grant_type=jwt-bearer only
# SN_JWT_ASSERTION=your-jwt-assertion
```

OAuth2 tokens are cached locally in `.sn-token.json` (owner-read only, `0600`) and reused until they expire. The cache is automatically cleared on 401 responses so the next request re-authenticates.

Alternatively, all variables can be exported as regular shell environment variables — the `.env.servicenow` file is optional.

---

## 🚀 Commands

### 🔍 `code-search`

Search for a keyword across all scripts and code in your ServiceNow instance using the OOTB Code Search API.

```bash
npx servicenow-utils code-search <keyword>
```

**Example:**
```bash
npx servicenow-utils code-search GlideRecord
```

Output is a JSON object grouped by record type, with each matching record listed under its type.

---

### 🕵️ `legacy-wf-search`

Search for a keyword inside legacy workflow (`wf_workflow`) activities. Useful for auditing or finding workflows that reference specific field values, script snippets, or user sys_ids.

```bash
npx servicenow-utils legacy-wf-search <keyword>
```

**Example:**
```bash
npx servicenow-utils legacy-wf-search approval
```

Output is a JSON object mapping each matching workflow name to the list of activity names that contain the keyword.

> **Note:** Results are capped at 1,000 variable value matches. If you see a warning about the cap being reached, narrow your keyword.

---

### 🔄 `bulk-update`

Fetch all records matching an encoded query and PATCH each one with a given payload. Supports a dry-run mode to preview which records would be affected before committing changes.

```bash
npx servicenow-utils bulk-update \
  --table <table> \
  --query <encoded_query> \
  --payload '<json>' \
  [--limit <number>] \
  [--dry-run]
```

| Flag | Required | Description |
|------|----------|-------------|
| `-t, --table` | ✅ | Table name (e.g. `incident`) |
| `-q, --query` | ✅ | Encoded query to filter records |
| `-p, --payload` | ✅ | JSON string of fields to update |
| `-l, --limit` | ❌ | Max records to update (default: `100`) |
| `-d, --dry-run` | ❌ | Preview records without applying changes |

**Example:**
```bash
npx servicenow-utils bulk-update \
  --table incident \
  --query "active=true^category=software" \
  --payload '{"assigned_to":"abc123","state":"2"}' \
  --limit 50
```

**Dry run first:**
```bash
npx servicenow-utils bulk-update \
  --table incident \
  --query "active=true^category=software" \
  --payload '{"state":"2"}' \
  --dry-run
```

> **Warning:** If the result count equals your `--limit`, there may be additional matching records that were not processed. Increase `--limit` or narrow your query.

---

### 📤 `export-legacy-wf-xml`

Export the published legacy workflow XML for one or more catalog items. Files are saved as `sr<n>-<catalog-item>-<workflow-version>.xml`.

```bash
npx servicenow-utils export-legacy-wf-xml \
  --sys-id "<sys_id>" \
  [--sys-id "<another_sys_id>"] \
  [--out-dir <path>]
```

| Flag | Required | Description |
|------|----------|-------------|
| `-s, --sys-id` | ✅ | Catalog item `sys_id` to export (repeatable) |
| `-o, --out-dir` | ❌ | Directory to save XML files (default: cwd) |

**Example:**
```bash
npx servicenow-utils export-legacy-wf-xml \
  --sys-id "a1b2c3d4e5f67890a1b2c3d4e5f67890" \
  --sys-id "f6e5d4c3b2a10987f6e5d4c3b2a10987" \
  --out-dir ./exports
```

Catalog items with no legacy workflow attached, or no published workflow version, are skipped with a warning.

---

## 💻 Programmatic Usage

All commands are available as importable functions. TypeScript types are included via `src/index.d.ts`.

```js
import {
  codeSearch,
  legacyWFSearch,
  bulkUpdate,
  exportLegacyWFXml,
  loadEnv,
  createClient,
} from 'servicenow-utils';

// Load credentials from .env.servicenow (or shell env vars)
loadEnv();

// Code search
const results = await codeSearch('GlideRecord');

// Legacy workflow search
const workflows = await legacyWFSearch('approval');

// Bulk update
const { updated, failed } = await bulkUpdate({
  table: 'incident',
  query: 'active=true^category=software',
  payload: { state: '2' },
  limit: 50,
  dryRun: false,
});

// Export workflow XML
const { exported, skipped } = await exportLegacyWFXml({
  sysIds: ['a1b2c3d4e5f67890a1b2c3d4e5f67890'],
  outDir: './exports',
});
```

### Using `createClient` directly

```js
import { createClient, loadEnv } from 'servicenow-utils';

loadEnv();
const client = createClient();

// GET
const { status, data } = await client.get('/api/now/table/incident?sysparm_limit=5');

// PATCH
await client.patch('/api/now/table/incident/<sys_id>', { state: '2' });

// PUT, POST, DELETE also available
await client.put('/api/now/table/incident/<sys_id>', { ... });
await client.delete('/api/now/table/incident/<sys_id>');
```

---

## 🌐 Publishing

Both workflows trigger automatically on a **published GitHub Release** and can also be run manually via `workflow_dispatch`. Both run the full test suite before publishing — a failing test blocks the release.

| Workflow | Registry | Package name |
|----------|----------|--------------|
| `npm-publish.yml` | [npmjs.com](https://www.npmjs.com) | `servicenow-utils` |
| `github-publish.yml` | GitHub Packages | `@<owner>/servicenow-utils` |

For npm publishing, add your `NPM_TOKEN` as a repository secret. GitHub Packages uses the built-in `GITHUB_TOKEN` automatically.

---

## ✅ Requirements

- Node.js >= 22
- A ServiceNow instance with REST API access
- A user account with sufficient permissions for the operations you intend to run

## 📜 License

See [LICENSE](LICENSE) for details.