// content/utils/format.js

// Collapse runs of whitespace into single spaces and trim. Used when comparing
// or fuzzy-matching user-visible text (sample names, depleted identifiers, …).
export function normalizeValue(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}
