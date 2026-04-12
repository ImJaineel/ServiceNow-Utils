/**
 * servicenow-utils — TypeScript type declarations (issue #20)
 */

// ─── createClient ────────────────────────────────────────────────────────────

export interface SnClient {
  get(urlPath: string): Promise<{ status: number; data: unknown }>;
  post(urlPath: string, body: object): Promise<{ status: number; data: unknown }>;
  patch(urlPath: string, body: object): Promise<{ status: number; data: unknown }>;
  put(urlPath: string, body: object): Promise<{ status: number; data: unknown }>;
  delete(urlPath: string): Promise<{ status: number; data: unknown }>;
  getAuthHeader(): Promise<string>;
  /** Full base URL of the ServiceNow instance, e.g. https://myinstance.service-now.com */
  baseUrl: string;
}

export function createClient(): SnClient;

// ─── loadEnv ─────────────────────────────────────────────────────────────────

/**
 * Loads credentials from .env.servicenow (if present) and validates that all
 * required environment variables are set. Calls process.exit(1) on failure.
 */
export function loadEnv(): void;

// ─── codeSearch ──────────────────────────────────────────────────────────────

export interface CodeSearchHit {
  [key: string]: unknown;
}

export interface CodeSearchRecordType {
  hits: CodeSearchHit[];
  [key: string]: unknown;
}

export interface CodeSearchResult {
  result: CodeSearchRecordType[];
  [key: string]: unknown;
}

/**
 * Searches ServiceNow instance code using the OOTB Code Search REST API.
 * @param keyword - The search term
 * @returns Parsed search result, or null if nothing found
 */
export function codeSearch(keyword: string): Promise<CodeSearchResult | null>;

// ─── legacyWFSearch ──────────────────────────────────────────────────────────

/** Map of workflow name → array of matching activity names */
export type LegacyWFSearchResult = Record<string, string[]>;

/**
 * Searches ServiceNow legacy workflows for a keyword.
 * @param keyword - The search term
 */
export function legacyWFSearch(keyword: string): Promise<LegacyWFSearchResult>;

// ─── bulkUpdate ──────────────────────────────────────────────────────────────

export interface BulkUpdateOptions {
  /** ServiceNow table name (e.g. 'incident') */
  table: string;
  /** Encoded query string (e.g. 'active=true') */
  query: string;
  /** Fields to update on each matching record */
  payload: Record<string, unknown>;
  /** Max number of records to update (default: 100) */
  limit?: number;
  /** If true, only list records that would be updated — do not apply changes */
  dryRun?: boolean;
}

export interface BulkUpdateResult {
  updated: number;
  failed: number;
}

/**
 * Fetches sys_ids for records matching the query, then PATCHes each with the
 * given payload.
 */
export function bulkUpdate(options: BulkUpdateOptions): Promise<BulkUpdateResult>;

// ─── exportLegacyWFXml ───────────────────────────────────────────────────────

export interface ExportLegacyWFXmlOptions {
  /** Catalog item sys_ids to export */
  sysIds: string[];
  /** Output directory (defaults to process.cwd()) */
  outDir?: string;
}

export interface ExportLegacyWFXmlResult {
  exported: number;
  skipped: number;
}

/**
 * Exports catalog item legacy workflows as XML files to the output directory.
 */
export function exportLegacyWFXml(options: ExportLegacyWFXmlOptions): Promise<ExportLegacyWFXmlResult>;
