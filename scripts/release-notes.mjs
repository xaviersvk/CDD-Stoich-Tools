// scripts/release-notes.mjs
//
// RELEASES.md is the single source of the plain-language history. Two things
// read it through this module, so they can never drift apart:
//
//   - scripts/build-releases-page.mjs  -> the public "What's new" page
//   - .github/workflows/publish.yml    -> the body of each GitHub Release
//
// No dependencies: this runs on a bare `node` in CI.

import { readFileSync } from "node:fs";

// "## 11.0.0 — July 2026", but also the ranges the older history uses:
// "## 8.2.0 / 8.2.1 — June 2026", "## 7.x — May–June 2026", "## 5.x – 6.x — May 2026".
// The separator is an em dash surrounded by spaces; en dashes inside the version
// range must not be mistaken for it.
const HEADING = /^##\s+(.+?)\s+—\s+(.+?)\s*$/;

// A heading names one exact release only when its version part is a bare semver.
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * parseReleases(markdown) -> [{ version, versionLabel, date, lead, body }]
 *
 * `version`      the semver this section documents, or null for a range section
 *                ("7.x") that no single tag can point at.
 * `versionLabel` the heading's version part, verbatim ("8.2.0 / 8.2.1").
 * `lead`         the bold one-liner under the heading, without its ** markers.
 * `body`         the rest of the section as markdown, `---` rules stripped.
 *
 * Newest first, i.e. document order.
 */
export function parseReleases(markdown) {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const releases = [];
    let current = null;

    for (const line of lines) {
        const heading = HEADING.exec(line);

        if (heading) {
            if (current) releases.push(finish(current));
            current = { versionLabel: heading[1], date: heading[2], lines: [] };
            continue;
        }

        // Everything before the first heading is the file's own intro; the page
        // writes its own, and a release body must not inherit it.
        if (!current) continue;

        if (line.trim() === "---") continue; // section separator, not content
        current.lines.push(line);
    }

    if (current) releases.push(finish(current));
    return releases;
}

function finish(section) {
    const body = section.lines.join("\n").trim();

    // The lead is the first paragraph when it is entirely bold.
    const leadMatch = /^\*\*(.+?)\*\*\s*$/s.exec(body.split("\n\n")[0] || "");
    const lead = leadMatch ? leadMatch[1].replace(/\s*\n\s*/g, " ") : null;

    return {
        version: EXACT_VERSION.test(section.versionLabel) ? section.versionLabel : null,
        versionLabel: section.versionLabel,
        date: section.date,
        lead,
        body,
    };
}

export function readReleases(path = "RELEASES.md") {
    return parseReleases(readFileSync(path, "utf8"));
}

/** The section documenting `version` ("11.0.0" or "v11.0.0"), or null. */
export function releaseForTag(releases, tag) {
    const version = String(tag).replace(/^v/, "");
    return releases.find((release) => release.version === version) || null;
}
