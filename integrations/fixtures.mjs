/* Synthetic snapshots for local development.

   These exist so the Workspace can be built and reviewed before any cloud
   transport is wired up (T6). Two safeguards keep them from being mistaken for
   real data: the transport refuses to construct unless explicitly enabled, and
   the view stamps a visible badge whenever it renders them.

   The hostile metric label is deliberate. It keeps the escaping path exercised
   on every run rather than only in the one test that remembers to check. */

export const FIXTURE_SNAPSHOTS = [
  {
    schemaVersion: 1, sourceId: 'encore',
    observedAt: '2026-09-07T11:55:00Z', sourceUpdatedAt: '2026-09-07T11:40:00Z',
    expiresAt: '2026-09-07T12:10:00Z', status: 'ready', reasonCode: null,
    metrics: [
      { key: 'itemCount', label: 'Catalogue items', value: 38076, unit: 'count' },
      { key: 'jobState', label: 'Last scrape', value: 'done', unit: null },
    ],
    links: [], revision: 'sha256-fixture-encore',
  },
  {
    schemaVersion: 1, sourceId: 'ai-trading-lab',
    observedAt: '2026-09-07T11:58:00Z', sourceUpdatedAt: null,
    expiresAt: '2026-09-07T12:03:00Z', status: 'ready', reasonCode: null,
    metrics: [
      { key: 'reachable', label: 'Reachable', value: true, unit: null },
      { key: 'tradingMode', label: 'Trading mode', value: 'paper', unit: null },
      { key: 'guardrailsActive', label: 'Guardrails', value: true, unit: null },
    ],
    links: [], revision: 'sha256-fixture-trading',
  },
  {
    schemaVersion: 1, sourceId: 'sleepforge',
    observedAt: '2026-09-06T09:00:00Z', sourceUpdatedAt: null,
    expiresAt: '2026-09-07T09:00:00Z', status: 'unavailable', reasonCode: 'missing-file',
    metrics: [], links: [], revision: 'sha256-fixture-sleepforge',
  },
  {
    schemaVersion: 1, sourceId: 'fanbox-downloader',
    observedAt: '2026-09-07T10:00:00Z', sourceUpdatedAt: null,
    expiresAt: '2026-09-08T10:00:00Z', status: 'not-configured', reasonCode: 'not-configured',
    metrics: [], links: [], revision: 'sha256-fixture-fanbox',
  },
  {
    schemaVersion: 1, sourceId: 'graphify',
    observedAt: '2026-09-07T08:00:00Z', sourceUpdatedAt: null,
    expiresAt: '2026-09-08T08:00:00Z', status: 'degraded', reasonCode: 'source-stale',
    // Hostile on purpose — see the file header.
    metrics: [{ key: 'nodeCount', label: '<img src=x onerror=alert(1)>', value: 1284, unit: 'count' }],
    links: [], revision: 'sha256-fixture-graphify',
  },
];

/**
 * Development-only transport. Matches the subscribe() signature the controller
 * expects, so T6 can swap in the real one without touching the view.
 *
 * @param {{enabled?:boolean}} options must pass enabled:true — there is no default
 * @returns {(onSnapshots:Function, onError:Function)=>Function} unsubscribe
 */
export function createFixtureTransport({ enabled } = {}) {
  if (enabled !== true) {
    throw new Error('fixture transport must be explicitly enabled; production must never reach this');
  }
  return function subscribe(onSnapshots) {
    onSnapshots(FIXTURE_SNAPSHOTS);
    return () => {};
  };
}
