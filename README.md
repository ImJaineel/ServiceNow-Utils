# 🛠️ ServiceNow-Utils

✨ A CLI toolkit for common ServiceNow admin and developer operations using OOTB REST APIs. No extra plugins or scoped apps required! ✨

<!-- [![GitHub Package](https://img.shields.io/github/package-json/v/ImJaineel/SN-MCP-Server?label=GitHub%20Packages&logo=github)](https://github.com/ImJaineel/SN-MCP-Server/packages) -->
<!-- [![NPM Package](https://img.shields.io/npm/v/@imjaineel-dev/sn-mcp-server)](https://www.npmjs.com/package/servicenow-utils) -->
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/any_text-Personal_Use_Only-blue?label=License&color=blue)](LICENSE)

## 📂 File Structure

```
servicenow-utils/
├── bin/
│   └── cli.js                     ← npx entry point
├── src/
│   ├── commands/
│   │   ├── code-search.js
│   │   ├── legacy-wf-search.js    ← renamed from wf-search
│   │   ├── bulk-update.js
│   │   ├── export-legacy-wf-xml.js
│   │   └── reset-password.js
│   ├── lib/
│   │   ├── client.js              ← shared HTTP client with retry/backoff
│   │   └── env.js                 ← cwd-based env loader
│   └── index.js                   ← programmatic API exports
├── .github/workflows/
│   ├── npm-publish.yml            ← publishes to npmjs on release
│   └── github-publish.yml        ← publishes to GitHub Packages on release
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

## 🔐 Authentication

Create a `.env.servicenow` file in your working directory:

```bash
cp .env.servicenow.example .env.servicenow
```

```env
SN_INSTANCE=your-instance-name
SN_USERNAME=your-username
SN_PASSWORD=your-password
```

Alternatively, set `SN_INSTANCE`, `SN_USERNAME`, and `SN_PASSWORD` as environment variables directly.

---

## 🚀 Commands

### 🔍 `code-search`

Search for a keyword across all scripts and code in your ServiceNow instance using the OOTB Code Search API.

```bash
npx servicenow-utils code-search <keyword>
```

**💡 Example:**
```bash
npx servicenow-utils code-search GlideRecord
```

---

### 🕵️ `legacy-wf-search`

Search for a keyword inside legacy workflow (`wf_workflow`) activities. Useful for auditing or finding workflows that reference specific values.

```bash
npx servicenow-utils legacy-wf-search <keyword>
```

**💡 Example:**
```bash
npx servicenow-utils legacy-wf-search approval
```

---

### 🔄 `bulk-update`

Fetch records matching an encoded query and PATCH all of them with a given payload.

```bash
npx servicenow-utils bulk-update \
  --table <table> \
  --query <encoded_query> \
  --payload '<json>' \
  [--limit <number>] \
  [--dry-run]
```

| 🚩 Flag | ⚠️ Required | 📝 Description |
|------|----------|-------------|
| `-t, --table` | ✅ | Table name (e.g. `incident`) |
| `-q, --query` | ✅ | Encoded query to filter records |
| `-p, --payload` | ✅ | JSON string of fields to update |
| `-l, --limit` | ❌ | Max records to update (default: `100`) |

**💡 Example:**
```bash
npx servicenow-utils bulk-update \
  --table incident \
  --query "active=true^category=software" \
  --payload '{"assigned_to":"abc123","state":"2"}' \
  --limit 50
```

---

### 📤 `export-legacy-wf-xml`

Export the published legacy workflow XML for one or more catalog items. Files are saved locally as `sr<n>-<catalog>-<workflow>.xml`.

```bash
npx servicenow-utils export-legacy-wf-xml \
  --sys-id "<sys_id>" \
  [--sys-id "<another_sys_id>"] \
  [--out-dir <path>]
```

| 🚩 Flag | ⚠️ Required | 📝 Description |
|------|----------|-------------|
| `-s, --sys-id` | ✅ | Catalog item sys_id(s) to export (repeatable) |
| `-o, --out-dir` | ❌ | Directory to save XML files (default: cwd) |

**💡 Example:**
```bash
npx servicenow-utils export-legacy-wf-xml \
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
  loadEnv,
  createClient,
} from 'servicenow-utils';

// Load credentials first
loadEnv();

// Then call any function
const results = await codeSearch('GlideRecord');
const workflows = await legacyWFSearch('approval');
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