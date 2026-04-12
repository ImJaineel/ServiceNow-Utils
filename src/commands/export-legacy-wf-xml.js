import https from 'https';
import fs from 'fs';
import path from 'path';
import { createClient } from '../lib/client.js';

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Converts a workflow/catalog item name into a safe filename segment.
 * Strips truly unsafe filesystem characters while preserving readability
 * (spaces become hyphens, runs of hyphens are collapsed). (issue #18)
 *
 * @param {string} name
 * @returns {string}
 */
function cleanFileName(name) {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')  // strip chars illegal on Win/Mac/Linux
    .replace(/\s+/g, '-')                    // spaces → hyphens
    .replace(/-{2,}/g, '-')                  // collapse runs of hyphens
    .replace(/^-+|-+$/g, '')                 // trim leading/trailing hyphens
    || 'unnamed';
}

/**
 * Downloads an HTTPS resource that returns raw content (non-JSON),
 * used for the XML export endpoint.
 * Rejects on non-2xx HTTP status codes (issue #4).
 *
 * @param {string} url
 * @param {string} authHeader
 * @returns {Promise<string>}
 */
function downloadRaw(url, authHeader) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: { Authorization: authHeader, Accept: 'application/xml' },
    }, (res) => {
      // Reject on non-2xx so a 401/404 HTML page is never saved as XML (issue #4)
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); // drain the socket
        return reject(new Error(`XML download failed with HTTP ${res.statusCode}: ${url}`));
      }

      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });

    // Timeout guard (issue #12)
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`XML download timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`));
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Exports catalog item legacy workflows as XML files to the output directory.
 *
 * @param {object}   options
 * @param {string[]} options.sysIds   - Catalog item sys_ids to export
 * @param {string}   [options.outDir] - Output directory (defaults to cwd)
 * @returns {Promise<{exported: number, skipped: number}>}
 */
export async function exportLegacyWFXml({ sysIds, outDir = process.cwd() }) {
  if (!sysIds?.length) throw new Error('At least one --sys-id is required.');

  const client = createClient();

  // Use baseUrl from the client instead of reading SN_INSTANCE directly (issue #14)
  const { baseUrl } = client;

  let exported = 0;
  let skipped = 0;
  let srCounter = 1; // local counter — resets cleanly per call (issue #2)

  const authHeader = await client.getAuthHeader();

  for (const sysId of sysIds) {
    console.log(`\n➡ Processing sys_id: ${sysId}`);

    // Step 1: Get catalog item
    const { data: catData, status: catStatus } = await client.get(
      `/api/now/table/sc_cat_item?sysparm_query=sys_id=${sysId}` +
      `&sysparm_fields=sys_id,name,workflow`
    );

    if (catStatus < 200 || catStatus >= 300) {
      console.log(`  ❌ Failed to fetch catalog item (HTTP ${catStatus}).`);
      skipped++;
      continue;
    }

    const item = catData?.result?.[0];
    if (!item) { console.log('  ❌ Catalog item not found.'); skipped++; continue; }

    console.log(`  ℹ Found Catalog Item: ${item.name}`);
    if (!item.workflow?.value) { console.log('  ⚠  No legacy workflow attached.'); skipped++; continue; }

    // Step 2: Get published workflow version
    const { data: wfData, status: wfStatus } = await client.get(
      `/api/now/table/wf_workflow_version?sysparm_query=workflow=${item.workflow.value}^published=true` +
      `&sysparm_fields=sys_id,name,workflow`
    );

    if (wfStatus < 200 || wfStatus >= 300) {
      console.log(`  ❌ Failed to fetch workflow version (HTTP ${wfStatus}).`);
      skipped++;
      continue;
    }

    const version = wfData?.result?.[0];
    if (!version) { console.log('  ❌ No published workflow version found.'); skipped++; continue; }

    // Step 3: Download XML
    const srNum = srCounter++;
    const fileName = `sr${srNum}-${cleanFileName(item.name)}-${cleanFileName(version.name)}.xml`;
    const filePath = path.join(outDir, fileName);

    console.log(`  ➡ Downloading XML → ${fileName}`);

    const xmlUrl =
      `${baseUrl}/export_workflow.do` +
      `?sysparm_sys_id=${version.sys_id}&sysparm_wf_id=${item.workflow.value}`;

    try {
      const xml = await downloadRaw(xmlUrl, authHeader);
      fs.writeFileSync(filePath, xml, 'utf8');
      console.log(`  ✔ Saved: ${filePath}`);
      exported++;
    } catch (err) {
      console.error(`  ❌ ${err.message}`);
      skipped++;
    }
  }

  return { exported, skipped };
}

/**
 * CLI handler for the export-legacy-wf-xml command.
 * @param {object}   options
 * @param {string[]} options.sysIds
 * @param {string}   options.outDir
 */
export async function runExportLegacyWFXml({ sysIds, outDir }) {
  const sysIdList = Array.isArray(sysIds) ? sysIds : [sysIds];

  console.log(`\n📦 Exporting legacy workflow XML for ${sysIdList.length} catalog item(s)...\n`);

  try {
    const { exported, skipped } = await exportLegacyWFXml({ sysIds: sysIdList, outDir });
    console.log(`\n🎉 Done. Exported: ${exported} | Skipped: ${skipped}`);
  } catch (err) {
    console.error(`[Error] ${err.message}`);
    process.exit(1);
  }
}
