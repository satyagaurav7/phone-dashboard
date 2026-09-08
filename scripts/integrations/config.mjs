/* Operator config validation.

   Base URLs are trusted operator input and must never be editable from a cloud
   snapshot — this file is the only place they enter the collector. The output
   directory is validated separately because writing snapshots into the repo
   would put private runtime data into the published Pages artifact. */

import path from 'node:path';
import { getSource } from '../../integrations/registry.mjs';

/**
 * @param {unknown} raw parsed JSON from --config
 * @returns {{ok:true,value:{sources:Record<string,{baseUrl:string}>}}|{ok:false,errors:string[]}}
 */
export function validateConfig(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['config: must be an object'] };
  }
  const sources = raw.sources;
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
    return { ok: false, errors: ['config.sources: must be an object'] };
  }
  const ids = Object.keys(sources);
  // An empty config that silently collects nothing looks like success and is
  // worse than an error, so it is one.
  if (ids.length === 0) return { ok: false, errors: ['config.sources: no sources configured'] };

  const value = { sources: {} };
  for (const id of ids) {
    if (!getSource(id)) { errors.push('config.sources.' + id + ': not a registered source'); continue; }
    const entry = sources[id];
    if (!entry || typeof entry !== 'object') { errors.push('config.sources.' + id + ': must be an object'); continue; }

    let url;
    try { url = new URL(entry.baseUrl); }
    catch { errors.push('config.sources.' + id + '.baseUrl: not a valid URL'); continue; }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      errors.push('config.sources.' + id + '.baseUrl: must be http or https');
      continue;
    }
    if (url.username || url.password) {
      errors.push('config.sources.' + id + '.baseUrl: must not carry credentials');
      continue;
    }
    // A base URL with a path can be walked upward by a relative endpoint; the
    // adapters only ever join absolute /api paths, so require a bare origin.
    if (url.pathname !== '/' || url.search || url.hash) {
      errors.push('config.sources.' + id + '.baseUrl: must be a bare origin');
      continue;
    }
    value.sources[id] = { baseUrl: url.origin };
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

const isInside = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/**
 * Snapshots hold private runtime data and must live outside the repository and
 * outside every source tree.
 * @returns {{ok:true}|{ok:false,errors:string[]}}
 */
export function validateOutDir(outDir, { repoRoot, sourceRoots = [] }) {
  const errors = [];
  const resolved = path.resolve(outDir);

  if (isInside(path.resolve(repoRoot), resolved)) {
    errors.push('--out: must not be inside the repository (it would be published)');
  }
  for (const root of sourceRoots) {
    if (isInside(path.resolve(root), resolved)) {
      errors.push('--out: must not be inside source root ' + root);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}
