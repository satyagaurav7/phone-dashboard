/* Bounded HTTP read shared by the adapters.

   Every failure becomes a fixed reason code. Raw exception text is deliberately
   dropped here rather than in each adapter, because that text is exactly what
   carries file paths, API keys and stack frames off the laptop.

   Returns a result object instead of throwing: an adapter that must stay
   bounded should not have to remember a try/catch. */

/** Never read a body before the declared length has been checked against this. */
export const SIZE_CAPS = {
  productFeed: 25 * 1024 * 1024, // Encore ships ~38k lots
  health: 128 * 1024,
  ledger: 4 * 1024 * 1024,
  graph: 10 * 1024 * 1024,
};

export const REQUEST_TIMEOUT_MS = 5000;

/**
 * @returns {Promise<{ok:true,data:unknown}|{ok:false,reasonCode:string}>}
 */
export async function getJson(fetchImpl, url, { maxBytes, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      // redirect:'error' keeps a compromised or misconfigured local service from
      // bouncing the collector at an arbitrary host.
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error && error.name;
    return { ok: false, reasonCode: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable' };
  }

  if (response.status === 404) return { ok: false, reasonCode: 'missing-file' };
  if (!response.ok) return { ok: false, reasonCode: 'unreachable' };

  // Size-check before materialising. A 25 MiB product feed read into a string
  // by accident is the difference between a bounded collector and an OOM.
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reasonCode: 'invalid-data' };

  let text;
  try {
    text = await response.text();
  } catch {
    return { ok: false, reasonCode: 'invalid-data' };
  }
  if (text.length > maxBytes) return { ok: false, reasonCode: 'invalid-data' };

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, reasonCode: 'invalid-data' };
  }
}

/**
 * Read and parse a JSON file with a hard size cap, checked from stat before the
 * bytes are read. A missing file is `missing-file`, not an error the user has to
 * go and fix: an unconfigured optional source is a normal state.
 *
 * @returns {Promise<{ok:true,data:unknown,mtimeMs:number}|{ok:false,reasonCode:string}>}
 */
export async function readJsonFile({ readFile, stat }, filePath, { maxBytes }) {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return { ok: false, reasonCode: 'missing-file' };
  }
  if (!info || typeof info.size !== 'number') return { ok: false, reasonCode: 'missing-file' };
  if (info.size > maxBytes) return { ok: false, reasonCode: 'invalid-data' };

  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    return { ok: false, reasonCode: 'missing-file' };
  }
  try {
    return { ok: true, data: JSON.parse(text), mtimeMs: Number(info.mtimeMs) || 0 };
  } catch {
    return { ok: false, reasonCode: 'invalid-data' };
  }
}

/** Trim to the contract's display cap without throwing on non-strings. */
export const capped = (value, max = 160) =>
  typeof value === 'string' ? value.slice(0, max) : null;

/** Base URL joiner that cannot be talked into another host by a path. */
export function endpoint(baseUrl, path) {
  const url = new URL(path, baseUrl);
  if (url.origin !== new URL(baseUrl).origin) throw new Error('endpoint escaped the configured origin');
  return url.href;
}
