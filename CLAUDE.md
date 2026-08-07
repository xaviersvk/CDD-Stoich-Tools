# CLAUDE.md — project instructions for Claude Code

## Release workflow

Whenever `manifest.json` version is bumped:
1. Update `CHANGELOG.md` and `RELEASES.md` (in English)
2. Rebuild (`npm run build`)
3. Commit all changed files
4. Push the commit: `git push origin main`

Do these four steps without being asked. **NEVER create or push the `vX.Y.Z`
tag yourself — the user decides about tags.** Pushing a tag publishes to the
stores, so after step 4 just say the release is ready to tag and wait for an
explicit go-ahead (`git tag vX.Y.Z && git push origin vX.Y.Z`).

Pushing the `vX.Y.Z` tag triggers `.github/workflows/publish.yml`, which builds
`dist/` once and publishes to the Chrome Web Store and Firefox AMO (each store is
skipped if its secrets aren't set). See `DEPLOYMENT.md` for the required GitHub
secrets and one-time Google/Mozilla setup.
