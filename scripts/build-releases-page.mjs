// scripts/build-releases-page.mjs
//
// Renders RELEASES.md into the public "What's new" page published by GitHub
// Pages (.github/workflows/pages.yml). Output: site/index.html + site/style.css.
//
// Deliberately dependency-free -- no markdown library. RELEASES.md uses a small,
// known subset (bold, code, links, bullet lists, blockquotes, paragraphs) and a
// 60-line renderer for exactly that subset beats a dependency we would have to
// keep on a leash. `npm run build:page` fails loudly on anything unexpected.

import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readReleases } from "./release-notes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const REPO = "https://github.com/xaviersvk/CDD-Stoich-Tools";
const CHROME_STORE =
    "https://chromewebstore.google.com/detail/cdd-stoichiometric-table/ghbhjmmmgejokgekdcbcmgcfaoddlffg";
const FIREFOX_STORE =
    "https://addons.mozilla.org/en-GB/firefox/addon/cdd-stoichiometric-table-tools/";

/* ------------------------------------------------------------ markdown ---- */

const escapeHtml = (text) =>
    text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

// Inline: `code`, **bold**, [text](url). Code spans are pulled out first so
// their contents are never read as bold or as a link. The placeholder is plain
// ASCII -- no control characters, which git would take for a binary file -- and
// carries a marker no prose in RELEASES.md contains.
function renderInline(markdown) {
    const codeSpans = [];

    let html = markdown.replace(/`([^`]+)`/g, (_match, code) => {
        codeSpans.push(code);
        return `@@cddcode${codeSpans.length - 1}@@`;
    });

    html = escapeHtml(html)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => {
            const url = href.startsWith("./")
                ? `${REPO}/blob/main/${href.slice(2)}`
                : href;
            return `<a href="${escapeHtml(url)}">${text}</a>`;
        })
        // Autolinks, <https://…>. The angle brackets are already escaped by now.
        .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1">$1</a>');

    html = html.replace(
        /@@cddcode(\d+)@@/g,
        (_match, i) => `<code>${escapeHtml(codeSpans[+i])}</code>`
    );

    if (html.includes("@@cddcode")) throw new Error(`Unrestored code span: ${markdown}`);
    return html;
}

// Block level. A blank line ends a block; a bullet or blockquote line continues
// onto the next line when that line is indented.
function renderMarkdown(markdown) {
    const blocks = markdown.trim().split(/\n{2,}/);

    return blocks
        .map((block) => {
            const lines = block.split("\n");

            if (lines[0].startsWith("- ")) {
                const items = [];
                for (const line of lines) {
                    if (line.startsWith("- ")) items.push(line.slice(2));
                    else if (/^\s+\S/.test(line)) items[items.length - 1] += " " + line.trim();
                    else throw new Error(`Unexpected line inside a list: ${line}`);
                }
                return `<ul>\n${items.map((i) => `  <li>${renderInline(i)}</li>`).join("\n")}\n</ul>`;
            }

            if (lines[0].startsWith("> ")) {
                const text = lines.map((line) => line.replace(/^>\s?/, "")).join(" ");
                return `<blockquote>${renderInline(text)}</blockquote>`;
            }

            if (lines[0].startsWith("#")) {
                throw new Error(`Unexpected heading inside a release body: ${lines[0]}`);
            }

            return `<p>${renderInline(lines.join(" "))}</p>`;
        })
        .join("\n");
}

/* ---------------------------------------------------------------- page ---- */

// "11.0.0" -> "v11-0-0"; "8.2.0 / 8.2.1" -> "v8-2-0-8-2-1"; "5.x - 6.x" -> "v5-x-6-x".
const anchor = (label) =>
    "v" +
    label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

// The version tile echoes the periodic-table tiles on the settings page: the
// major version reads as the atomic number, the full version as the symbol.
function renderTile(release, status) {
    const [major] = release.versionLabel.split(".");

    const pill =
        status === "latest"
            ? '<span class="pill">Latest</span>'
            : status === "unreleased"
              ? '<span class="pill pill--unreleased">Not yet released</span>'
              : "";

    return `      <div class="rail">
        <span class="tile">
          <span class="tile__no">${escapeHtml(major)}</span>
          <span class="tile__sym">${escapeHtml(release.versionLabel)}</span>
        </span>
        ${pill}
      </div>`;
}

function renderRelease(release, status) {
    const id = anchor(release.versionLabel);

    // The lead is promoted to the release's own heading, so it must not appear
    // again in the body.
    const body = release.lead
        ? release.body.replace(/^\*\*[\s\S]+?\*\*\s*(\n\n|$)/, "")
        : release.body;

    return `    <article class="release" id="${id}">
