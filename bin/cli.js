#!/usr/bin/env node

import { parseArgs }         from 'node:util';
import { readFileSync }      from 'node:fs';
import { resolveConfig }     from '../src/lib/env.js';
import { resolveInstance }   from '../src/lib/prompt.js';

const args = process.argv.slice(2);
const command = args[0];

function splitEnvMode(inputArgs) {
  const parsedArgs = [...inputArgs];
  const envModeIndex = parsedArgs.findIndex((arg, index) =>
    arg === '--env' && (!parsedArgs[index + 1] || parsedArgs[index + 1].startsWith('-'))
  );
  if (envModeIndex === -1) return { args: parsedArgs, forceEnv: false };
  parsedArgs.splice(envModeIndex, 1);
  return { args: parsedArgs, forceEnv: true };
}

const { args: parseInput, forceEnv } = splitEnvMode(args);
const commonOptions = {
  instance: { type: 'string', short: 'i' },
  profile: { type: 'string' },
  env: { type: 'string', short: 'e' },
};

async function resolveSingleConfig(values) {
  if (values.profile && !forceEnv) {
    return resolveConfig({ profilePath: values.profile, alias: values.env });
  }
  const instance = await resolveInstance(values.instance);
  return resolveConfig({
    instance,
    forceEnv,
  });
}

const COMMAND_HELP = {
  'code-search': `
Usage: servicenow-utils code-search <keyword> [-i <instance>]

Search for a keyword across all scripts and code.

Options:
  -i, --instance <name>   ServiceNow instance in env mode
  --profile <path>        JSON profile (default alias used when -e is omitted)
  -e, --env <alias>       Profile alias; pass bare --env to force env mode
  `,
  'legacy-wf-search': `
Usage: servicenow-utils legacy-wf-search <keyword> [-i <instance>]

Search for a keyword inside legacy (wf_workflow) activities.

Options:
  -i, --instance <name>   ServiceNow instance in env mode
  --profile <path>        JSON profile (default alias used when -e is omitted)
  -e, --env <alias>       Profile alias; pass bare --env to force env mode
  `,
  'bulk-update': `
Usage: servicenow-utils bulk-update [options]

Fetch records matching a query and PATCH all of them with a given payload.

Options:
  -i, --instance <name>   ServiceNow instance in env mode
  --profile <path>        JSON profile (default alias used when -e is omitted)
  -e, --env <alias>       Profile alias; pass bare --env to force env mode
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
  -i, --instance <name>   ServiceNow instance in env mode
  --profile <path>        JSON profile (default alias used when -e is omitted)
  -e, --env <alias>       Profile alias; pass bare --env to force env mode
  -s, --sys-id <sys_id>   Catalog item sys_id(s) to export (repeatable) [required]
  -o, --out-dir <path>    Directory to save XML files (default: cwd)
  `,
  'deploy-updateset': `
Usage: servicenow-utils deploy-updateset [options]

Deploy a completed update set between instances using the OOTB CI/CD API.

Options:
  -u, --update-set <sys_id>  Update Set sys_id on the origin instance [required]
  -f, --from <instance>      Origin instance name in env mode
  -t, --to <instance>        Target instance name in env mode
  --profile <path>           JSON profile containing environment aliases
  --from-env <alias>         Source profile alias
  --to-env <alias>           Target profile alias
  --env                      Force instance-scoped environment credentials
  -d, --dry-run              Check readiness and target collision without changes
  -c, --cleanup-retrieved    Delete previously retrieved copies before retrieving
  `
};

