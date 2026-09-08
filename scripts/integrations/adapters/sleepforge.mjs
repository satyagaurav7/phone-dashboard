/* Sleepforge adapter — episode counts and the last recorded stage.

   The ledger (sleep-sounds-channel/out/ledger.json) has this shape:
     { version, episodes: [{ number, slug, recipe_slug, seed, video_id, created, status }] }

   Only the count and the newest `status` are mapped. slug, recipe_slug, seed
   and video_id are all content identifiers and none of them travel.

   A recorded status of "uploaded" does NOT prove the video is public, or that
   a schedule fired, or that the upload survived. The ledger records what the
   pipeline believed it did. The label says "last recorded stage" for that
   reason, and nothing here infers visibility from the presence of a video_id. */

import { getSource } from '../../../integrations/registry.mjs';
import { readJsonFile, SIZE_CAPS, capped } from '../bounded.mjs';

const SOURCE_ID = 'sleepforge';

/** Stages the pipeline actually writes. Anything else is reported verbatim but
    capped, so a new stage name shows up rather than being silently dropped. */
const KNOWN_STAGES = ['rendered', 'uploaded'];

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

  if (!config || typeof config.ledgerPath !== 'string') {
    return { ...base, sourceUpdatedAt: null, status: 'not-configured', reasonCode: 'not-configured', metrics: [] };
  }

  const read = await readJsonFile({ readFile, stat }, config.ledgerPath, { maxBytes: SIZE_CAPS.ledger });
  if (!read.ok) {
    return { ...base, sourceUpdatedAt: null, status: 'unavailable', reasonCode: read.reasonCode, metrics: [] };
  }

  const episodes = read.data && Array.isArray(read.data.episodes) ? read.data.episodes : null;
  if (!episodes) {
    return { ...base, sourceUpdatedAt: null, status: 'unavailable', reasonCode: 'invalid-data', metrics: [] };
  }

  // Newest by episode number, falling back to array order. `created` is a date
  // string the pipeline wrote and is not trusted for ordering.
  const newest = episodes.reduce(
    (best, e) => (best === null || Number(e?.number) > Number(best?.number) ? e : best),
    null,
  );
  const stage = capped(newest && newest.status) ?? 'unknown';

  return {
    ...base,
    // File mtime is a freshness hint about the FILE, never proof an upload
    // succeeded. It is deliberately not presented as a publication time.
    sourceUpdatedAt: read.mtimeMs > 0 ? new Date(read.mtimeMs).toISOString() : null,
    status: 'ready',
    reasonCode: null,
    metrics: [
      { key: 'episodeCount', label: 'Episodes in ledger', value: episodes.length, unit: 'count' },
      { key: 'latestStage', label: 'Last recorded stage', value: stage, unit: null },
      { key: 'ledgerAvailable', label: 'Ledger readable', value: true, unit: null },
    ],
  };
}

export { KNOWN_STAGES };
