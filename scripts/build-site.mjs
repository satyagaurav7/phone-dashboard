// T1 — deployment artifact boundary.
//
// Builds the published GitHub Pages artifact from an explicit reviewed
// manifest. This replaces `path: .` in the deploy workflow, which uploaded the
// entire repository — including root planning documents containing personal
// schedule, grocery, health and money detail — to a public site.
//
// The manifest is a list of reviewed paths. It is never a recursive scan of the
// repository root: a new file only becomes public when someone adds it here.
//
// Usage: node scripts/build-site.mjs --out _site

import { cp, mkdir, access, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Reviewed public manifest. Directory entries (icons, moods) hold only image
// assets. Everything else is named file by file — note that `tools/` is not a
// directory entry, so tools/README.md stays internal.
export const PUBLIC_FILES = [
  '.nojekyll',
  'index.html',
  'sw.js',
  'manifest.json',
  'schedule.json',
  'rules.mjs',
  'chores.mjs',
  'day-plan.mjs',
  'ui/midnight.css',
  'ui/midnight.mjs',
  'assets/filament.svg',
  'fonts/newsreader.woff2',
  'icons',
  'moods',
  'tools/mood-measure.html',
  'tools/mood-sixup.html',
];

// Without these the deployed site is broken, so a missing one fails the build
// rather than publishing a half-working shell.
export const REQUIRED_FILES = [
  'index.html', 'sw.js', 'manifest.json', 'schedule.json', 'rules.mjs', 'chores.mjs', 'day-plan.mjs',
  'ui/midnight.css', 'ui/midnight.mjs', 'assets/filament.svg', 'fonts/newsreader.woff2',
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function buildSite({ root, outDir }) {
  const sourceRoot = resolve(root);
  const target = resolve(outDir);

  if (sourceRoot === target) {
    throw new Error(
      `output directory must not be the source root (${target}); pass a separate staging directory`,
    );
  }

  for (const relative of REQUIRED_FILES) {
    if (!(await exists(join(sourceRoot, relative)))) {
      throw new Error(`required shell asset missing: ${relative}`);
    }
  }

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  const copied = [];
  for (const relative of PUBLIC_FILES) {
    const source = join(sourceRoot, relative);
    if (!(await exists(source))) continue; // optional entries stay optional
    await mkdir(resolve(join(target, relative), '..'), { recursive: true });
    await cp(source, join(target, relative), { recursive: true });
    copied.push(relative);
  }

  return { outDir: target, copied };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-site.mjs')) {
  const outIndex = process.argv.indexOf('--out');
  if (outIndex === -1 || !process.argv[outIndex + 1]) {
    console.error('usage: node scripts/build-site.mjs --out <directory>');
    process.exit(2);
  }
  const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const { outDir, copied } = await buildSite({ root, outDir: process.argv[outIndex + 1] });
  console.log(`built ${copied.length} manifest entries into ${outDir}`);
}
