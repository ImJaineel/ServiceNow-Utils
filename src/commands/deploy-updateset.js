import { createClient } from '../lib/client.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls a CI/CD progress URL until it succeeds or fails.
 * @param {object} client - createClient() instance
 * @param {string} progressUrl - Full progress URL returned by the CI/CD API
 * @param {(result: object) => void} [onProgress] - Called on every poll tick
 */
async function pollProgress(client, progressUrl, onProgress) {
  const path = new URL(progressUrl).pathname;

  while (true) {
    const res = await client.get(path);
    const result = res.data?.result;
    if (!result) throw new Error(`Poll failed: ${JSON.stringify(res.body, null, 2)}`);

    if (onProgress) onProgress(result);

    if (result.status === '2' || result.status_label === 'Successful') return result;
    if (result.status === '3' || result.status === '4') {
      throw new Error(`${result.status_label}: ${result.status_message || result.status_detail || 'Unknown error'}`);
    }


    await sleep(3000);
  }
}

/**
 * Deploys a completed update set using the OOTB CI/CD API. Authentication is
 * supplied separately for each instance.
 *
 * @param {object} options
 * @param {string} options.updateSetId - sys_id of the update set on the origin instance
 * @param {string} options.from        - Origin instance name (e.g. 'flexdev')
 * @param {string} options.to          - Target instance name (e.g. 'flextest')
 * @param {object} options.fromAuth    - Source instance credentials
 * @param {object} options.toAuth      - Target instance credentials
 * @param {boolean} [options.dryRun=false] - If true, check source readiness and target collision only
 * @param {boolean} [options.cleanupRetrieved=false] - If true, adds cleanup_retrieved=true to the retrieve call
 * @param {(message: string, inline?: boolean) => void} [options.onLog] - Progress callback
 * @returns {Promise<{committed: boolean, remoteUpdateSetId: string}>}
 */
