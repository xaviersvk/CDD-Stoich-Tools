// content/features/write-lock.js
//
// One writer at a time in the stoichiometry table.
//
// Every fill drives CDD's real editor: click the row, click the field, type
// into the popup, press Enter. Two of those overlapping do not interleave —
// they collide. The second click lands while the first popup is open, both
// read back a value that is not theirs, and BOTH report failure over a table
// that may well have taken one of the writes.
//
// That became reachable the moment the row name got two writers: name-watch.js
// off the table, and auto-fill.js off the payload. The panel's own buttons and
// "Fill all" are a third and a fourth. They all pass through here now, so the
// order they arrive in is the order they run in.

let tail = Promise.resolve();

/**
 * runExclusive(fn) -> Promise<whatever fn returns>
 *
 * Queues fn behind every call already waiting. A rejection is contained: it
 * propagates to ITS caller and leaves the queue running for the next one.
 */
export function runExclusive(fn) {
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
}
