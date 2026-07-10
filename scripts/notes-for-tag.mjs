// scripts/notes-for-tag.mjs <tag>
//
// Prints the RELEASES.md section for a tag as markdown, for `gh release create
// --notes-file`. Exits 1 when RELEASES.md has nothing to say about that tag —
// a release with no notes is a release nobody reads, so publish.yml should fail
// loudly rather than publish an empty one.

import { readReleases, releaseForTag } from "./release-notes.mjs";

const tag = process.argv[2];

if (!tag) {
    console.error("usage: node scripts/notes-for-tag.mjs <tag>");
    process.exit(2);
}

const release = releaseForTag(readReleases("RELEASES.md"), tag);

if (!release) {
    console.error(
        `RELEASES.md has no "## ${String(tag).replace(/^v/, "")} — <date>" section.\n` +
        `Add one before tagging ${tag}.`
    );
    process.exit(1);
}

const repo = "https://github.com/xaviersvk/CDD-Stoich-Tools";

process.stdout.write(
    `${release.body}\n\n---\n\n` +
    `[What's new, all versions](https://xaviersvk.github.io/CDD-Stoich-Tools/) · ` +
    `[Technical changelog](${repo}/blob/main/CHANGELOG.md)\n`
);
