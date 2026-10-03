import { createClient } from '../lib/client.js';

/**
 * Fetches sys_ids for records matching the query, then PATCHes each with the given payload.
 *
 * @param {object} options
 * @param {string} options.table        - Table name (e.g. 'incident')
 * @param {string} options.query        - Encoded query string (e.g. 'active=true')
 * @param {object} options.payload      - Fields to update on each record
 * @param {string} options.instance     - ServiceNow instance name
 * @param {number} [options.limit=100]  - Max records to update
 * @param {boolean} [options.dryRun=false] - If true, only show records to be updated
 * @returns {Promise<{updated: number, failed: number}>}
 */
export async function bulkUpdate({ table, query, payload, instance, auth, limit = 100, dryRun = false }) {
  if (!table) throw new Error('--table is required.');
  if (!query) throw new Error('--query is required.');
  if (!payload || !Object.keys(payload).length) throw new Error('--payload is required.');
  if (!instance) throw new Error('An instance is required.');

  const client = createClient(instance, auth);

  // Step 1: Fetch matching sys_ids
  const { data } = await client.get(
    `/api/now/table/${table}?sysparm_query=${encodeURIComponent(query)}&sysparm_fields=sys_id&sysparm_limit=${limit}`
  );

  const records = data?.result || [];
  if (!records.length) {
    return { updated: 0, failed: 0 };
  }

  // Step 2: PATCH each record
  let updated = 0;
  let failed = 0;
  const total = records.length;

  for (let i = 0; i < total; i++) {
    const record = records[i];

    if (dryRun) {
      console.log(`[Dry Run] Would update ${record.sys_id}`);
      continue;
    }

    let errMsg = null;
    try {
      const { status } = await client.patch(`/api/now/table/${table}/${record.sys_id}`, payload);
      if (status >= 200 && status < 300) {
        updated++;
      } else {
        failed++;
        errMsg = `HTTP ${status}`;
      }
    } catch (err) {
      failed++;
      errMsg = err.message;
    }

    if (errMsg) {
      if (process.stdout.clearLine) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
      } else {
        process.stdout.write('\n');
      }
      console.error(`✘ Failed ${record.sys_id}: ${errMsg}`);
    }

    const pct = ((i + 1) / total * 100).toFixed(1);
    process.stdout.write(`\r📊 Progress: ${pct}% (${i + 1}/${total}) | ✅ Updated: ${updated} | ❌ Failed: ${failed}`);
  }

  if (!dryRun) console.log();

  return { updated, failed };
}

/**
 * CLI handler for the bulk-update command.
 * @param {object} options
 */
export async function runBulkUpdate({ table, query, payload, instance, auth, limit, dryRun }) {
  let parsedPayload;

  try {
    parsedPayload = JSON.parse(payload);
  } catch {
    console.error('[Error] --payload must be valid JSON. Example: \'{"state":"2"}\'');
    process.exit(1);
  }

  console.log(`\n🔄 Bulk updating [${table}] on ${instance} | Query: ${query} | Limit: ${limit}${dryRun ? ' | DRY RUN' : ''}\n`);

  try {
    const { updated, failed } = await bulkUpdate({ table, query, payload: parsedPayload, instance, auth, limit, dryRun });
    if (dryRun) {
      console.log(`\n✅ Dry run complete. No records were updated.`);
    } else {
      console.log(`\n✅ Done. Updated: ${updated} | Failed: ${failed}`);
    }
  } catch (err) {
    console.error(`[Error] ${err.message}`);
    process.exit(1);
  }
}
