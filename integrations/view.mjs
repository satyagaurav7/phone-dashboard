/* Workspace view — the last gate before data reaches a screen.

   Every string goes through textContent. There is no innerHTML in this file and
   there must never be: snapshot text is written by whatever the collector read,
   and the contract stores it verbatim on purpose so the escaping decision lives
   in exactly one place — here.

   Links are re-validated even though the contract already checked them. The
   contract guards what gets stored; this guards what gets clicked, and the two
   can drift when a registry allowlist changes. */

import { SOURCES, REASON_COPY, getSource } from './registry.mjs';
import { displayState } from './contract.mjs';

/** Fixed copy per state. Distinct wording per state is asserted by the tests. */
export const STATE_COPY = {
  ready: 'Ready',
  degraded: 'Needs attention',
  stale: 'Out of date',
  unavailable: 'Not reachable',
  'not-configured': 'Not set up yet',
  'reference-only': 'Reference only',
  'no-data': 'No data yet',
};

const FIXTURE_BADGE = 'Sample data — not live';
const LAPTOP_ONLY = 'Available on laptop';
const LOAD_FAILED = 'Could not load workspace data';

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // never innerHTML
  return node;
};

/** Numbers get thousands separators; booleans read as words, not true/false. */
function formatValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-CA');
  return String(value);
}

/** Last gate on an outbound link. Returns a safe href or null. */
function safeHref(href, allowedHosts) {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (!allowedHosts.includes(url.host)) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * @param {{container:Element, sources?:Array, document?:Document}} options
 * @returns {{render:Function, refresh:Function, clear:Function, dispose:Function}}
 */
export function mountWorkspace({ container, sources = SOURCES, document = globalThis.document }) {
  let last = { snapshots: [], nowMs: 0, fixture: false };

  const badge = el(document, 'p', 'ws-badge', FIXTURE_BADGE);
  const error = el(document, 'p', 'ws-error', LOAD_FAILED);

  // One section per source, built once. Re-render replaces text, not structure,
  // so a failing source cannot tear down its siblings.
  const sections = new Map();
  for (const source of sources) {
    const section = el(document, 'section', 'ws-card');
    section.dataset.source = source.id;
    section.appendChild(el(document, 'h3', 'ws-name', source.label));

    const state = el(document, 'p', 'ws-state', STATE_COPY['no-data']);
    state.dataset.state = '';
    section.appendChild(state);

    const detail = el(document, 'p', 'ws-detail', '');
    const metrics = el(document, 'dl', 'ws-metrics');
    const links = el(document, 'p', 'ws-links');
    section.append(detail, metrics, links);
    sections.set(source.id, { section, state, detail, metrics, links });
  }

  function renderSection(source, snapshot, nowMs) {
    const parts = sections.get(source.id);
    const { state, detail, metrics, links } = parts;

    // Rebuild the variable regions only.
    metrics.replaceChildren();
    links.replaceChildren();
    detail.textContent = '';
    state.dataset.state = '';

    if (!snapshot || typeof snapshot !== 'object' || !snapshot.status) {
      // A reference entry never gets a published snapshot and never will — it
      // is a pointer, not a service. "No data yet" would imply it is pending.
      const fallback = source.mode === 'reference' ? 'reference-only' : 'no-data';
      state.textContent = STATE_COPY[fallback];
      state.dataset.state = fallback;
      return;
    }

    const derived = displayState(snapshot, nowMs);
    state.textContent = STATE_COPY[derived] ?? STATE_COPY['no-data'];
    state.dataset.state = derived;

    if (snapshot.reasonCode && REASON_COPY[snapshot.reasonCode]) {
      detail.textContent = REASON_COPY[snapshot.reasonCode];
    }

    for (const metric of Array.isArray(snapshot.metrics) ? snapshot.metrics : []) {
      const row = el(document, 'div', 'ws-metric');
      row.dataset.metric = String(metric.key ?? '');
      row.append(
        el(document, 'dt', null, String(metric.label ?? '')),
        el(document, 'dd', null, formatValue(metric.value) + (metric.unit ? '' : '')),
      );
      metrics.appendChild(row);
    }

    const usable = (Array.isArray(snapshot.links) ? snapshot.links : [])
      .map(link => ({ label: String(link?.label ?? ''), href: safeHref(link?.href, source.allowedHosts) }))
      .filter(link => link.href);

    if (usable.length) {
      for (const link of usable) {
        const anchor = el(document, 'a', 'ws-link', link.label);
        anchor.setAttribute('href', link.href);
        anchor.setAttribute('rel', 'noopener noreferrer');
        links.appendChild(anchor);
      }
    } else if (source.mode === 'live' && derived !== 'not-configured') {
      // A localhost URL would resolve to the phone itself, so say where it lives
      // rather than shipping a link that is guaranteed to fail.
      links.appendChild(el(document, 'span', 'ws-local', LAPTOP_ONLY));
    }
  }

  function render(snapshots, nowMs, { fixture = false } = {}) {
    last = { snapshots: Array.isArray(snapshots) ? snapshots : [], nowMs, fixture };
    const byId = new Map(last.snapshots.filter(s => s && s.sourceId).map(s => [s.sourceId, s]));

    container.replaceChildren();
    if (fixture) container.appendChild(badge);

    for (const source of sources) {
      const parts = sections.get(source.id);
      try {
        renderSection(source, byId.get(source.id), nowMs);
      } catch {
        // Never let one malformed snapshot blank the whole Workspace.
        parts.state.textContent = STATE_COPY['no-data'];
      }
      container.appendChild(parts.section);
    }
  }

  return {
    render,
    /** Re-render the last data against a fresh clock, for stale transitions. */
    refresh: (nowMs) => render(last.snapshots, nowMs ?? last.nowMs, { fixture: last.fixture }),
    renderError() { container.replaceChildren(error); },
    clear() { last = { snapshots: [], nowMs: 0, fixture: false }; container.replaceChildren(); },
    dispose() { last = { snapshots: [], nowMs: 0, fixture: false }; container.replaceChildren(); },
  };
}
