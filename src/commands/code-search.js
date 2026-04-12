import { createClient } from '../lib/client.js';

/**
 * Searches ServiceNow instance code using the OOTB Code Search REST API.
 * Filters out record types with no hits.
 *
 * @param {string} keyword - The search term
 * @returns {Promise<object|null>} Parsed search result or null if nothing found
 */
export async function codeSearch(keyword) {
  if (!keyword) throw new Error('A keyword is required for code search.');

  const client = createClient();
  const urlPath = `/api/sn_codesearch/code_search/search?term=${encodeURIComponent(keyword)}`;

  const { data } = await client.get(urlPath);

  if (!data?.result?.length) return null;

  // Return a new object instead of mutating the API response in place (issue #19)
  const filteredResult = data.result.filter((item) => item.hits?.length > 0);

  return filteredResult.length > 0 ? { ...data, result: filteredResult } : null;
}

/**
 * CLI handler for the code-search command.
 * @param {string} keyword
 */
export async function runCodeSearch(keyword) {
  console.log(`\nSearching ServiceNow code for: '${keyword}'...\n`);

  try {
    const result = await codeSearch(keyword);

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
