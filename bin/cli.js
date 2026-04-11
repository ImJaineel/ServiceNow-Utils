#!/usr/bin/env node

import { parseArgs }         from 'node:util';
import { readFileSync }      from 'node:fs';
import { loadEnv }           from '../src/lib/env.js';

// Load .env.servicenow from cwd before any command runs
loadEnv();

const args = process.argv.slice(2);
const command = args[0];

const COMMAND_HELP = {
  'code-search': `
Usage: servicenow-utils code-search <keyword>

Search for a keyword across all scripts and code.
  `,
  'legacy-wf-search': `
Usage: servicenow-utils legacy-wf-search <keyword>

Search for a keyword inside legacy (wf_workflow) activities.
  `,
  'bulk-update': `
Usage: servicenow-utils bulk-update [options]

Fetch records matching a query and PATCH all of them with a given payload.

Options:
  -t, --table <name>      ServiceNow table name (e.g. incident) [required]
  -q, --query <query>     Encoded query to filter records [required]
  -p, --payload <json>    JSON string of fields to update [required]
  -l, --limit <number>    Max number of records to update (default: 100)
  `,
  'export-legacy-wf-xml': `
Usage: servicenow-utils export-legacy-wf-xml [options]

Export published legacy workflow XML.

Options:
  -s, --sys-id <sys_id>   Catalog item sys_id(s) to export (repeatable) [required]
  -o, --out-dir <path>    Directory to save XML files (default: cwd)
  `
};

function showHelp() {
  console.log(`
Usage: servicenow-utils <command> [options]

Commands:
  code-search <keyword>       Search for a keyword across all scripts and code
  legacy-wf-search <keyword>  Search for a keyword inside legacy (wf_workflow) activities
  bulk-update                 Fetch records matching a query and PATCH all of them
    Options:
      -t, --table <name>      ServiceNow table name (e.g. incident) [required]
      -q, --query <query>     Encoded query to filter records [required]
      -p, --payload <json>    JSON string of fields to update [required]
      -l, --limit <number>    Max number of records to update (default: 100)
  export-legacy-wf-xml        Export published legacy workflow XML
    Options:
      -s, --sys-id <sys_id>   Catalog item sys_id(s) to export (repeatable) [required]
      -o, --out-dir <path>    Directory to save XML files (default: cwd)
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
    const { positionals } = parseArgs({ args, allowPositionals: true });
    const keyword = positionals[1];
    if (!keyword) throw new Error("error: missing required argument 'keyword'");
    const { runCodeSearch } = await import('../src/commands/code-search.js');
    await runCodeSearch(keyword);
  } else if (command === 'legacy-wf-search') {
    const { positionals } = parseArgs({ args, allowPositionals: true });
    const keyword = positionals[1];
    if (!keyword) throw new Error("error: missing required argument 'keyword'");
    const { runLegacyWFSearch } = await import('../src/commands/legacy-wf-search.js');
    await runLegacyWFSearch(keyword);
  } else if (command === 'bulk-update') {
    const { values } = parseArgs({
      args,
      options: {
        table: { type: 'string', short: 't' },
        query: { type: 'string', short: 'q' },
        payload: { type: 'string', short: 'p' },
        limit: { type: 'string', short: 'l', default: '100' }
      },
      allowPositionals: true
    });

    if (!values.table) throw new Error("error: required option '-t, --table <table>' not specified");
    if (!values.query) throw new Error("error: required option '-q, --query <query>' not specified");
    if (!values.payload) throw new Error("error: required option '-p, --payload <json>' not specified");

    const { runBulkUpdate } = await import('../src/commands/bulk-update.js');
    await runBulkUpdate({ ...values, limit: parseInt(values.limit, 10) });
  } else if (command === 'export-legacy-wf-xml') {
    const { values } = parseArgs({
      args,
      options: {
        'sys-id': { type: 'string', short: 's', multiple: true },
        'out-dir': { type: 'string', short: 'o', default: process.cwd() }
      },
      allowPositionals: true
    });

    if (!values['sys-id'] || values['sys-id'].length === 0) {
      throw new Error("error: required option '-s, --sys-id <sys_id...>' not specified");
    }

    const { runExportLegacyWFXml } = await import('../src/commands/export-legacy-wf-xml.js');
    await runExportLegacyWFXml({ sysIds: values['sys-id'], outDir: values['out-dir'] });
  } else {
    console.error(`error: unknown command '${command}'`);
    showHelp();
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
