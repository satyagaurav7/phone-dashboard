/* FANBOX downloader adapter — aggregate download progress only.

   Entirely opt-in. The manifest lives in an output folder the operator
   configures; with no path configured the source reports `not-configured`,
   which is a normal resting state and not an error asking the user to go and
   run a scraper.

   Nothing about WHAT was downloaded travels: no filenames, titles, creator
   names or URLs, no cookies, no browser profile, and no local paths. Only
   counts. The manifest is a resume file, so its entries are keyed by exactly
   the identifiers that must not leave — they are counted, never read out. */

import { getSource } from '../../../integrations/registry.mjs';
import { readJsonFile, SIZE_CAPS } from '../bounded.mjs';

const SOURCE_ID = 'fanbox-downloader';

/** Count entries whether the manifest is an array or an id-keyed object. */
function countEntries(manifest) {
  if (Array.isArray(manifest)) return manifest.length;
  if (manifest && typeof manifest === 'object') {
    const nested = manifest.items ?? manifest.entries ?? manifest.downloads;
    if (Array.isArray(nested)) return nested.length;
    if (nested && typeof nested === 'object') return Object.keys(nested).length;
    return Object.keys(manifest).length;
  }
  return null;
}

/** Entries whose recorded state is not yet complete. Absent state means done. */
function countPending(manifest) {
  const list = Array.isArray(manifest) ? manifest
    : (manifest && typeof manifest === 'object'
      ? Object.values(manifest.items ?? manifest.entries ?? manifest.downloads ?? manifest)
      : []);
  let pending = 0;
  for (const entry of list) {
    if (entry && typeof entry === 'object') {
      const state = entry.status ?? entry.state;
      if (typeof state === 'string' && state !== 'done' && state !== 'complete' && state !== 'downloaded') pending += 1;
      else if (entry.complete === false || entry.done === false) pending += 1;
    }
  }
  return pending;
}

export async function collectSource({ config, readFile, stat, now }) {
  const source = getSource(SOURCE_ID);
  const observedMs = now();
  const base = {
    schemaVersion: 1,
    sourceId: SOURCE_ID,
    observedAt: new Date(observedMs).toISOString(),
    expiresAt: new Date(observedMs + source.ttlMs).toISOString(),
    links: [],
  };

  // No configured path is the expected state, not a failure.
  if (!config || typeof config.manifestPath !== 'string') {
    return { ...base, sourceUpdatedAt: null, status: 'not-configured', reasonCode: 'not-configured', metrics: [] };
  }

  const read = await readJsonFile({ readFile, stat }, config.manifestPath, { maxBytes: SIZE_CAPS.ledger });
  if (!read.ok) {
    // A configured-but-absent manifest is still "not set up yet" rather than a
    // fault: the downloader simply has not produced one.
    const missing = read.reasonCode === 'missing-file';
    return {
      ...base, sourceUpdatedAt: null,
      status: missing ? 'not-configured' : 'unavailable',
      reasonCode: missing ? 'not-configured' : read.reasonCode,
      metrics: [{ key: 'manifestAvailable', label: 'Manifest present', value: false, unit: null }],
    };
  }

  const total = countEntries(read.data);
  if (total === null) {
    return { ...base, sourceUpdatedAt: null, status: 'unavailable', reasonCode: 'invalid-data', metrics: [] };
  }
  const pending = countPending(read.data);

  return {
    ...base,
    sourceUpdatedAt: read.mtimeMs > 0 ? new Date(read.mtimeMs).toISOString() : null,
    status: 'ready',
    reasonCode: null,
    metrics: [
      { key: 'manifestAvailable', label: 'Manifest present', value: true, unit: null },
      { key: 'downloadedCount', label: 'Recorded downloads', value: Math.max(0, total - pending), unit: 'count' },
      { key: 'pendingCount', label: 'Still pending', value: pending, unit: 'count' },
    ],
  };
}
