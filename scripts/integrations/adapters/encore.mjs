/* Encore adapter — catalogue freshness only.

   Encore computes the economics; FLOWSTATE does not recalculate or restate
   them. The product feed carries retail, resale, profitMin/Max, currentBid,
   maxBid, sellScore and 38k rows: none of that is mapped. Only the count and
   the job's coarse state leave the laptop.

   `job.error` is a raw exception string (see encore/src/serve.mjs) and is
   never forwarded — a failed job becomes a reason code instead. */

import { getSource } from '../../../integrations/registry.mjs';
import { getJson, SIZE_CAPS, endpoint } from '../bounded.mjs';

export const ENCORE_ENDPOINTS = ['/api/status', '/api/products'];

const SOURCE_ID = 'encore';

/** job.step is free text; collapse it to a fixed vocabulary before it travels. */
function jobState(job) {
  if (!job || typeof job !== 'object') return 'unknown';
  if (job.running === true) return 'running';
  const step = typeof job.step === 'string' ? job.step : '';
  if (step === 'failed' || typeof job.error === 'string') return 'failed';
  if (step === 'done') return 'done';
  return 'idle';
}

/** Epoch ms to ISO, or null. A missing timestamp stays missing — never "now". */
function isoOrNull(ms) {
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

/**
 * @param {{config:{baseUrl:string}, fetch:Function, now:()=>number}} deps
 * @returns {Promise<object>} snapshot without `revision` — the collector adds it
 */
export async function collectSource({ config, fetch, now }) {
  const source = getSource(SOURCE_ID);
  const observedMs = now();
  const observedAt = new Date(observedMs).toISOString();
  const expiresAt = new Date(observedMs + source.ttlMs).toISOString();
  const base = { schemaVersion: 1, sourceId: SOURCE_ID, observedAt, expiresAt, links: [] };

  // A source listed with no base URL is unconfigured, not unreachable. Without
  // this the URL constructor throws and collectAll reports the wrong state.
  if (!config || typeof config.baseUrl !== 'string') {
    return { ...base, sourceUpdatedAt: null, status: 'not-configured', reasonCode: 'not-configured', metrics: [] };
  }

  // Exactly two requests, both GET, both read-only. /api/refresh, /api/prepare
  // and /api/queue exist on this server and are deliberately never touched.
  const [status, products] = await Promise.all([
    getJson(fetch, endpoint(config.baseUrl, '/api/status'), { maxBytes: SIZE_CAPS.health }),
    getJson(fetch, endpoint(config.baseUrl, '/api/products'), { maxBytes: SIZE_CAPS.productFeed }),
  ]);

  // The catalogue is the source of truth for this card. Without it there is
  // nothing honest to show, whatever the job says.
  if (!products.ok) {
    return { ...base, sourceUpdatedAt: null, status: 'unavailable', reasonCode: products.reasonCode, metrics: [] };
  }

  const count = products.data && Number(products.data.count);
  if (!Number.isFinite(count)) {
    return { ...base, sourceUpdatedAt: null, status: 'unavailable', reasonCode: 'invalid-data', metrics: [] };
  }

  const job = status.ok ? status.data : null;
  const state = jobState(job);
  const sourceUpdatedAt = isoOrNull(job && Number(job.finishedAt));

  const metrics = [
    { key: 'itemCount', label: 'Catalogue items', value: count, unit: 'count' },
    { key: 'jobState', label: 'Last scrape', value: state, unit: null },
  ];

  // A failed scrape still has a readable catalogue — it is just not current.
  // Degraded says so without pretending the count is fresh.
  if (state === 'failed') {
    return { ...base, sourceUpdatedAt, status: 'degraded', reasonCode: 'invalid-data', metrics };
  }
  if (!status.ok) {
    return { ...base, sourceUpdatedAt, status: 'degraded', reasonCode: status.reasonCode, metrics };
  }
  return { ...base, sourceUpdatedAt, status: 'ready', reasonCode: null, metrics };
}
