import { createClient } from '../lib/client.js';

const MAX_CONCURRENT_REQUESTS = 5;
const PROGRESS_UPDATE_INTERVAL = 5;

// Maximum records to fetch from sys_variable_value in one call (issue #10)
const VARIABLE_FETCH_LIMIT = 1000;

/**
 * Searches ServiceNow legacy workflows for a keyword.
 * Queries sys_variable_value for matches, then resolves workflow names
 * via wf_activity.
 *
 * @param {string} keyword - The search term
 * @returns {Promise<object>} Map of workflow name → array of matching activity names
 */
export async function legacyWFSearch(keyword) {
  if (!keyword) throw new Error('A keyword is required for workflow search.');

  const client = createClient();

  // Step 1: Find variable values containing the keyword.
  // A hard limit is applied to prevent fetching tens of thousands of records
  // on large instances (issue #10). Increase VARIABLE_FETCH_LIMIT if needed.
  const { data: varData } = await client.get(
    `/api/now/table/sys_variable_value` +
    `?sysparm_query=valueLIKE${encodeURIComponent(keyword)}` +
    `&sysparm_limit=${VARIABLE_FETCH_LIMIT}`
  );

  if (!varData?.result?.length) return {};

  // Warn if the result set was capped (issue #10)
  if (varData.result.length === VARIABLE_FETCH_LIMIT) {
    console.warn(
      `[Warn] Variable value query returned ${VARIABLE_FETCH_LIMIT} records (the limit). ` +
      'Results may be incomplete. Consider narrowing your keyword.'
    );
  }

  const docKeys = varData.result.map((item) => item.document_key.value);

  let completedTasks = 0;
  const totalTasks = docKeys.length;

  // Issue #1: completedTasks is incremented here only — never inside the
  // forced final logProgress(true) call, which would have over-counted.
  function logProgress(force = false) {
    if (!force) completedTasks++;
    if (force || completedTasks % PROGRESS_UPDATE_INTERVAL === 0 || completedTasks === totalTasks) {
      const pct = Math.min(100, ((completedTasks / totalTasks) * 100).toFixed(1));
      process.stdout.write(`\r📊 Progress: ${pct}% (${completedTasks}/${totalTasks})`);
    }
  }

  // Step 2: Fetch wf_activity for each doc key with concurrency limit
  async function processInBatches(tasks, batchSize) {
    const results = [];
    let index = 0;

    async function worker() {
      while (index < tasks.length) {
        const i = index++;
        results[i] = await tasks[i]();
        logProgress();
      }
    }

    const workers = Array(Math.min(batchSize, tasks.length)).fill(null).map(worker);
    await Promise.all(workers);
    logProgress(true);
    console.log('\n✅ All requests completed!');
    return results;
  }

  const tasks = docKeys.map((docKey) => async () => {
    try {
      const { data } = await client.get(
        `/api/now/table/wf_activity?sysparm_query=sys_id=${docKey}^workflow_version.published=true` +
        `&sysparm_fields=name,workflow_version&sysparm_display_value=true`
      );
      return (data?.result || []).map((wf) => ({
        workflowName: wf.workflow_version?.display_value || 'Unknown Workflow',
        activityName: wf.name || 'Unknown Activity',
      }));
    } catch {
      return [];
    }
  });

  const results = await processInBatches(tasks, MAX_CONCURRENT_REQUESTS);

  // Step 3: Organise into workflow → activities map
  const workflows = {};
  results.flat().forEach(({ workflowName, activityName }) => {
    if (!workflows[workflowName]) workflows[workflowName] = [];
    workflows[workflowName].push(activityName);
  });

  return workflows;
}

/**
 * CLI handler for the legacy-wf-search command.
 * @param {string} keyword
 */
export async function runLegacyWFSearch(keyword) {
  console.log(`\n🔍 Searching legacy workflows for: '${keyword}'...\n`);

  try {
    const workflows = await legacyWFSearch(keyword);
    const count = Object.keys(workflows).length;

    if (count > 0) {
      console.log(`\n🎯 Found ${count} matching workflow(s):\n`);
      console.log(JSON.stringify(workflows, null, 2));
    } else {
      console.log(`\nNo legacy workflows found containing '${keyword}'.`);
    }
  } catch (err) {
    console.error(`[Error] ${err.message}`);
    process.exit(1);
  }
}
