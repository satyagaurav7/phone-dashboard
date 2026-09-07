// T1 — deployment artifact boundary.
//
// The deploy workflow used to upload `path: .`, publishing every tracked file
// to a public GitHub Pages site, including root planning documents that hold
// personal schedule, grocery, health and money detail. These tests pin the
// opposite behaviour: the published artifact is an explicit reviewed manifest,
// and anything not on it must not appear in the artifact.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODULE_PATH = new URL('../scripts/build-site.mjs', import.meta.url);

async function loadBuildSite() {
  const module = await import(MODULE_PATH.href);
  assert.equal(
    typeof module.buildSite,
    'function',
    'scripts/build-site.mjs must export a buildSite function',
  );
  return module.buildSite;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// A synthetic source tree shaped like the real repository: the app shell plus
// the kinds of files that must never be published.
async function makeSourceTree({ omit = [] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'flowstate-build-'));

  const shell = {
    '.nojekyll': '',
    'index.html': '<!doctype html><title>FLOWSTATE</title>',
    'sw.js': '// service worker',
    'manifest.json': '{"name":"FLOWSTATE"}',
    'schedule.json': '{"days":[]}',
    'rules.mjs': 'export const ok = true;',
    'chores.mjs': 'export const ok = true;',
    'ui/midnight.css': 'body{}',
    'ui/midnight.mjs': 'export const ok = true;',
    'assets/filament.svg': '<svg/>',
    'fonts/newsreader.woff2': 'WOFF2',
    'icons/icon-192.png': 'PNG',
    'icons/icon-512.png': 'PNG',
    'moods/default.svg': '<svg/>',
    'tools/mood-measure.html': '<!doctype html>',
    'tools/mood-sixup.html': '<!doctype html>',
  };

  // Must never reach the artifact.
  const private_ = {
    '.env': 'FIREBASE_TOKEN=should-never-ship',
    '.git/config': '[remote "origin"]',
    'docs/private.md': 'internal planning',
    'scripts/private.json': '{"secret":true}',
    'runtime/snapshot.json': '{"snapshot":true}',
    'SCHEDULE.md': 'weekly schedule with personal detail',
    'GROCERY-LIST.md': 'grocery detail',
    'MONEY-SAVING-TOOLKIT.md': 'financial detail',
    'tools/README.md': 'internal harness notes',
    'node_modules/left-pad/index.js': 'module.exports = 1;',
  };

  for (const [relative, contents] of Object.entries({ ...shell, ...private_ })) {
    if (omit.includes(relative)) continue;
    const full = join(root, relative);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, contents);
  }

  return { root, shell: Object.keys(shell), private: Object.keys(private_) };
}

test('copies every approved shell asset into the staging directory', async (t) => {
  const buildSite = await loadBuildSite();
  const { root, shell } = await makeSourceTree();
  const outDir = join(root, '..', `out-${Date.now()}-shell`);
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outDir, { recursive: true, force: true })]));

  await buildSite({ root, outDir });

  for (const relative of shell) {
    assert.ok(await exists(join(outDir, relative)), `expected ${relative} in the artifact`);
  }
});

test('never copies private, internal or Markdown files', async (t) => {
  const buildSite = await loadBuildSite();
  const { root, private: privateFiles } = await makeSourceTree();
  const outDir = join(root, '..', `out-${Date.now()}-private`);
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outDir, { recursive: true, force: true })]));

  await buildSite({ root, outDir });

  for (const relative of privateFiles) {
    assert.equal(
      await exists(join(outDir, relative)),
      false,
      `${relative} must not be published`,
    );
  }
});

test('fails clearly when a required shell asset is missing', async (t) => {
  const buildSite = await loadBuildSite();
  const { root } = await makeSourceTree({ omit: ['manifest.json'] });
  const outDir = join(root, '..', `out-${Date.now()}-missing`);
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outDir, { recursive: true, force: true })]));

  await assert.rejects(
    () => buildSite({ root, outDir }),
    (error) => {
      assert.match(error.message, /manifest\.json/, 'error must name the missing asset');
      return true;
    },
  );
});

test('refuses an output directory equal to the source root', async (t) => {
  const buildSite = await loadBuildSite();
  const { root } = await makeSourceTree();
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    () => buildSite({ root, outDir: root }),
    (error) => {
      assert.match(error.message, /output directory/i, 'error must explain the rejection');
      return true;
    },
  );
});
