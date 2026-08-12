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
