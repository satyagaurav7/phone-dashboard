/* Graphify adapter — graph size only.

   graphify-out/graph.json is read for two integers and nothing else. The graph
   itself is never published: not the node labels, not the inferred edges, not
   the community names.

   graphify-out/manifest.json is deliberately NOT read. Its keys are ABSOLUTE
   LOCAL PATHS (C:\Users\...\Projects\encore\src\audit.mjs and so on), so every
   key is a filesystem disclosure. Counts come from graph.json instead.

   Per the workspace rules, graphify output is navigation evidence, not proof
   that an inferred edge is a real dependency — so `edgeCount` is a size, not a
   claim about the codebase. */

import { getSource } from '../../../integrations/registry.mjs';
import { readJsonFile, SIZE_CAPS } from '../bounded.mjs';

const SOURCE_ID = 'graphify';

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

  if (!config || typeof config.graphPath !== 'string') {
    return { ...base, sourceUpdatedAt: null, status: 'not-configured', reasonCode: 'not-configured', metrics: [] };
  }

  const read = await readJsonFile({ readFile, stat }, config.graphPath, { maxBytes: SIZE_CAPS.graph });
  if (!read.ok) {
    // A graph over the 10 MiB cap reports bounded rather than being streamed:
    // no part of a graph that large needs to reach a phone.
    return { ...base, sourceUpdatedAt: null, status: 'unavailable', reasonCode: read.reasonCode, metrics: [] };
  }

  const graph = read.data;
  const nodes = graph && Array.isArray(graph.nodes) ? graph.nodes.length : null;
  const links = graph && Array.isArray(graph.links) ? graph.links.length
    : (graph && Array.isArray(graph.edges) ? graph.edges.length : null);

  if (nodes === null || links === null) {
    return { ...base, sourceUpdatedAt: null, status: 'unavailable', reasonCode: 'invalid-data', metrics: [] };
  }

  const generatedAt = read.mtimeMs > 0 ? new Date(read.mtimeMs).toISOString() : null;

  return {
    ...base,
    // A graph regenerated weeks ago describes a codebase that has moved on. The
    // registry's maxSourceAgeMs turns that into a visible stale state.
    sourceUpdatedAt: generatedAt,
    status: 'ready',
    reasonCode: null,
    metrics: [
      { key: 'nodeCount', label: 'Nodes', value: nodes, unit: 'count' },
      { key: 'edgeCount', label: 'Edges', value: links, unit: 'count' },
      ...(generatedAt ? [{ key: 'generatedAt', label: 'Graph built', value: generatedAt.slice(0, 10), unit: null }] : []),
    ],
  };
}