${renderTile(release, status)}
      <div class="notes">
        <p class="eyebrow">${escapeHtml(release.date)}</p>
        <h2><a class="anchor" href="#${id}">${release.lead ? renderInline(release.lead) : escapeHtml(release.versionLabel)}</a></h2>
${renderMarkdown(body)
            .split("\n")
            .map((line) => "        " + line)
            .join("\n")}
      </div>
    </article>`;
}

// "latest" -> the version the stores serve; "unreleased" -> written up in
// RELEASES.md but newer than that, so nobody can install it yet; "" -> history.
//
// Absence of a tag proves nothing on its own: the 8.x and 9.0.0 releases shipped
// before this repo tagged anything. Only a version ABOVE the shipping one is
// genuinely unreleased.
function statusOf(release, shipping) {
    if (!release.version) return "";
    if (release.version === shipping) return "latest";
    return compareSemver(release.version, shipping) > 0 ? "unreleased" : "";
}

function renderPage(releases, version) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>What's new — CDD Stoich Tools</title>
<meta name="description" content="Release notes for the CDD Stoichiometric Table Tools browser extension." />
<link rel="icon" type="image/png" href="./icon.png" />
<link rel="stylesheet" href="./style.css" />
</head>
<body>
<header class="masthead">
  <div class="wrap">
    <div class="brand">
      <img class="logo" src="./icon.png" width="56" height="56" alt="" />
      <div>
        <p class="wordmark">CDD Stoich Tools</p>
        <h1>What's new</h1>
      </div>
    </div>
    <p class="lede">
      Every change to the extension, in plain language. The newest release is at
      the top. Settings live behind the extension icon, or under
      <strong>CDD Plugin options</strong> in CDD's user menu.
    </p>
    <p class="actions">
      <a class="btn btn--primary" href="${CHROME_STORE}">Get it for Chrome</a>
      <a class="btn" href="${FIREFOX_STORE}">Get it for Firefox</a>
      <a class="btn btn--quiet" href="${REPO}/blob/main/CHANGELOG.md">Technical changelog</a>
    </p>
    <p class="version">In the stores right now: <strong>${escapeHtml(version)}</strong></p>
  </div>
</header>

<main class="wrap">
${releases
            .map((release) => renderRelease(release, statusOf(release, version)))
            .join("\n\n")}
</main>

<footer class="masthead masthead--foot">
  <div class="wrap">
    <p>
      <a href="${REPO}">Source on GitHub</a> · Built from
      <a href="${REPO}/blob/main/RELEASES.md">RELEASES.md</a>
    </p>
  </div>
</footer>
</body>
</html>
`;
}

/* ---------------------------------------------------------------- main ---- */

const releases = readReleases(resolve(root, "RELEASES.md"));
if (!releases.length) throw new Error("RELEASES.md yielded no releases");

const compareSemver = (a, b) => {
    const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
    const [bMajor, bMinor, bPatch] = b.split(".").map(Number);
    return aMajor - bMajor || aMinor - bMinor || aPatch - bPatch;
};

/**
 * Which versions have actually been tagged, newest last.
 *
 * The page must not read the shipping version off manifest.json: main carries a
 * bumped manifest from the moment work on the next version starts, which can be
 * long before that version is tagged and published. Promising a release nobody
 * can install yet is worse than being a little behind.
 *
 * Needs full history — pages.yml checks out with fetch-depth: 0.
 */
function taggedVersions() {
    try {
        return execFileSync("git", ["tag", "--list", "v*.*.*"], { cwd: root, encoding: "utf8" })
            .split("\n")
            .map((tag) => tag.trim().replace(/^v/, ""))
            .filter((tag) => /^\d+\.\d+\.\d+$/.test(tag))
            .sort(compareSemver);
    } catch {
        return []; // no git available
    }
}

const tags = taggedVersions();

// A shallow clone with no tags is the only case where the manifest is the best
// guess we have.
const version =
    tags.at(-1) ?? JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8")).version;

const outDir = resolve(root, "site");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "index.html"), renderPage(releases, version));
copyFileSync(resolve(here, "releases-page.css"), resolve(outDir, "style.css"));

// The extension's own icon, serving as both the hero logo and the favicon.
copyFileSync(resolve(root, "icons/icon128.png"), resolve(outDir, "icon.png"));

const unreleased = releases
    .filter((release) => statusOf(release, version) === "unreleased")
    .map((release) => release.version);

console.log(
    `site/index.html — ${releases.length} sections, ${tags.length} tagged, in the stores: ${version}` +
    (unreleased.length ? `, not yet released: ${unreleased.join(", ")}` : "")
);
