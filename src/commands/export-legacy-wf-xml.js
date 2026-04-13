import https from 'https';
import fs from 'fs';
import path from 'path';
import { createClient } from '../lib/client.js';

let srCounter = 1;

function cleanFileName(name) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_');
}

/**
 * Downloads an HTTPS resource that returns raw content (non-JSON),
 * used for the XML export endpoint.
 */
function downloadRaw(url, authHeader) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: { Authorization: authHeader, Accept: 'application/xml' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Exports catalog item legacy workflows as XML files to the output directory.
 *
 * @param {object} options
 * @param {string[]} options.sysIds     - Catalog item sys_ids to export
 * @param {string}  [options.outDir]    - Output directory (defaults to cwd)
 * @returns {Promise<{exported: number, skipped: number}>}
 */
export async function exportLegacyWFXml({ sysIds, outDir = process.cwd() }) {
  if (!sysIds?.length) throw new Error('At least one --sys-id is required.');

  const client = createClient();
  const instance = process.env.SN_INSTANCE;

  let exported = 0;
  let skipped = 0;
  
  const authHeader = await client.getAuthHeader();

  for (const sysId of sysIds) {
    console.log(`\n➡ Processing sys_id: ${sysId}`);

    // Step 1: Get catalog item
    const { data: catData } = await client.get(
      `/api/now/table/sc_cat_item?sysparm_query=sys_id=${sysId}` +
      `&sysparm_fields=sys_id,name,workflow`
    );

    const item = catData?.result?.[0];
    if (!item) { console.log('  ❌ Catalog item not found.'); skipped++; continue; }
    
    console.log(`  ℹ Found Catalog Item: ${item.name}`);
    if (!item.workflow?.value) { console.log('  ⚠  No legacy workflow attached.'); skipped++; continue; }

    // Step 2: Get published workflow version
    const { data: wfData } = await client.get(
      `/api/now/table/wf_workflow_version?sysparm_query=workflow=${item.workflow.value}^published=true` +
      `&sysparm_fields=sys_id,name,workflow`
    );

    const version = wfData?.result?.[0];
    if (!version) { console.log('  ❌ No published workflow version found.'); skipped++; continue; }

    // Step 3: Download XML
    const srNum = srCounter++;
    const fileName = `sr${srNum}-${cleanFileName(item.name)}-${cleanFileName(version.name)}.xml`;
    const filePath = path.join(outDir, fileName);

    console.log(`  ➡ Downloading XML → ${fileName}`);

    const xmlUrl =
      `https://${instance}.service-now.com/export_workflow.do` +
      `?sysparm_sys_id=${version.sys_id}&sysparm_wf_id=${item.workflow.value}`;

    const xml = await downloadRaw(xmlUrl, authHeader);
    fs.writeFileSync(filePath, xml, 'utf8');

    console.log(`  ✔ Saved: ${filePath}`);
    exported++;
  }

  return { exported, skipped };
}

/**
 * CLI handler for the export-legacy-wf-xml command.
 * @param {object} options
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