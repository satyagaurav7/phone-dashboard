/* Source registry — the only place a source ID becomes legitimate.
   Browser-safe: data and pure lookups only, no I/O, no clock.

   A source absent from here cannot reach the view: validateSnapshot() rejects
   unregistered IDs, and metric keys are allowlisted per source. Phone Dashboard
   itself is deliberately not a source; it is the shell. */

export const SCHEMA_VERSION = 1;

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** Snapshot statuses a collector may assert. `stale` is derived, never stored. */
export const STATUSES = ['ready', 'degraded', 'unavailable', 'not-configured', 'reference-only'];

/** Fixed reason codes. Raw exception text never reaches the view. */
export const REASON_CODES = ['timeout', 'unreachable', 'invalid-data', 'missing-file', 'not-configured', 'source-stale'];

/** Fixed user copy per reason code. */
export const REASON_COPY = {
  timeout: 'Source did not respond in time',
  unreachable: 'Could not reach the source',
  'invalid-data': 'Source returned unexpected data',
  'missing-file': 'Expected file was not found',
  'not-configured': 'Not configured yet',
  'source-stale': 'Source data is older than allowed',
};

/** Caps. Enforced by contract.mjs; duplicated nowhere else. */
export const LIMITS = {
  maxMetrics: 8,
  maxLinks: 3,
  maxStringChars: 160,
  maxSnapshotBytes: 16 * 1024,
  futureSkewMs: 5 * MIN,
};

/**
 * mode: 'live'      — a collector observes it and freshness is meaningful
 *       'reference' — a pointer only; no health claim, never "stale" in the
 *                     sense of broken. Reference entries must say so in the UI.
 * allowedMetricKeys: [] means the source publishes no metrics at all.
 * allowedHosts: [] deliberately. No hosted URL has been verified yet, and the
 *   SPEC requires unverified URLs to stay absent rather than be guessed. Encore
 *   and trading run on the laptop, so the phone gets "Available on laptop", not
 *   a localhost link that cannot resolve.
 */
export const SOURCES = [
  { id: 'encore',                label: 'Encore',              group: 'apps',      mode: 'live',      ttlMs: 15 * MIN, maxSourceAgeMs: 24 * HOUR, allowedMetricKeys: ['itemCount', 'lastJob', 'jobState'], allowedHosts: [] },
  { id: 'ai-trading-lab',        label: 'AI Trading Lab',      group: 'apps',      mode: 'live',      ttlMs: 5 * MIN,  maxSourceAgeMs: null,      allowedMetricKeys: ['reachable', 'tradingMode', 'guardrailsActive', 'paperTrading'], allowedHosts: [] },
  { id: 'sleepforge',            label: 'Sleepforge',          group: 'media',     mode: 'live',      ttlMs: DAY,      maxSourceAgeMs: 30 * DAY,  allowedMetricKeys: ['episodeCount', 'latestStage', 'ledgerAvailable'], allowedHosts: [] },
  { id: 'fanbox-downloader',     label: 'FANBOX downloader',   group: 'media',     mode: 'live',      ttlMs: DAY,      maxSourceAgeMs: 30 * DAY,  allowedMetricKeys: ['manifestAvailable', 'downloadedCount', 'pendingCount'], allowedHosts: [] },
  { id: 'graphify',              label: 'Graphify',            group: 'developer', mode: 'live',      ttlMs: DAY,      maxSourceAgeMs: 30 * DAY,  allowedMetricKeys: ['nodeCount', 'edgeCount', 'generatedAt'], allowedHosts: [] },
  { id: 'anchor-context',        label: 'Anchor Context',      group: 'reference', mode: 'reference', ttlMs: 7 * DAY,  maxSourceAgeMs: null,      allowedMetricKeys: [], allowedHosts: [] },
  { id: 'ai-memory-portability', label: 'AI Memory Portability', group: 'reference', mode: 'reference', ttlMs: 7 * DAY, maxSourceAgeMs: null,    allowedMetricKeys: [], allowedHosts: [] },
  { id: 'personal-hub',          label: 'Personal Hub',        group: 'reference', mode: 'reference', ttlMs: 7 * DAY,  maxSourceAgeMs: null,      allowedMetricKeys: [], allowedHosts: [] },
  { id: 'pr-documents',          label: 'PR documents',        group: 'reference', mode: 'reference', ttlMs: 7 * DAY,  maxSourceAgeMs: null,      allowedMetricKeys: [], allowedHosts: [] },
];

const BY_ID = new Map(SOURCES.map(s => [s.id, s]));

/** Registered source, or undefined. Never throws — callers decide the error. */
export const getSource = id => BY_ID.get(id);

/** Display order is the registry order, so the UI cannot reorder by data. */
export const sourceIds = () => SOURCES.map(s => s.id);
