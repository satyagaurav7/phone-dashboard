/* Snapshot contract — the trust boundary between anything a collector scraped
   and anything the view renders.

   Two rules make this safe:
     1. Nothing is spread. The validated value is rebuilt field by field, so an
        unknown upstream key cannot ride along into the browser.
     2. No wall clock. Time-sensitive checks take an explicit nowMs, so tests
        are deterministic and a slow device cannot change a verdict.

   Hashing lives in the collector, not here: the view must never be able to mint
   a revision that looks canonical. */

import { SCHEMA_VERSION, STATUSES, REASON_CODES, LIMITS, getSource } from './registry.mjs';

export { REASON_COPY } from './registry.mjs';

const isPlainObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = v => typeof v === 'number' && Number.isFinite(v);

const byteLength = str =>
  typeof TextEncoder === 'function' ? new TextEncoder().encode(str).length : Buffer.byteLength(str, 'utf8');

/** ISO-8601 instant to epoch ms, or null. Stricter than Date.parse, which
    accepts things like "2026" and locale formats we never want to trust. */
function parseInstant(value) {
  if (typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function capString(v, errors, field) {
  if (typeof v !== 'string') { errors.push(field + ': must be a string'); return null; }
  if (v.length > LIMITS.maxStringChars) { errors.push(field + ': exceeds ' + LIMITS.maxStringChars + ' characters'); return null; }
  return v;
}

/** HTTPS, host on the source allowlist, no credentials, no query or fragment. */
function validateLink(link, source, errors, i) {
  if (!isPlainObject(link)) { errors.push('links[' + i + ']: must be an object'); return null; }
  const extra = Object.keys(link).filter(k => k !== 'label' && k !== 'href');
  if (extra.length) { errors.push('links[' + i + ']: unknown keys ' + extra.join(', ')); return null; }

  const label = capString(link.label, errors, 'links[' + i + '].label');
  if (label === null) return null;
  if (typeof link.href !== 'string') { errors.push('links[' + i + '].href: must be a string'); return null; }

  let url;
  try { url = new URL(link.href); } catch { errors.push('links[' + i + '].href: not a valid URL'); return null; }
  if (url.protocol !== 'https:') { errors.push('links[' + i + '].href: must be https'); return null; }
  if (url.username || url.password) { errors.push('links[' + i + '].href: must not carry credentials'); return null; }
  if (url.search || url.hash) { errors.push('links[' + i + '].href: must not carry query or fragment'); return null; }
  if (!source.allowedHosts.includes(url.host)) { errors.push('links[' + i + '].href: host ' + url.host + ' is not allowlisted'); return null; }
  return { label, href: url.href };
}

function validateMetric(metric, source, errors, i) {
  if (!isPlainObject(metric)) { errors.push('metrics[' + i + ']: must be an object'); return null; }
  const extra = Object.keys(metric).filter(k => !['key', 'label', 'value', 'unit'].includes(k));
  if (extra.length) { errors.push('metrics[' + i + ']: unknown keys ' + extra.join(', ')); return null; }

  if (!source.allowedMetricKeys.includes(metric.key)) {
    errors.push('metrics[' + i + '].key: ' + String(metric.key) + ' is not allowed for ' + source.id);
    return null;
  }
  const label = capString(metric.label, errors, 'metrics[' + i + '].label');
  if (label === null) return null;

  // Absent beats invented: an unknown value is omitted upstream, never sent as 0.
  const v = metric.value;
  if (!(isFiniteNumber(v) || typeof v === 'boolean' || typeof v === 'string')) {
    errors.push('metrics[' + i + '].value: must be a finite number, boolean, or string');
    return null;
  }
  if (typeof v === 'string' && capString(v, errors, 'metrics[' + i + '].value') === null) return null;

  let unit = null;
  if (metric.unit !== undefined && metric.unit !== null) {
    unit = capString(metric.unit, errors, 'metrics[' + i + '].unit');
    if (unit === null) return null;
  }
  return { key: metric.key, label, value: v, unit };
}

/**
 * @param {unknown} input raw snapshot from a collector or transport
 * @param {number} [nowMs] when given, rejects timestamps implausibly in the future
 * @returns {{ok:true,value:object}|{ok:false,errors:string[]}}
 */
export function validateSnapshot(input, nowMs) {
  const errors = [];
  if (!isPlainObject(input)) return { ok: false, errors: ['snapshot: must be an object'] };

  const allowed = ['schemaVersion', 'sourceId', 'observedAt', 'sourceUpdatedAt', 'expiresAt', 'status', 'reasonCode', 'metrics', 'links', 'revision'];
  const unknown = Object.keys(input).filter(k => !allowed.includes(k));
  if (unknown.length) errors.push('snapshot: unknown keys ' + unknown.join(', '));

  if (input.schemaVersion !== SCHEMA_VERSION) errors.push('schemaVersion: must be ' + SCHEMA_VERSION);

  const source = getSource(input.sourceId);
  if (!source) errors.push('sourceId: ' + String(input.sourceId) + ' is not a registered source');

  if (!STATUSES.includes(input.status)) errors.push('status: must be one of ' + STATUSES.join(', '));
  if (input.reasonCode !== null && input.reasonCode !== undefined && !REASON_CODES.includes(input.reasonCode)) {
    errors.push('reasonCode: must be null or one of ' + REASON_CODES.join(', '));
  }

  const observedAt = parseInstant(input.observedAt);
  if (observedAt === null) errors.push('observedAt: must be an ISO-8601 instant');
  const expiresAt = parseInstant(input.expiresAt);
  if (expiresAt === null) errors.push('expiresAt: must be an ISO-8601 instant');

  let sourceUpdatedAt = null;
  if (input.sourceUpdatedAt !== null && input.sourceUpdatedAt !== undefined) {
    sourceUpdatedAt = parseInstant(input.sourceUpdatedAt);
    if (sourceUpdatedAt === null) errors.push('sourceUpdatedAt: must be an ISO-8601 instant or null');
  }

  // A snapshot that expires before it was observed is incoherent, not just stale.
  if (observedAt !== null && expiresAt !== null && expiresAt <= observedAt) {
    errors.push('expiresAt: must be after observedAt');
  }
  if (typeof nowMs === 'number') {
    const limit = nowMs + LIMITS.futureSkewMs;
    if (observedAt !== null && observedAt > limit) errors.push('observedAt: is in the future');
    if (sourceUpdatedAt !== null && sourceUpdatedAt > limit) errors.push('sourceUpdatedAt: is in the future');
  }

  if (typeof input.revision !== 'string' || input.revision.length === 0 || input.revision.length > LIMITS.maxStringChars) {
    errors.push('revision: must be a non-empty capped string');
  }

  const metrics = [];
  if (!Array.isArray(input.metrics)) errors.push('metrics: must be an array');
  else if (input.metrics.length > LIMITS.maxMetrics) errors.push('metrics: at most ' + LIMITS.maxMetrics + ' entries');
  else if (source) input.metrics.forEach((m, i) => { const v = validateMetric(m, source, errors, i); if (v) metrics.push(v); });

  const links = [];
  if (!Array.isArray(input.links)) errors.push('links: must be an array');
  else if (input.links.length > LIMITS.maxLinks) errors.push('links: at most ' + LIMITS.maxLinks + ' entries');
  else if (source) input.links.forEach((l, i) => { const v = validateLink(l, source, errors, i); if (v) links.push(v); });

  if (errors.length) return { ok: false, errors };

  // Rebuilt field by field — nothing from `input` is spread.
  const value = {
    schemaVersion: SCHEMA_VERSION,
    sourceId: input.sourceId,
    observedAt: input.observedAt,
    sourceUpdatedAt: sourceUpdatedAt === null ? null : input.sourceUpdatedAt,
    expiresAt: input.expiresAt,
    status: input.status,
    reasonCode: input.reasonCode ?? null,
    metrics,
    links,
    revision: input.revision,
  };

  const bytes = byteLength(JSON.stringify(value));
  if (bytes > LIMITS.maxSnapshotBytes) {
    return { ok: false, errors: ['snapshot: ' + bytes + ' bytes exceeds ' + LIMITS.maxSnapshotBytes] };
  }
  return { ok: true, value };
}

/**
 * Status to display. `stale` is derived here and never stored, so a collector
 * cannot assert freshness it does not have.
 * @returns {'ready'|'degraded'|'unavailable'|'not-configured'|'reference-only'|'stale'}
 */
export function displayState(snapshot, nowMs) {
  const source = getSource(snapshot.sourceId);

  // A reference entry makes no live-health claim, so it cannot go stale.
  if (snapshot.status === 'reference-only' || (source && source.mode === 'reference')) return 'reference-only';
  if (snapshot.status === 'unavailable' || snapshot.status === 'not-configured') return snapshot.status;

  const expiresAt = parseInstant(snapshot.expiresAt);
  if (expiresAt !== null && nowMs >= expiresAt) return 'stale';

  // Source data can be older than the observation that fetched it: a successful
  // request does not make the data behind it current.
  const sourceUpdatedAt = parseInstant(snapshot.sourceUpdatedAt);
  if (sourceUpdatedAt !== null && source && source.maxSourceAgeMs && nowMs - sourceUpdatedAt > source.maxSourceAgeMs) {
    return 'stale';
  }
  return snapshot.status;
}
