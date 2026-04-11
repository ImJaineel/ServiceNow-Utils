import { createClient } from '../lib/client.js';

/**
 * Fetches sys_ids for records matching the query, then PATCHes each with the given payload.
 *
 * @param {object} options
 * @param {string} options.table        - Table name (e.g. 'incident')
 * @param {string} options.query        - Encoded query string (e.g. 'active=true')
 * @param {object} options.payload      - Fields to update on each record
 * @param {number} [options.limit=100]  - Max records to update
 * @returns {Promise<{updated: number, failed: number}>}
 */
export async function bulkUpdate({ table, query, payload, limit = 100 }) {
  if (!table) throw new Error('--table is required.');
  if (!query) throw new Error('--query is required.');
  if (!payload || !Object.keys(payload).length) throw new Error('--payload is required.');

  const client = createClient();

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

  for (const record of records) {
    try {
      const { status } = await client.patch(`/api/now/table/${table}/${record.sys_id}`, payload);
      if (status >= 200 && status < 300) {
        updated++;
        console.log(`✔ Updated ${record.sys_id}`);
      } else {
        failed++;
        console.error(`✘ Failed ${record.sys_id} (HTTP ${status})`);
      }
    } catch (err) {
      failed++;
      console.error(`✘ Failed ${record.sys_id}: ${err.message}`);
    }
  }

  return { updated, failed };
}

/**
 * CLI handler for the bulk-update command.
 * @param {object} options
 */
export async function runBulkUpdate({ table, query, payload, limit }) {
  let parsedPayload;

  try {
    parsedPayload = JSON.parse(payload);
  } catch {
    console.error('[Error] --payload must be valid JSON. Example: \'{"state":"2"}\'');
    process.exit(1);
  }

  console.log(`\n🔄 Bulk updating [${table}] | Query: ${query} | Limit: ${limit}\n`);

  try {
    const { updated, failed } = await bulkUpdate({ table, query, payload: parsedPayload, limit });
    console.log(`\n✅ Done. Updated: ${updated} | Failed: ${failed}`);
  } catch (err) {
    console.error(`[Error] ${err.message}`);
    process.exit(1);
  }
}
