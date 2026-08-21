# CLAUDE.md — project instructions for Claude Code

## Release workflow

Whenever `manifest.json` version is bumped:
1. Update `CHANGELOG.md` and `RELEASES.md` (in English)
2. Rebuild (`npm run build`)
3. Commit all changed files

Do these three steps without being asked, then **STOP**.

**NEVER push on your own — not the commit, not the tag.** The user tests the
change first (from `dist/`, after reloading the extension) and decides when it
goes out. After step 3, say the commit is ready and wait for an explicit
go-ahead for each step:

- `git push origin main` — only when the user asks
- `git tag vX.Y.Z && git push origin vX.Y.Z` — only when the user asks, and
  note that this one publishes to the Chrome Web Store and Firefox AMO

Pushing the `vX.Y.Z` tag triggers `.github/workflows/publish.yml`, which builds
`dist/` once and publishes to the Chrome Web Store and Firefox AMO (each store is
skipped if its secrets aren't set). See `DEPLOYMENT.md` for the required GitHub
secrets and one-time Google/Mozilla setup.

## Release notes

`CHANGELOG.md` and `RELEASES.md` are not the same document and must not be
written the same way.

- **`CHANGELOG.md`** is the record. It may be long and may explain why.
- **`RELEASES.md`** is the public *What's new* page. It is read by a chemist
  who wants to know what changed and what to do about it.

Headings carry a **concrete date**, not a month:

```markdown
## 14.9.0 — 2026-08-20
```

`scripts/release-notes.mjs` takes whatever follows the em dash verbatim, so
the format is a convention rather than a parser rule — keep it ISO, matching
`CHANGELOG.md`.

### How a What's new entry reads

Short, factual, direct. A release should fit on one screen — roughly 120
words for a feature, one line for a fix.

- **Open with one sentence** saying what you can now do, in the words the
  user would use.
- **One line per change.** Bullets are for genuinely separate things, not for
  paragraphs wearing a bullet.
- **Say what to do, not why it was built.** Design rationale belongs in the
  commit message and the spec. Nobody reading the release page is deciding
  whether to build it.
- **Name the path** for anything that has to be switched on —
  *Settings → HPLC injection*.
- **Cut any number the reader cannot act on.**

Write it the way you would tell a colleague at the bench, not the way you
would defend it in review.

Do not rewrite the notes of a release that already shipped: the tag is public
and people have read them. New rules apply to the next version.
