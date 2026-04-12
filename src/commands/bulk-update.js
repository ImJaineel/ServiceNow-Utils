import { createClient } from '../lib/client.js';

// Allowed table name characters — prevents path injection (issue #15)
const TABLE_RE = /^[a-zA-Z0-9_]+$/;

/**
 * Fetches sys_ids for records matching the query, then PATCHes each with the given payload.
 *
 * @param {object}  options
 * @param {string}  options.table          - Table name (e.g. 'incident')
 * @param {string}  options.query          - Encoded query string (e.g. 'active=true')
 * @param {object}  options.payload        - Fields to update on each record
 * @param {number}  [options.limit=100]    - Max records to update
 * @param {boolean} [options.dryRun=false] - If true, only show records to be updated
 * @returns {Promise<{updated: number, failed: number}>}
 */
export async function bulkUpdate({ table, query, payload, limit = 100, dryRun = false }) {
  if (!table) throw new Error('--table is required.');
  if (!query) throw new Error('--query is required.');
  if (!payload || !Object.keys(payload).length) throw new Error('--payload is required.');

  // Validate table name to prevent path injection (issue #15)
  if (!TABLE_RE.test(table)) {
    throw new Error(
      `Invalid table name "${table}". Table names may only contain letters, digits, and underscores.`
    );
  }

  const client = createClient();

  // Step 1: Fetch matching sys_ids
  const { data, status } = await client.get(
    `/api/now/table/${table}` +
    `?sysparm_query=${encodeURIComponent(query)}` +
    `&sysparm_fields=sys_id` +
    `&sysparm_limit=${limit}`
  );

  if (status < 200 || status >= 300) {
    throw new Error(`Failed to fetch records from "${table}" (HTTP ${status}).`);
  }

  const records = data?.result || [];
  if (!records.length) {
    console.log('No records matched the query.');
    return { updated: 0, failed: 0 };
  }

  // Warn if the result set was capped at the limit (issue #13)
  if (records.length === limit) {
    console.warn(
      `[Warn] The query returned exactly ${limit} record(s) — the configured limit. ` +
      'There may be additional matching records that were not processed. ' +
      'Use --limit to increase the cap if needed.'
    );
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
      const { status: patchStatus } = await client.patch(`/api/now/table/${table}/${record.sys_id}`, payload);
      if (patchStatus >= 200 && patchStatus < 300) {
        updated++;
      } else {
        failed++;
        errMsg = `HTTP ${patchStatus}`;
      }
    } catch (err) {
      failed++;
      errMsg = err.message;
    }

    if (errMsg) {
      // Clear the progress line cleanly before printing the error (issue #3)
      process.stdout.write('\n');
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
 * @param {string} options.table
 * @param {string} options.query
 * @param {string} options.payload  - Raw JSON string from the CLI flag
 * @param {number} options.limit
 * @param {boolean} options.dryRun
 */
export async function runBulkUpdate({ table, query, payload, limit, dryRun }) {
  let parsedPayload;

  try {
    parsedPayload = JSON.parse(payload);
  } catch {
    console.error('[Error] --payload must be valid JSON. Example: \'{"state":"2"}\'');
    process.exit(1);
  }

  console.log(`\n🔄 Bulk updating [${table}] | Query: ${query} | Limit: ${limit}${dryRun ? ' | DRY RUN' : ''}\n`);

  try {
    const { updated, failed } = await bulkUpdate({ table, query, payload: parsedPayload, limit, dryRun });
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
