// content/features/multi-position-sample-create/selection-store.js
//
// Persistent selection state for the multi-position feature, decoupled from any
// DOM. This is the bridge that lets selection SURVIVE the Pick Location dialog
// closing: the box grid (and its SelectionContext) are destroyed when the picker
// closes, but the chosen positions live here, so the action bar in the Create
// Sample dialog can still use them.
//
// Lifecycle:
//   - The picker's SelectionContext pushes its positions here on every change.
//   - The Create Sample dialog's action bar reads here and subscribes to changes.
//   - Cleared when a fresh Create Sample dialog opens (new session).
//
// What it must NOT do: DOM, network, payload mutation. Pure state + pub/sub.

const LOG = "[CDD multi-position store]";
const DEBUG = true; // temporary propagation diagnostics

let positions = [];
let boxId = null;
const listeners = new Set();

function emit() {
    const snap = getState();
    if (DEBUG) {
        console.log(
            `[CDD multi-position] (10) selection-store emit -> ${listeners.size} listener(s)`,
            snap
        );
    }
    for (const cb of listeners) {
        try {
            cb(snap);
        } catch (err) {
            console.warn("[CDD multi-position] store listener failed", err);
        }
    }
}

export function getListenerCount() {
    return listeners.size;
}

export function getState() {
    return { positions: positions.slice(), boxId, count: positions.length };
}

export function getPositions() {
    return positions.slice();
}

export function getBoxId() {
    return boxId;
}

export function setPositions(next) {
    const arr = (next || []).map(String);
    const same =
        arr.length === positions.length && arr.every((p, i) => p === positions[i]);
    if (DEBUG) {
        console.log("[CDD multi-position] (9) selection-store setPositions", {
            selectedPositions: arr,
            count: arr.length,
            boxId,
            listenerCount: listeners.size,
            changed: !same,
        });
    }
    if (same) return;
    positions = arr;
    emit();
}

export function setBoxId(id) {
    if (id != null && String(id) !== String(boxId)) {
        boxId = String(id);
        if (DEBUG) console.log(`${LOG} setBoxId(${boxId})`);
        emit();
    }
}

export function clear() {
    if (positions.length === 0 && boxId == null) return;
    if (DEBUG) console.log(`${LOG} clear()`);
    positions = [];
    boxId = null;
    emit();
}

export function onChange(cb) {
    if (typeof cb !== "function") return () => {};
    listeners.add(cb);
    return () => listeners.delete(cb);
}
