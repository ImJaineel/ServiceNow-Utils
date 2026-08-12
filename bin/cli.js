#!/usr/bin/env node

import { parseArgs }         from 'node:util';
import { readFileSync }      from 'node:fs';
import { loadEnv }           from '../src/lib/env.js';
import { resolveInstance }   from '../src/lib/prompt.js';

// Load .env.servicenow from cwd before any command runs
loadEnv();

const args = process.argv.slice(2);
const command = args[0];

const COMMAND_HELP = {
  'code-search': `
Usage: servicenow-utils code-search <keyword> [-i <instance>]

Search for a keyword across all scripts and code.

Options:
  -i, --instance <name>   ServiceNow instance (prompted for if omitted)
  `,
  'legacy-wf-search': `
Usage: servicenow-utils legacy-wf-search <keyword> [-i <instance>]

Search for a keyword inside legacy (wf_workflow) activities.

Options:
  -i, --instance <name>   ServiceNow instance (prompted for if omitted)
  `,
  'bulk-update': `
Usage: servicenow-utils bulk-update [options]

Fetch records matching a query and PATCH all of them with a given payload.

Options:
  -i, --instance <name>   ServiceNow instance (prompted for if omitted)
  -t, --table <name>      ServiceNow table name (e.g. incident) [required]
  -q, --query <query>     Encoded query to filter records [required]
  -p, --payload <json>    JSON string of fields to update [required]
  -l, --limit <number>    Max number of records to update (default: 100)
  -d, --dry-run           Show records that would be updated without updating them
  `,
  'export-legacy-wf-xml': `
Usage: servicenow-utils export-legacy-wf-xml [options]

Export published legacy workflow XML.

Options:
  -i, --instance <name>   ServiceNow instance (prompted for if omitted)
  -s, --sys-id <sys_id>   Catalog item sys_id(s) to export (repeatable) [required]
  -o, --out-dir <path>    Directory to save XML files (default: cwd)
  `,
  'deploy-updateset': `
Usage: servicenow-utils deploy-updateset [options]

Deploy a completed update set from one instance to another via the OOTB
CI/CD API (validate -> retrieve/auto-preview -> commit). Credentials are
read from SN_USERNAME / SN_PASSWORD in .env.servicenow and used as Basic
Auth against both instances.

Options:
  -u, --update-set <sys_id>  Update Set sys_id on the origin instance [required]
  -f, --from <instance>      Origin instance name, e.g. flexdev [required]
  -t, --to <instance>        Target instance name, e.g. flextest [required]
  -d, --dry-run              Retrieve + preview only, skip commit
  -c, --cleanup-retrieved    Delete previously retrieved copies before retrieving
  `
};

function showHelp() {
  console.log(`
Usage: servicenow-utils <command> [options]

Every command needs a target instance: pass -i/--instance, or you'll be
prompted for it interactively.

🔍 Read-only (safe — nothing in ServiceNow is modified)
  code-search <keyword>       Search for a keyword across all scripts and code
  legacy-wf-search <keyword>  Search for a keyword inside legacy (wf_workflow) activities

📤 Export (reads from ServiceNow, writes to local disk only)
  export-legacy-wf-xml        Export published legacy workflow XML
    Options:
      -s, --sys-id <sys_id>   Catalog item sys_id(s) to export (repeatable) [required]
      -o, --out-dir <path>    Directory to save XML files (default: cwd)

⚡ Actionable (writes to ServiceNow — use with care)
  bulk-update                 Fetch records matching a query and PATCH all of them
    Options:
      -t, --table <name>      ServiceNow table name (e.g. incident) [required]
      -q, --query <query>     Encoded query to filter records [required]
      -p, --payload <json>    JSON string of fields to update [required]
      -l, --limit <number>    Max number of records to update (default: 100)
      -d, --dry-run           Show records that would be updated without updating them
  deploy-updateset             Deploy a completed update set from one instance to another
    Options:
      -u, --update-set <id>   Update Set sys_id on the origin instance [required]
      -f, --from <instance>   Origin instance name, e.g. flexdev [required]
      -t, --to <instance>     Target instance name, e.g. flextest [required]
      -d, --dry-run           Retrieve + preview only, skip commit
      -c, --cleanup-retrieved Delete previously retrieved copies before retrieving

Run 'servicenow-utils <command> --help' for full details on any command.
  `);
  process.exit(0);
}

