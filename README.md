# 🛠️ ServiceNow-Utils

✨ A CLI toolkit for common ServiceNow admin and developer operations using OOTB REST APIs. No extra plugins or scoped apps required! ✨

[![GitHub Package](https://img.shields.io/github/package-json/v/ImJaineel/ServiceNow-Utils?label=GitHub%20Packages&logo=github)](https://github.com/ImJaineel/SN-MCP-Server/packages)
[![NPM Package](https://img.shields.io/npm/v/servicenow-utils)](https://www.npmjs.com/package/servicenow-utils)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/any_text-Personal_Use_Only-blue?label=License&color=blue)](LICENSE)

## 📂 File Structure

```
servicenow-utils/
├── bin/
│   └── cli.js                     ← npx entry point
├── src/
│   ├── commands/
│   │   ├── bulk-update.js
│   │   ├── code-search.js
│   │   ├── deploy-updateset.js
│   │   ├── export-legacy-wf-xml.js
│   │   └── legacy-wf-search.js
│   ├── lib/
│   │   ├── client.js              ← shared HTTP client with retry/backoff
│   │   └── env.js                 ← cwd-based env loader
│   │   └── prompt.js              ← Resolves the ServiceNow instance name to use for a command
│   └── index.js                   ← programmatic API exports
├── .github/workflows/
│   ├── npm-publish.yml            ← publishes to npmjs on release
│   └── github-publish.yml        ← publishes to GitHub Packages on release
├── .env.servicenow.example
├── .gitignore
├── package-lock.json
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

## 🔐 Authentication

Create a `.env.servicenow` file in your working directory:

```bash
cp .env.servicenow.example .env.servicenow
```

```env
SN_AUTH_TYPE=basic
SN_USERNAME=your-username
SN_PASSWORD=your-password
```

Alternatively, set `SN_USERNAME` and `SN_PASSWORD` as environment variables directly.

This file holds **authentication only**. The target instance is not global — every command takes it via `-i, --instance`, and if you leave it out you'll be prompted for it interactively:

```bash
npx servicenow-utils code-search GlideRecord
# ServiceNow instance (e.g. flexdev): █
```

> **Note:** `deploy-updateset` takes two instances via `--from`/`--to` (not `-i`) but otherwise respects `SN_AUTH_TYPE` like all other commands.

---

## 🚀 Commands

Commands are grouped by what they do to your instance:

| Group | Meaning |
|-------|---------|
| 🔍 Read-only | Safe — nothing in ServiceNow is modified |
| 📤 Export | Reads from ServiceNow, writes to local disk only |
| ⚡ Actionable | Writes to ServiceNow — use with care |

---

## 🔍 Read-only

### 🔍 `code-search`

Search for a keyword across all scripts and code in your ServiceNow instance using the OOTB Code Search API.

```bash
npx servicenow-utils code-search <keyword> [-i <instance>]
```

**💡 Example:**
```bash
npx servicenow-utils code-search GlideRecord -i flexdev
```

---

### 🕵️ `legacy-wf-search`

Search for a keyword inside legacy workflow (`wf_workflow`) activities. Useful for auditing or finding workflows that reference specific values.

```bash
npx servicenow-utils legacy-wf-search <keyword> [-i <instance>]
```

**💡 Example:**
```bash
npx servicenow-utils legacy-wf-search approval -i flexdev
```

---

## ⚡ Actionable

### 🔄 `bulk-update`

Fetch records matching an encoded query and PATCH all of them with a given payload.

```bash
npx servicenow-utils bulk-update \
  --instance <instance> \
  --table <table> \
  --query <encoded_query> \
  --payload '<json>' \
  [--limit <number>] \
  [--dry-run]
```

| 🚩 Flag | ⚠️ Required | 📝 Description |
|------|----------|-------------|
| `-i, --instance` | ❌ | ServiceNow instance (prompted for if omitted) |
| `-t, --table` | ✅ | Table name (e.g. `incident`) |
| `-q, --query` | ✅ | Encoded query to filter records |
| `-p, --payload` | ✅ | JSON string of fields to update |
| `-l, --limit` | ❌ | Max records to update (default: `100`) |

**💡 Example:**
```bash
npx servicenow-utils bulk-update \
  --instance flexdev \
  --table incident \
  --query "active=true^category=software" \
  --payload '{"assigned_to":"abc123","state":"2"}' \
  --limit 50
```

---

### 🚀 `deploy-updateset`

Deploy a completed update set from one instance to another using the OOTB CI/CD API: validate the update set is complete → retrieve on the target (auto-preview + cleanup) → commit. This is a scripted equivalent of manually retrieving and committing a remote update set in the UI.

Credentials come from `.env.servicenow` and are used against **both** instances via the shared auth layer — `SN_AUTH_TYPE` is respected, so `basic`, `oauth2` (password / client_credentials / jwt-bearer) all work. The target instance must already have an active `sys_update_set_source` pointing at the origin.

```bash
npx servicenow-utils deploy-updateset \
  --update-set <sys_id> \
  --from <origin_instance> \
  --to <target_instance> \
  [--dry-run]
```

| 🚩 Flag | ⚠️ Required | 📝 Description |
|------|----------|-------------|
| `-u, --update-set` | ✅ | sys_id of the update set on the origin instance |
| `-f, --from` | ✅ | Origin instance name, e.g. `flexdev` |
| `-t, --to` | ✅ | Target instance name, e.g. `flextest` |
| `-d, --dry-run` | ❌ | Retrieve + preview only, skip commit |
| `-c, --cleanup-retrieved` | ❌ | Delete previously retrieved copies before retrieving |

**💡 Example:**
```bash
npx servicenow-utils deploy-updateset \
  --update-set a1b2c3d4e5f6... \
  --from flexdev \
  --to flextest
```

---

## 📤 Export

### 📤 `export-legacy-wf-xml`

Export the published legacy workflow XML for one or more catalog items. Files are saved locally as `sr<n>-<catalog>-<workflow>.xml`.

```bash
npx servicenow-utils export-legacy-wf-xml \
  --instance <instance> \
  --sys-id "<sys_id>" \
  [--sys-id "<another_sys_id>"] \
  [--out-dir <path>]
```

| 🚩 Flag | ⚠️ Required | 📝 Description |
|------|----------|-------------|
| `-i, --instance` | ❌ | ServiceNow instance (prompted for if omitted) |
| `-s, --sys-id` | ✅ | Catalog item sys_id(s) to export (repeatable) |
| `-o, --out-dir` | ❌ | Directory to save XML files (default: cwd) |

**💡 Example:**
```bash
npx servicenow-utils export-legacy-wf-xml \
  --instance flexdev \
  --sys-id "a1b2c3d4e5f6..." \
  --sys-id "f6e5d4c3b2a1..." \
  --out-dir ./exports
```

---

## 💻 Programmatic Usage

All commands are also available as importable functions:

```js
import {
  codeSearch,
  legacyWFSearch,
  bulkUpdate,
  exportWFXml,
  deployUpdateSet,
  loadEnv,
  createClient,
} from 'servicenow-utils';

// Load credentials first
loadEnv();

// Then call any function — the instance is always an explicit argument now,
// there's no global SN_INSTANCE to fall back to
const results = await codeSearch('GlideRecord', 'flexdev');
const workflows = await legacyWFSearch('approval', 'flexdev');
const deploy = await deployUpdateSet({
  updateSetId: 'a1b2c3d4e5f6...',
  from: 'flexdev',
  to: 'flextest',
});
```

---

## 🌐 Publishing

Both GitHub Actions workflows trigger automatically on a **published GitHub Release**, and can also be run manually via `workflow_dispatch`.

| ⚙️ Workflow | 📦 Registry | 🏷️ Package name |
|----------|----------|--------------|
| `npm-publish.yml` | [npmjs.com](https://www.npmjs.com) | `servicenow-utils` |
| `github-publish.yml` | GitHub Packages | `@<owner>/servicenow-utils` |

For npm publishing, add your `NPM_TOKEN` as a repository secret. GitHub Packages uses the built-in `GITHUB_TOKEN` automatically.

---

## ✅ Requirements

- 🟢 Node.js >= 22
- ☁️ ServiceNow instance with REST API access
- 🔑 User with sufficient permissions for the operations you intend to run

## 📜 License

See [LICENSE](LICENSE) for details.