/* Local snapshot collector.

   Runs on the laptop, never in the browser and never in CI. It hashes, validates
   and writes one JSON file per source. It performs no cloud writes: publication
   is a separate, explicit step (T6). Default mode is preview, so an accidental
   run cannot put anything on disk.

   Deliberately absent: shell commands, recursive workspace scanning, source
   mutation, and process launching. */

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { validateSnapshot } from '../../integrations/contract.mjs';
import { validateConfig, validateOutDir } from './config.mjs';
import { collectSource as encore } from './adapters/encore.mjs';
import { collectSource as trading } from './adapters/trading.mjs';

export const ADAPTERS = { encore, 'ai-trading-lab': trading };

/** Max sources in flight. Two keeps a laptop responsive and bounds the blast radius. */
const MAX_CONCURRENCY = 2;

/** Recursively key-sorted copy. Arrays keep their order — it carries meaning. */
export function canonicalise(value) {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonicalise(value[k])]));
  }
  return value;
}

/** Canonical SHA-256 over everything except `revision` itself. */
export function revisionOf(snapshot) {
  const { revision, ...rest } = snapshot;
  return 'sha256-' + createHash('sha256').update(JSON.stringify(canonicalise(rest))).digest('hex');
}

/** Run tasks with a fixed ceiling on concurrency. */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * @returns {Promise<Array<{sourceId:string, ok:boolean, snapshot?:object, reasonCode?:string, errors?:string[]}>>}
 */
export async function collectAll({ config, adapters = ADAPTERS, fetch, readFile, now }) {
  const ids = Object.keys(config.sources);

  return mapLimit(ids, MAX_CONCURRENCY, async id => {
    const adapter = adapters[id];
    if (!adapter) return { sourceId: id, ok: false, reasonCode: 'not-configured' };

    let raw;
    try {
      raw = await adapter({ config: config.sources[id], fetch, readFile, now });
    } catch {
      // The adapter's exception text is dropped on purpose: it is the most
      // likely carrier of local paths and credentials.
      return { sourceId: id, ok: false, reasonCode: 'unreachable' };
    }

    const withRevision = { ...raw, revision: revisionOf(raw) };
    const validated = validateSnapshot(withRevision, now());
    if (!validated.ok) {
      return { sourceId: id, ok: false, reasonCode: 'invalid-data', errors: validated.errors };
    }
    return { sourceId: id, ok: true, snapshot: validated.value };
  });
}

/**
 * Pure write plan. Separated from the filesystem so the atomic-rename contract
 * is testable without touching disk.
 * @param {string|null} outDir null means preview: plan nothing.
 */
export function planWrites(results, outDir) {
  if (!outDir) return [];
  return results
    .filter(r => r.snapshot) // a failed observation still writes, if it produced one
    .map(r => {
      const finalPath = path.join(outDir, r.sourceId + '.json');
      return {
        sourceId: r.sourceId,
        finalPath,
        // Same directory, therefore same volume, so rename is atomic.
        tempPath: path.join(outDir, '.' + r.sourceId + '.json.tmp'),
        body: JSON.stringify(r.snapshot, null, 2) + '\n',
      };
    });
}

/* --------------------------------- CLI --------------------------------- */

function parseArgs(argv) {
  const args = { config: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--config') args.config = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

async function main(argv) {
  const { readFile, writeFile, rename, mkdir } = await import('node:fs/promises');
  const args = parseArgs(argv);
  if (!args.config) {
    console.error('usage: node scripts/integrations/collect.mjs --config <file> [--out <dir>]');
    console.error('       without --out the collector previews and writes nothing.');
    process.exit(2);
  }

  const parsed = validateConfig(JSON.parse(await readFile(args.config, 'utf8')));
  if (!parsed.ok) { console.error(parsed.errors.join('\n')); process.exit(1); }

  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
  if (args.out) {
    const outCheck = validateOutDir(args.out, { repoRoot, sourceRoots: [] });
    if (!outCheck.ok) { console.error(outCheck.errors.join('\n')); process.exit(1); }
    await mkdir(args.out, { recursive: true });
  }

  const results = await collectAll({ config: parsed.value, fetch, readFile, now: Date.now });

  for (const w of planWrites(results, args.out)) {
    await writeFile(w.tempPath, w.body, 'utf8');
    await rename(w.tempPath, w.finalPath);
  }

  // Statuses and counts only — never the snapshot bodies.
  for (const r of results) {
    console.log(r.sourceId.padEnd(16), r.ok ? r.snapshot.status : 'failed:' + r.reasonCode,
      r.ok ? '(' + r.snapshot.metrics.length + ' metrics)' : '');
  }
  console.log(args.out ? 'wrote ' + planWrites(results, args.out).length + ' snapshot(s) to ' + args.out : 'preview only — nothing written');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => { console.error(String(e.message || e)); process.exit(1); });
}
