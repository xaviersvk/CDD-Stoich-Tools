# CLAUDE.md — project instructions for Claude Code

## Release workflow

Whenever `manifest.json` version is bumped:
1. Update `CHANGELOG.md` and `RELEASES.md` (in English)
2. Rebuild (`npm run build`)
3. Commit all changed files
4. Create a git tag matching the version: `git tag vX.Y.Z`
5. Push commit and tag: `git push origin main && git push origin vX.Y.Z`

Do all five steps without being asked — a version bump means a release.

Pushing the `vX.Y.Z` tag triggers `.github/workflows/publish.yml`, which builds
`dist/` once and publishes to the Chrome Web Store and Firefox AMO (each store is
skipped if its secrets aren't set). See `DEPLOYMENT.md` for the required GitHub
secrets and one-time Google/Mozilla setup.
