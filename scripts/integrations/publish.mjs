/* Snapshot publisher — the only code that writes to the cloud.

   Runs on the laptop with operator credentials. Two things make it safe:

   1. Firebase Admin BYPASSES security rules. Rules cannot save us here, so the
      path and the payload are both constrained in this file, before the store
      is ever touched. snapshotPath() throws rather than returning a path it is
      not certain about.
   2. Every write goes through a transaction that compares observedAt and
      revision. A read-then-write would let two publishers clobber each other
      and leave the phone showing an older snapshot than it already had.

   Dry run is the default. --apply is the only way to write. */

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getSource } from '../../integrations/registry.mjs';
import { validateSnapshot } from '../../integrations/contract.mjs';
import { validateConfig } from './config.mjs';

/** Namespace root. Owner-scoped so a rule can compare it to request.auth.uid. */
const NAMESPACE = 'integrations';

/**
 * Build the one path this publisher may write, or throw. Never returns a path
 * assembled from unvalidated input.
 */
export function snapshotPath(uid, sourceId) {
  if (typeof uid !== 'string' || uid.length === 0 || uid.length > 128 || /[^A-Za-z0-9_-]/.test(uid)) {
    throw new Error('uid must be a plain identifier with no path characters');
  }
  if (!getSource(sourceId)) {
    throw new Error('sourceId ' + String(sourceId) + ' is not a registered source');
  }
  return 'users/' + uid + '/' + NAMESPACE + '/' + sourceId;
}

/**
 * @param {object} options
 * @param {object[]} options.snapshots  collector output
 * @param {string}   options.uid        owner uid
 * @param {{runTransaction:Function}} options.store injected; Admin adapter in production
 * @param {boolean}  [options.dryRun=true]
 * @param {()=>number} [options.now]
 * @returns {Promise<{dryRun:boolean, written:number, skipped:number, rejected:number, results:object[]}>}
 */
export async function publishSnapshots({ snapshots, uid, store, dryRun = true, now = Date.now }) {
  const results = [];

  for (const candidate of Array.isArray(snapshots) ? snapshots : []) {
    const sourceId = candidate && candidate.sourceId;

    let path;
    try {
      path = snapshotPath(uid, sourceId);
    } catch (error) {
      results.push({ sourceId: String(sourceId), action: 'rejected', reason: 'unregistered-source' });
      continue;
    }

    // Revalidate here even though the collector validated: this process may be
    // reading JSON off disk that something else wrote since.
    const validated = validateSnapshot(candidate, now());
    if (!validated.ok) {
      results.push({ sourceId, action: 'rejected', reason: 'invalid-snapshot', errors: validated.errors });
      continue;
    }
    const value = validated.value; // rebuilt by the contract; no stray keys

    if (dryRun) {
      results.push({ sourceId, action: 'would-write', path });
      continue;
    }

    let action = 'written';
    await store.runTransaction(async tx => {
      const existing = await tx.get(path);
      if (existing) {
        if (existing.revision === value.revision) { action = 'skipped-unchanged'; return; }
        // Equal timestamps count as older: re-publishing the same observation
        // with a new revision is not new information about the source.
        if (Date.parse(existing.observedAt) >= Date.parse(value.observedAt)) {
          action = 'refused-older';
          return;
        }
      }
      action = 'written';
      tx.set(path, value);
    });
    results.push({ sourceId, action, path });
  }

  return {
    dryRun,
    written: results.filter(r => r.action === 'written').length,
    skipped: results.filter(r => r.action === 'skipped-unchanged' || r.action === 'refused-older').length,
    rejected: results.filter(r => r.action === 'rejected').length,
    results,
  };
}

/** Canonical revision, matching collect.mjs. Kept here so a snapshot read off
    disk can be re-hashed and compared without importing the collector. */
export function revisionOf(snapshot) {
  const { revision, ...rest } = snapshot;
  const canonical = v => Array.isArray(v) ? v.map(canonical)
    : (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v);
  return 'sha256-' + createHash('sha256').update(JSON.stringify(canonical(rest))).digest('hex');
}

/* --------------------------------- CLI --------------------------------- */

function parseArgs(argv) {
  const args = { input: null, uid: null, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--uid') args.uid = argv[++i];
    else if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--dry-run') args.apply = false;
  }
  return args;
}

async function main(argv) {
  const { readFile, readdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const args = parseArgs(argv);

  if (!args.input || !args.uid) {
    console.error('usage: node scripts/integrations/publish.mjs --input <dir> --uid <uid> [--apply]');
    console.error('       default is a dry run; --apply is the only way to write.');
    process.exit(2);
  }

  const files = (await readdir(args.input)).filter(f => f.endsWith('.json') && !f.startsWith('.'));
  const snapshots = [];
  for (const file of files) {
    try { snapshots.push(JSON.parse(await readFile(path.join(args.input, file), 'utf8'))); }
    catch { console.error('skipping unreadable ' + file); }
  }

  if (!args.apply) {
    const summary = await publishSnapshots({ snapshots, uid: args.uid, store: null, dryRun: true });
    for (const r of summary.results) console.log(String(r.sourceId).padEnd(18), r.action, r.reason ?? '');
    console.log('\ndry run — nothing written. Re-run with --apply to publish.');
    return;
  }

  // Admin credentials are read from the environment by the caller's own setup;
  // this file never reads, logs, or persists a key. See OPERATIONS.md.
  console.error('--apply requires the Admin store adapter, which is not configured.');
  console.error('See docs/integration/OPERATIONS.md — credentials and Firestore rules are still outstanding.');
  process.exit(1);
}

// Only run the CLI when this file IS the entry point. `endsWith` was true for
// any import, which made `node --test` execute main() and exit the runner.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => { console.error(String(e.message || e)); process.exit(1); });
}
