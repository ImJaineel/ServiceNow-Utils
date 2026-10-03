import { createClient } from '../lib/client.js';

/**
 * Searches ServiceNow instance code using the OOTB Code Search REST API.
 * Filters out record types with no hits.
 *
 * @param {string} keyword - The search term
 * @param {string} instance - ServiceNow instance name
 * @returns {Promise<object|null>} Parsed search result or null if nothing found
 */
export async function codeSearch(keyword, instance, auth) {
  if (!keyword) throw new Error('A keyword is required for code search.');
  if (!instance) throw new Error('An instance is required for code search.');

  const client = createClient(instance, auth);
  const path = `/api/sn_codesearch/code_search/search?term=${encodeURIComponent(keyword)}`;

  const { data } = await client.get(path);

  if (!data?.result?.length) return null;

  // Filter out record types with no hits
  data.result = data.result.filter((item) => item.hits?.length > 0);

  return data.result.length > 0 ? data : null;
}

/**
 * CLI handler for the code-search command.
 * @param {string} keyword
 * @param {string} instance
 */
export async function runCodeSearch(keyword, instance, auth) {
  console.log(`\nSearching ServiceNow code on ${instance} for: '${keyword}'...\n`);

  try {
    const result = await codeSearch(keyword, instance, auth);

    if (result) {
      console.log(`Found ${result.result.length} record type(s) with matches:\n`);
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`No results found for '${keyword}'.`);
    }
  } catch (err) {
    console.error(`[Error] ${err.message}`);
    process.exit(1);
  }
}