if (args.includes('-h') || args.includes('--help')) {
  if (command && COMMAND_HELP[command]) {
    console.log(COMMAND_HELP[command]);
    process.exit(0);
  } else {
    showHelp();
  }
}

if (args.includes('-v') || args.includes('-V') || args.includes('--version')) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  console.log("v" + pkg.version);
  process.exit(0);
}

if (!command) {
  showHelp();
}

try {
  if (command === 'code-search') {
    const { values, positionals } = parseArgs({
      args,
      options: { instance: { type: 'string', short: 'i' } },
      allowPositionals: true
    });
    const keyword = positionals[1];
    if (!keyword) throw new Error("error: missing required argument 'keyword'");
    const instance = await resolveInstance(values.instance);
    const { runCodeSearch } = await import('../src/commands/code-search.js');
    await runCodeSearch(keyword, instance);
  } else if (command === 'legacy-wf-search') {
    const { values, positionals } = parseArgs({
      args,
      options: { instance: { type: 'string', short: 'i' } },
      allowPositionals: true
    });
    const keyword = positionals[1];
    if (!keyword) throw new Error("error: missing required argument 'keyword'");
    const instance = await resolveInstance(values.instance);
    const { runLegacyWFSearch } = await import('../src/commands/legacy-wf-search.js');
    await runLegacyWFSearch(keyword, instance);
  } else if (command === 'bulk-update') {
    const { values } = parseArgs({
      args,
      options: {
        instance: { type: 'string', short: 'i' },
        table: { type: 'string', short: 't' },
        query: { type: 'string', short: 'q' },
        payload: { type: 'string', short: 'p' },
        limit: { type: 'string', short: 'l', default: '100' },
        'dry-run': { type: 'boolean', short: 'd', default: false }
      },
      allowPositionals: true
    });

    if (!values.table) throw new Error("error: required option '-t, --table <table>' not specified");
    if (!values.query) throw new Error("error: required option '-q, --query <query>' not specified");
    if (!values.payload) throw new Error("error: required option '-p, --payload <json>' not specified");

    const instance = await resolveInstance(values.instance);
    const { runBulkUpdate } = await import('../src/commands/bulk-update.js');
    await runBulkUpdate({ ...values, instance, limit: parseInt(values.limit, 10), dryRun: values['dry-run'] });
  } else if (command === 'export-legacy-wf-xml') {
    const { values } = parseArgs({
      args,
      options: {
        instance: { type: 'string', short: 'i' },
        'sys-id': { type: 'string', short: 's', multiple: true },
        'out-dir': { type: 'string', short: 'o', default: process.cwd() }
      },
      allowPositionals: true
    });

    if (!values['sys-id'] || values['sys-id'].length === 0) {
      throw new Error("error: required option '-s, --sys-id <sys_id...>' not specified");
    }

    const instance = await resolveInstance(values.instance);
    const { runExportLegacyWFXml } = await import('../src/commands/export-legacy-wf-xml.js');
    await runExportLegacyWFXml({ sysIds: values['sys-id'], instance, outDir: values['out-dir'] });
  } else if (command === 'deploy-updateset') {
    const { values } = parseArgs({
      args,
      options: {
        'update-set': { type: 'string', short: 'u' },
        from: { type: 'string', short: 'f' },
        to: { type: 'string', short: 't' },
        'dry-run': { type: 'boolean', short: 'd', default: false },
        'cleanup-retrieved': { type: 'boolean', short: 'c', default: false }
      },
      allowPositionals: true
    });

    if (!values['update-set']) throw new Error("error: required option '-u, --update-set <sys_id>' not specified");
    if (!values.from) throw new Error("error: required option '-f, --from <instance>' not specified");
    if (!values.to) throw new Error("error: required option '-t, --to <instance>' not specified");

    const { runDeployUpdateSet } = await import('../src/commands/deploy-updateset.js');
    await runDeployUpdateSet({ updateSet: values['update-set'], from: values.from, to: values.to, dryRun: values['dry-run'], cleanupRetrieved: values['cleanup-retrieved'] });
  } else {
    console.error(`error: unknown command '${command}'`);
    showHelp();
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
