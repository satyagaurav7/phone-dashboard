/* AI Trading Lab adapter — reachability and guardrails only.

   /api/health returns watchlist, memory_cache_keys and recent_errors alongside
   the fields we want. recent_errors is raw tracebacks and can contain provider
   API keys; memory_cache_keys names the tickers being tracked. None of it is
   mapped, and the test suite asserts their absence rather than trusting this
   comment.

   /api/portfolio, /api/overview, /api/watchlist, /api/journal and /api/signals
   are never requested. The SPEC anticipated an /api/summary endpoint; the real
   dashboard has no such route, and the sensitive ones above are the actual
   exposure. Any future use of them needs its own minimisation test first. */

import { getSource } from '../../../integrations/registry.mjs';
import { getJson, SIZE_CAPS, capped, endpoint } from '../bounded.mjs';

export const TRADING_ENDPOINTS = ['/api/health'];

const SOURCE_ID = 'ai-trading-lab';

/**
 * @param {{config:{baseUrl:string}, fetch:Function, now:()=>number}} deps
 * @returns {Promise<object>} snapshot without `revision`
 */
export async function collectSource({ config, fetch, now }) {
  const source = getSource(SOURCE_ID);
  const observedMs = now();
  const observedAt = new Date(observedMs).toISOString();
  const base = {
    schemaVersion: 1,
    sourceId: SOURCE_ID,
    observedAt,
    expiresAt: new Date(observedMs + source.ttlMs).toISOString(),
    // Health answers "is it up", not "when was the market data refreshed".
    // Claiming a source timestamp here would imply freshness we cannot see.
    sourceUpdatedAt: null,
    links: [],
  };

  const health = await getJson(fetch, endpoint(config.baseUrl, '/api/health'), { maxBytes: SIZE_CAPS.health });
  if (!health.ok) {
    return { ...base, status: 'unavailable', reasonCode: health.reasonCode, metrics: [] };
  }

  const data = health.data && typeof health.data === 'object' ? health.data : {};
  const guardrails = data.guardrails && typeof data.guardrails === 'object' ? data.guardrails : {};

  // Default to unsafe: a missing or malformed guardrail block must not read as
  // "guardrails active". Only an explicit false for orders is reassuring.
  const guardrailsActive = guardrails.orders_possible_from_dashboard === false;
  const tradingMode = capped(data.trading_mode) ?? 'unknown';

  const metrics = [
    { key: 'reachable', label: 'Reachable', value: true, unit: null },
    { key: 'tradingMode', label: 'Trading mode', value: tradingMode, unit: null },
    { key: 'paperTrading', label: 'Paper trading', value: tradingMode === 'paper', unit: null },
    { key: 'guardrailsActive', label: 'Guardrails', value: guardrailsActive, unit: null },
  ];

  return {
    ...base,
    status: guardrailsActive ? 'ready' : 'degraded',
    reasonCode: guardrailsActive ? null : 'invalid-data',
    metrics,
  };
}