function showHelp() {
  console.log(`
Usage: servicenow-utils <command> [options]

Use --profile with an optional -e/--env alias, or pass --env with -i/--instance
to use instance-scoped environment credentials.

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
      -f, --from <instance>   Origin instance in env mode
      -t, --to <instance>     Target instance in env mode
      --profile <path>        JSON profile; pair with --from-env and --to-env
      --from-env <alias>      Source profile alias
      --to-env <alias>        Target profile alias
      -d, --dry-run           Check readiness without changing either instance
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
      args: parseInput,
      options: commonOptions,
      allowPositionals: true
    });
    const keyword = positionals[1];
    if (!keyword) throw new Error("error: missing required argument 'keyword'");
    const { instance, auth } = await resolveSingleConfig(values);
    const { runCodeSearch } = await import('../src/commands/code-search.js');
    await runCodeSearch(keyword, instance, auth);
  } else if (command === 'legacy-wf-search') {
    const { values, positionals } = parseArgs({
      args: parseInput,
      options: commonOptions,
      allowPositionals: true
    });
    const keyword = positionals[1];
    if (!keyword) throw new Error("error: missing required argument 'keyword'");
    const { instance, auth } = await resolveSingleConfig(values);
    const { runLegacyWFSearch } = await import('../src/commands/legacy-wf-search.js');
    await runLegacyWFSearch(keyword, instance, auth);
  } else if (command === 'bulk-update') {
    const { values } = parseArgs({
      args: parseInput,
      options: {
        ...commonOptions,
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

    const { instance, auth } = await resolveSingleConfig(values);
    const { runBulkUpdate } = await import('../src/commands/bulk-update.js');
    await runBulkUpdate({ ...values, instance, auth, limit: parseInt(values.limit, 10), dryRun: values['dry-run'] });
  } else if (command === 'export-legacy-wf-xml') {
    const { values } = parseArgs({
      args: parseInput,
      options: {
        ...commonOptions,
        'sys-id': { type: 'string', short: 's', multiple: true },
        'out-dir': { type: 'string', short: 'o', default: process.cwd() }
      },
      allowPositionals: true
    });

    if (!values['sys-id'] || values['sys-id'].length === 0) {
      throw new Error("error: required option '-s, --sys-id <sys_id...>' not specified");
    }

    const { instance, auth } = await resolveSingleConfig(values);
    const { runExportLegacyWFXml } = await import('../src/commands/export-legacy-wf-xml.js');
    await runExportLegacyWFXml({ sysIds: values['sys-id'], instance, auth, outDir: values['out-dir'] });
  } else if (command === 'deploy-updateset') {
    const { values } = parseArgs({
      args: parseInput,
      options: {
        'update-set': { type: 'string', short: 'u' },
        from: { type: 'string', short: 'f' },
        to: { type: 'string', short: 't' },
        profile: { type: 'string' },
        'from-env': { type: 'string' },
        'to-env': { type: 'string' },
        'dry-run': { type: 'boolean', short: 'd', default: false },
        'cleanup-retrieved': { type: 'boolean', short: 'c', default: false }
      },
      allowPositionals: true
    });

    if (!values['update-set']) throw new Error("error: required option '-u, --update-set <sys_id>' not specified");
    const profileMode = Boolean(values.profile) && !forceEnv;
    if (profileMode && (!values['from-env'] || !values['to-env'])) {
      throw new Error('Profile mode requires both --from-env <alias> and --to-env <alias>.');
    }
    if (!profileMode && (!values.from || !values.to)) {
      throw new Error('Environment mode requires both --from <instance> and --to <instance>.');
    }

    const fromConfig = resolveConfig({
      profilePath: values.profile,
      alias: values['from-env'],
      instance: values.from,
      forceEnv: !profileMode,
    });
    const toConfig = resolveConfig({
      profilePath: values.profile,
      alias: values['to-env'],
      instance: values.to,
      forceEnv: !profileMode,
    });

    const { runDeployUpdateSet } = await import('../src/commands/deploy-updateset.js');
    await runDeployUpdateSet({
      updateSet: values['update-set'],
      from: fromConfig.instance,
      to: toConfig.instance,
      fromAuth: fromConfig.auth,
      toAuth: toConfig.auth,
      dryRun: values['dry-run'],
      cleanupRetrieved: values['cleanup-retrieved'],
    });
  } else {
    console.error(`error: unknown command '${command}'`);
    showHelp();
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
