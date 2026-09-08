/* Browser transport — reads published snapshots and revalidates every one.

   Firestore documents are treated as untrusted input. Admin bypasses security
   rules when writing, so "it is in the database" proves nothing about shape;
   a document could have been written by an older publisher, a buggy one, or a
   compromised one. Everything is put back through the contract before the view
   sees it, and anything that fails is dropped rather than patched.

   `listen` is injected so this file has no Firebase import and stays testable.
   index.html supplies the real one; see firestoreListen() below for the shape. */

import { validateSnapshot } from './contract.mjs';

/** Collection holding one document per source, owned by a single uid. */
export const namespaceFor = uid => 'users/' + uid + '/integrations';

/**
 * @param {object} options
 * @param {string} options.uid
 * @param {(path:string, onDocs:Function, onErr:Function)=>Function} options.listen
 * @param {(snapshots:object[])=>void} options.onSnapshots
 * @param {()=>void} options.onError called with no argument, deliberately
 * @param {number}  [options.nowMs] fixed clock for tests
 * @returns {()=>void} unsubscribe — idempotent
 */
export function subscribeSnapshots({ uid, listen, onSnapshots, onError, nowMs }) {
  let stopped = false;

  const unsubscribe = listen(
    namespaceFor(uid),
    docs => {
      if (stopped) return;
      const clock = typeof nowMs === 'number' ? nowMs : Date.now();
      const valid = [];
      for (const doc of Array.isArray(docs) ? docs : []) {
        const result = validateSnapshot(doc, clock);
        // A stored document that fails the contract is dropped entirely. It is
        // not repaired and not partially rendered: the view would otherwise
        // show a half-trusted card that looks the same as a real one.
        if (result.ok) valid.push(result.value);
      }
      onSnapshots(valid);
    },
    () => {
      if (stopped) return;
      // Called with no argument on purpose. A Firestore error names the uid and
      // the denied path, and that must not reach a rendered string.
      onError();
    },
  );

  return function stop() {
    if (stopped) return;
    stopped = true;
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}

/**
 * Build a `listen` from the Firestore SDK. Kept separate so the module above
 * imports nothing from Firebase and can be tested without it.
 *
 * Wiring this into index.html is a deliberate one-line change that must wait
 * until the integration rules are deployed — see docs/integration/OPERATIONS.md.
 * Before that, every read is denied and the Workspace would show a permanent
 * error instead of its current honest "No data yet".
 *
 * @example
 *   const listen = firestoreListen({ db, collection, onSnapshot });
 *   subscribeSnapshots({ uid, listen, onSnapshots, onError });
 */
export function firestoreListen({ db, collection, onSnapshot }) {
  return (path, onDocs, onErr) => onSnapshot(
    collection(db, path),
    querySnapshot => onDocs(querySnapshot.docs.map(d => d.data())),
    onErr,
  );
}