export async function deployUpdateSet({ updateSetId, from, to, fromAuth, toAuth, dryRun = false, cleanupRetrieved = false, onLog = () => {} }) {
  if (!updateSetId) throw new Error('--update-set is required.');
  if (!from) throw new Error('--from is required.');
  if (!to) throw new Error('--to is required.');

  const fromClient = createClient(from, fromAuth);
  const toClient = createClient(to, toAuth);
  const fromHost = /^https?:\/\//i.test(from)
    ? new URL(from).host
    : /\./.test(from) ? from.replace(/\/$/, '') : `${from}.service-now.com`;

  // Step 1: Validate the update set is marked complete on the origin
  onLog(`Validating update set is complete on ${from}...`);
  const valRes = await fromClient.get(
    `/api/now/table/sys_update_set?sysparm_query=sys_id=${encodeURIComponent(updateSetId)}&sysparm_fields=name,state&sysparm_limit=1`
  );
  if (valRes.status !== 200) throw new Error(`Validation failed (HTTP ${valRes.status})`);
  const usRecord = valRes.data?.result?.[0];
  if (!usRecord) throw new Error('Update set not found on origin instance.');
  if (usRecord.state !== 'complete') {
    throw new Error(`Update set "${usRecord.name}" is not complete (state: ${usRecord.state}). Mark it complete before deploying.`);
  }
  onLog(`"${usRecord.name}" is complete.`);

  // Dry runs report target readiness without retrieving or previewing anything.
  onLog(`Checking target collision status on ${to}...`);
  const collisionRes = await toClient.get(
    `/api/now/table/sys_remote_update_set?sysparm_query=origin_sys_id=${encodeURIComponent(updateSetId)}&sysparm_fields=sys_id,name,state&sysparm_limit=1`
  );
  if (collisionRes.status !== 200) throw new Error(`Target collision check failed (HTTP ${collisionRes.status})`);
  const collision = collisionRes.data?.result?.[0] || null;
  if (dryRun) {
    return {
      ready: !collision,
      committed: false,
      collision: collision ? { sysId: collision.sys_id, name: collision.name, state: collision.state } : null,
      updateSetName: usRecord.name,
    };
  }
  if (collision && !cleanupRetrieved) {
    throw new Error(`Update set already exists on target (remote sys_id: ${collision.sys_id}, state: ${collision.state}).`);
  }

  // Step 2: Get the update set source for the origin, registered on the target
  onLog(`Fetching update source for ${from} on ${to}...`);
  const srcRes = await toClient.get(
    `/api/now/table/sys_update_set_source?sysparm_fields=sys_id,name,instance_id&sysparm_query=${encodeURIComponent(`active=true^urlLIKE${fromHost}`)}`
  );
  if (srcRes.status !== 200) throw new Error(`Failed to fetch update sources (HTTP ${srcRes.status})`);
  const sources = srcRes.data?.result || [];
  if (!sources.length) throw new Error(`No active update set source found for ${from} on ${to}.`);
  const updateSourceId = sources[0].sys_id;
  const updateSourceInstanceId = sources[0].instance_id;
  onLog(`Found source: ${sources[0].name} (${updateSourceInstanceId})`);

  // Step 3: Retrieve the update set on the target (auto_preview, optional cleanup)
  onLog(`Retrieving update set on ${to} (auto_preview${cleanupRetrieved ? ', cleanup' : ''})...`);
  const retrieveParams = `update_set_id=${updateSetId}&update_source_id=${updateSourceId}&update_source_instance_id=${updateSourceInstanceId}&auto_preview=true${cleanupRetrieved ? '&cleanup_retrieved=true' : ''}`;
  const retrieveRes = await toClient.post(`/api/sn_cicd/update_set/retrieve?${retrieveParams}`);
  if (retrieveRes.status !== 200) throw new Error(`Retrieve failed (HTTP ${retrieveRes.status}): ${JSON.stringify(retrieveRes.data, null, 2)}`);
  const progressUrl = retrieveRes.data?.result?.links?.progress?.url;
  if (!progressUrl) throw new Error('No progress URL returned from retrieve.');

  // Step 4: Poll retrieve/preview progress
  onLog('Polling retrieve + preview progress...');
  const progressResult = await pollProgress(toClient, progressUrl, (r) =>
    onLog(`${r.percent_complete || 0}% — ${r.status_label || ''}`, true)
  );
  onLog('Retrieve + Preview complete.');

  var remoteUpdateSetId = progressResult.remote_update_set_id || progressResult.links?.result?.id;
  if (!remoteUpdateSetId) {
    onLog(`Could not determine remote_update_set_id from progress, Now checking in target instance Retreived Update Set table to check if Update set is already imported...`);
    const checkImportedUpdateSet = await toClient.get(
      `/api/now/table/sys_remote_update_set?sysparm_query=origin_sys_id=${updateSetId}&sysparm_fields=sys_id,state`
    );
    
    if (checkImportedUpdateSet.data.result.length > 0) {
      if (checkImportedUpdateSet.data.result[0].state === 'previewed') {
        onLog(`Update set is already imported and in previewed state with sys_id ${checkImportedUpdateSet.data.result[0].sys_id}`);
        remoteUpdateSetId = checkImportedUpdateSet.data.result[0].sys_id;
      } else {
        throw new Error(`Update set is already imported and in ${checkImportedUpdateSet.data.result[0].state} state with sys_id ${checkImportedUpdateSet.data.result[0].sys_id}`);
      }
    } else {
      throw new Error('Remote update set not found after retrieve.');
    }
  }

  // Step 5: Commit the remote update set
  onLog(`Committing remote update set ${remoteUpdateSetId} on ${to}...`);
  const commitRes = await toClient.post(
    `/api/sn_cicd/update_set/commit/${remoteUpdateSetId}`,
    { force_commit: 'true' }
  );
  if (commitRes.status !== 200) throw new Error(`Commit failed (HTTP ${commitRes.status}): ${JSON.stringify(commitRes.data, null, 2)}`);
  const commitProgressUrl = commitRes.data?.result?.links?.progress?.url;
  if (commitProgressUrl) {
    onLog('Polling commit progress...');
    await pollProgress(toClient, commitProgressUrl, (r) =>
      onLog(`${r.percent_complete || 0}% — ${r.status_label || ''}`, true)
    );
  }

  return { committed: true, remoteUpdateSetId };
}

/**
 * CLI handler for the deploy-updateset command.
 * @param {object} options
 * @param {string} options.updateSet
 * @param {string} options.from
 * @param {string} options.to
 * @param {boolean} options.dryRun
 * @param {boolean} options.cleanupRetrieved
 */
export async function runDeployUpdateSet({ updateSet, from, to, fromAuth, toAuth, dryRun, cleanupRetrieved }) {
  console.log(`\n🚀 Deploying update set ${updateSet}: ${from} → ${to}${dryRun ? ' (dry run — no commit)' : ''}\n`);

  try {
    const result = await deployUpdateSet({
      updateSetId: updateSet,
      from,
      to,
      fromAuth,
      toAuth,
      dryRun,
      cleanupRetrieved,
      onLog: (msg, inline) => {
        if (inline) {
          process.stdout.write(`\r  ${msg}        `);
        } else {
          console.log(`[Step] ${msg}`);
        }
      },
    });

    console.log();
    if (dryRun) {
      console.log(`✅ Readiness: ${result.ready ? 'ready' : 'blocked by existing target update set'}.`);
      console.log(`   Update set: ${result.updateSetName}`);
      console.log(`   Collision: ${result.collision ? `${result.collision.sysId} (${result.collision.state})` : 'none'}`);
    } else if (result.committed) {
      console.log(`✅ Update set deployed and committed successfully. (remote sys_id: ${result.remoteUpdateSetId})`);
    } else {
      console.log(`✅ Retrieve + preview complete — dry run, not committed. (remote sys_id: ${result.remoteUpdateSetId})`);
    }
  } catch (err) {
    console.log();
    console.error(`✘ Error: ${err.message}`);
    process.exit(1);
  }
}
