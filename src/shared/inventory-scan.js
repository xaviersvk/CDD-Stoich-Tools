// shared/inventory-scan.js — the DEFAULTS behind the "Scan racks" panel in
// CDD's Edit Locations dialog:
//
//   columns / rows   the grid a scanned rack gets; 12 x 8 is an SBS rack
//   organized        whether the box has numbered positions at all
//
// Defaults, not values. One shelf is SBS racks and the next is 10 x 10 trays,
// and that is a property of the shelf in front of you, not a setting to flip
// back and forth — so the panel copies these when it opens and edits its OWN
// copy for that batch, never writing back here. Same rule as the HPLC block;
// see shared/hplc-injection.js.
//
// DOM-free: the content script reads the sync cache, the options page uses the
// async pair.

export const INVENTORY_SCAN_ENABLED_KEY = "cddInventoryScanEnabled";
export const INVENTORY_SCAN_COLUMNS_KEY = "cddInventoryScanColumns";
export const INVENTORY_SCAN_ROWS_KEY = "cddInventoryScanRows";
export const INVENTORY_SCAN_ORGANIZED_KEY = "cddInventoryScanOrganized";

// OFF after installing. The button lives in a vault-admin dialog most people
// never open; nobody's dialog should sprout a control because they upgraded.
export const DEFAULT_INVENTORY_SCAN_ENABLED = false;

// An SBS rack is 12 across and 8 down.
export const DEFAULT_INVENTORY_SCAN_COLUMNS = 12;
export const DEFAULT_INVENTORY_SCAN_ROWS = 8;
export const DEFAULT_INVENTORY_SCAN_ORGANIZED = true;

// Our own sanity guard, not a CDD limit. A side outside this range is a typo
// or a stray scan, and 100 x 100 positions is already far past any rack.
export const MIN_BOX_SIDE = 1;
export const MAX_BOX_SIDE = 100;

export function sanitizeBoxSide(raw, fallback) {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n < MIN_BOX_SIDE || n > MAX_BOX_SIDE) return fallback;
    return n;
}

export function sanitizeColumns(raw) {
    return sanitizeBoxSide(raw, DEFAULT_INVENTORY_SCAN_COLUMNS);
}

export function sanitizeRows(raw) {
    return sanitizeBoxSide(raw, DEFAULT_INVENTORY_SCAN_ROWS);
}

const KEYS = [
    INVENTORY_SCAN_ENABLED_KEY,
    INVENTORY_SCAN_COLUMNS_KEY,
    INVENTORY_SCAN_ROWS_KEY,
    INVENTORY_SCAN_ORGANIZED_KEY,
];

function readSettings(stored) {
    return {
        enabled: stored?.[INVENTORY_SCAN_ENABLED_KEY] === true,
        columns: sanitizeColumns(stored?.[INVENTORY_SCAN_COLUMNS_KEY]),
        rows: sanitizeRows(stored?.[INVENTORY_SCAN_ROWS_KEY]),
        // Organized is the default, so only an explicit false turns it off.
        organized: stored?.[INVENTORY_SCAN_ORGANIZED_KEY] !== false,
    };
}

export async function loadInventoryScanSettings() {
    try {
        return readSettings(await chrome.storage.local.get(KEYS));
    } catch {
        return readSettings(null);
    }
}

async function put(key, value) {
    try {
        await chrome.storage.local.set({ [key]: value });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

export async function saveInventoryScanEnabled(value) {
    await put(INVENTORY_SCAN_ENABLED_KEY, value === true);
}

export async function saveInventoryScanColumns(value) {
    await put(INVENTORY_SCAN_COLUMNS_KEY, sanitizeColumns(value));
}

export async function saveInventoryScanRows(value) {
    await put(INVENTORY_SCAN_ROWS_KEY, sanitizeRows(value));
}

export async function saveInventoryScanOrganized(value) {
    await put(INVENTORY_SCAN_ORGANIZED_KEY, value === true);
}

let cached = readSettings(null);
let listenerAttached = false;
const changeListeners = new Set();

function notify() {
    for (const cb of changeListeners) {
        try {
            cb(cached);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

export function inventoryScanSettings() {
    return { ...cached };
}

export function isInventoryScanEnabled() {
    return cached.enabled;
}

export function onInventoryScanChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initInventoryScan() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") return;
            if (!KEYS.some((key) => key in changes)) return;
            loadInventoryScanSettings().then((settings) => {
                cached = settings;
                notify();
            });
        });
    }
    cached = await loadInventoryScanSettings();
    notify();
    return inventoryScanSettings();
}
