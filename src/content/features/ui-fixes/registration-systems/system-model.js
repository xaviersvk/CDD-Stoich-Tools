// content/features/ui-fixes/registration-systems/system-model.js
//
// The data side of creating registration systems in bulk: one prefix per
// line, and what a run would do against the systems already in the vault.
// No DOM — checkable with `node`.

export const PLAN_ADD = "add";
export const PLAN_EXISTS = "exists";
export const PLAN_DUPLICATE = "duplicate";
export const PLAN_INVALID = "invalid";

// Every system starts at 1: CDD stores the last number used, and the first
// identifier is one past it.
export const CURRENT_VALUE = 0;

const PREFIX = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function parsePrefixes(text) {
    return String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function planSystems(prefixes, existing) {
    const taken = new Set(existing.map((prefix) => prefix.toLowerCase()));
    const seen = new Set();
    return prefixes.map((prefix) => {
        const key = prefix.toLowerCase();
        if (!PREFIX.test(prefix)) return { prefix, status: PLAN_INVALID, note: "not a valid prefix" };
        if (taken.has(key)) return { prefix, status: PLAN_EXISTS, note: "already in this vault" };
        if (seen.has(key)) return { prefix, status: PLAN_DUPLICATE, note: "listed twice" };
        seen.add(key);
        return { prefix, status: PLAN_ADD, note: "" };
    });
}
