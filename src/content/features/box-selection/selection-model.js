// content/features/box-selection/selection-model.js
//
// PURE selection state for a single box grid. No DOM. No network. No CDD
// knowledge. This is deliberately separated from the overlay so that:
//   - it can be unit-tested in isolation (the repo's stated weak spot is "no
//     tests"; this module is written to be the easy first test target), and
//   - the rendering layer (overlay.js) can be rewritten without touching the
//     rules of what "selected" means.
//
// Positions are stored as STRINGS (the grid label is a string like "43"), so a
// caller that passes 43 and another that passes "43" address the same well.
//
// What it must NOT do
//   - Touch the DOM, read CDD, or decide whether a well is *selectable*
//     (empty vs occupied). Selectability is a DOM concern and lives in the
//     overlay. The model only records what the overlay told it to select.
//
// Connects to: overlay.js creates one model per attached grid and subscribes to
// onChange() to repaint and to forward changes to the consumer.

export function createSelectionModel() {
    const selected = new Set();
    const listeners = new Set();

    function key(position) {
        return String(position);
    }

    function emit() {
        const snapshot = getSelectedPositions();
        for (const cb of listeners) {
            // Never let one bad listener break the others or the caller.
            try {
                cb(snapshot);
            } catch (err) {
                console.warn("[CDD box-selection] onChange listener failed", err);
            }
        }
    }

    function has(position) {
        return selected.has(key(position));
    }

    function select(position) {
        const k = key(position);
        if (selected.has(k)) return false;
        selected.add(k);
        emit();
        return true;
    }

    function deselect(position) {
        const k = key(position);
        if (!selected.delete(k)) return false;
        emit();
        return true;
    }

    function toggle(position) {
        return has(position) ? (deselect(position), false) : (select(position), true);
    }

    function clear() {
        if (selected.size === 0) return;
        selected.clear();
        emit();
    }

    function count() {
        return selected.size;
    }

    // Returns a stable array of position strings. Sorted numerically when every
    // entry is numeric (the common box case), otherwise lexically — so consumers
    // and progress UIs get a predictable order.
    function getSelectedPositions() {
        const arr = Array.from(selected);
        const allNumeric = arr.every((p) => /^\d+$/.test(p));
        return allNumeric
            ? arr.sort((a, b) => Number(a) - Number(b))
            : arr.sort();
    }

    // Replace the whole selection in one shot (e.g. future rectangle/drag
    // select). Emits once. No-op (no emit) if the set is unchanged.
    function replaceSelection(positions) {
        const next = new Set((positions || []).map(key));
        if (next.size === selected.size && [...next].every((k) => selected.has(k))) {
            return;
        }
        selected.clear();
        for (const k of next) selected.add(k);
        emit();
    }

    // Subscribe to changes. Returns an unsubscribe function.
    function onChange(callback) {
        if (typeof callback !== "function") return () => {};
        listeners.add(callback);
        return () => listeners.delete(callback);
    }

    return {
        has,
        select,
        deselect,
        toggle,
        clear,
        count,
        getSelectedPositions,
        replaceSelection,
        onChange,
    };
}
