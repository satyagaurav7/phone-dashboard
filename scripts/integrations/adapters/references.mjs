/* Reference adapter — a pointer, not a probe.

   Anchor Context, AI Memory Portability, Personal Hub and PR documents are
   directories of private material. This adapter NEVER opens them: no read, no
   stat, no directory listing, no file count. Everything it emits comes from the
   registry label, which is a fixed string in this repository.

   That is the whole point. A count of PR documents is still information about
   PR documents, and a Personal Hub file count still leaks how much is in there.
   The honest thing for a reference entry to say is that it exists and where it
   lives — nothing more.

   AI Memory Portability stays reference-only until an actual running service is
   independently verified. A design document is not a connected integration. */

import { getSource } from '../../../integrations/registry.mjs';

export async function collectSource({ sourceId, now }) {
  const source = getSource(sourceId);
  if (!source) throw new Error('references adapter called with an unregistered id');

  const observedMs = now();
  return {
    schemaVersion: 1,
    sourceId,
    observedAt: new Date(observedMs).toISOString(),
    // No filesystem was touched, so there is no source timestamp to report.
    sourceUpdatedAt: null,
    expiresAt: new Date(observedMs + source.ttlMs).toISOString(),
    status: 'reference-only',
    reasonCode: null,
    metrics: [],
    links: [],
  };
}
