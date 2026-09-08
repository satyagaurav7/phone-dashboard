/* Workspace controller — wiring only.

   Owns the subscription lifetime and the re-render clock. It holds no snapshot
   state of its own beyond what the view already has, so signing out or leaving
   Workspace genuinely drops the data rather than parking it in a closure. */

const DEFAULT_TICK_MS = 30_000;

/**
 * @param {object} options
 * @param {{render:Function, refresh:Function, renderError:Function, dispose:Function}} options.view
 * @param {(onSnapshots:Function, onError:Function)=>Function} options.subscribe returns unsubscribe
 * @param {()=>number} options.now
 * @param {(fn:Function)=>Function} [options.tick] injectable ticker; returns a stop function
 * @param {boolean} [options.fixture] stamps the sample-data badge
 * @returns {()=>void} cleanup — idempotent
 */
export function startWorkspace({ view, subscribe, now, tick, fixture = false, tickMs = DEFAULT_TICK_MS }) {
  let stopped = false;

  const unsubscribe = subscribe(
    snapshots => { if (!stopped) view.render(snapshots, now(), { fixture }); },
    // The transport's error text can name a uid or a Firestore path, so it is
    // dropped here rather than passed to the view.
    () => { if (!stopped) view.renderError(); },
  );

  // Expiry is a clock event, not a data event: without this a card sits on
  // "Ready" forever after the laptop goes to sleep.
  const startTicker = tick ?? (fn => {
    const id = setInterval(fn, tickMs);
    if (typeof id === 'object' && typeof id.unref === 'function') id.unref();
    return () => clearInterval(id);
  });
  const stopTicker = startTicker(() => { if (!stopped) view.refresh(now()); });

  return function cleanup() {
    if (stopped) return;
    stopped = true;
    if (typeof stopTicker === 'function') stopTicker();
    if (typeof unsubscribe === 'function') unsubscribe();
    view.dispose();
  };
}
