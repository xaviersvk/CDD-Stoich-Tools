# Automated deployment (Chrome Web Store + Firefox AMO)

Pushing a version tag (`git push origin vX.Y.Z`) triggers
[`.github/workflows/publish.yml`](.github/workflows/publish.yml), which builds
the extension once and then publishes it to the **Chrome Web Store** and to
**Firefox AMO** (addons.mozilla.org).

Each store is **skipped** (its job stays green) if its secrets aren't
configured, so you can set up one store at a time — e.g. Chrome now, Firefox
later, without either breaking the run.

This file is the **one-time setup** you (a human) have to do, because it needs
developer accounts / API keys that CI cannot create.

Parts 1–5 below are the Chrome Web Store. Part 6 is Firefox AMO.

---

## 1. Register the extension in the Chrome Web Store

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   and pay the one-time **$5** developer registration fee (if not done already).
2. Create the item once, manually:
   - Run `npm run build` locally.
   - Zip the **contents** of `dist/` (the `manifest.json` must be at the root of
     the zip, not inside a `dist/` folder): `cd dist && zip -r ../extension.zip .`
   - In the dashboard: **New item** → upload `extension.zip` → fill in listing
     details (description, screenshots, category, privacy) → save.
3. Copy the item's **ID** from the dashboard URL
   (`.../devconsole/.../<THIS_IS_THE_ID>/edit`). This is `CHROME_EXTENSION_ID`.

> The item must exist before the API can upload to it. After this first manual
> upload, every future release goes through CI.

---

## 2. Enable the Chrome Web Store API

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create
   a project (or reuse one).
2. **APIs & Services → Library** → search **Chrome Web Store API** → **Enable**.

> CI uses the **v2 API with a service account** (below). The old v1.1 OAuth
> flow (consent screen + refresh token) is deprecated and
> [shuts down on 15 Oct 2026](https://developer.chrome.com/blog/cws-api-v2) —
> don't set it up.

---

## 3. Create a service account + JSON key

1. In the same Cloud project: **IAM & Admin → Service Accounts →
   Create service account**. Any name (e.g. `cws-publisher`); it needs **no
   roles/permissions** — click through and create.
2. Open the new service account → **Keys → Add key → Create new key → JSON**.
   A `.json` key file downloads. Its full contents become the
   `CHROME_SERVICE_ACCOUNT_JSON` secret.
3. Copy the service account's **email** (`...@...iam.gserviceaccount.com`) —
   you'll need it in the next step.

> Treat the key file like a password: don't commit it, delete the local copy
> after adding the GitHub secret.

---

## 4. Grant the service account access to your publisher

1. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   open the **Account** page.
2. Note your **Publisher ID** shown there — that is `CHROME_PUBLISHER_ID`.
3. Add the service account's **email** as a service account for this publisher
   (see [service account docs](https://developer.chrome.com/docs/webstore/service-accounts)).
   Only one service account can be attached to a publisher.

---

## 5. Add the secrets to GitHub

**Repository → Settings → Secrets and variables → Actions → New repository secret**,
add all three:

| Secret name                   | Value                                          |
| ----------------------------- | ---------------------------------------------- |
| `CHROME_EXTENSION_ID`         | item ID from step 1                            |
| `CHROME_PUBLISHER_ID`         | publisher ID from step 4                       |
| `CHROME_SERVICE_ACCOUNT_JSON` | entire contents of the JSON key file (step 3)  |

### Optional: upload as draft instead of publishing

Under the same page, on the **Variables** tab, add a repository variable
`CHROME_AUTOPUBLISH` set to `false`. Then tag pushes will upload a new draft to
the dashboard without publishing, and you click **Publish** manually. Remove the
variable (or set it to anything other than `false`) to go back to auto-publish.

---

## 6. Firefox (AMO) setup

The same tag push also submits a new **listed** version to
[addons.mozilla.org](https://addons.mozilla.org/developers/) using Mozilla's
official `web-ext` tool.

1. **Create the AMO listing once, manually** (like Chrome): sign in to the
   [AMO Developer Hub](https://addons.mozilla.org/developers/), submit the first
   build (`web-ext-artifacts`/zip of `dist/`) as a **listed** add-on, and fill in
   the listing details. The add-on's ID must match
   `browser_specific_settings.gecko.id` in `manifest.json`
   (`cdd-stoich-tools@local`).
2. **Generate API credentials:** on the
   [AMO API Keys page](https://addons.mozilla.org/developers/addon/api/key/),
   create credentials. You get:
   - **JWT issuer** → `AMO_JWT_ISSUER` (looks like `user:12345:67`)
   - **JWT secret** → `AMO_JWT_SECRET` (long hex string, shown only once)
3. Add both as GitHub repository secrets (same place as the Chrome ones).

Notes:

- Firefox always **submits to AMO review** when configured — there is no
  "draft only" mode here; the `CHROME_AUTOPUBLISH=false` toggle only affects
  Chrome. AMO's own review is the gate before it goes live.
- Each version can only be submitted once, so the `manifest.json` version must be
  bumped for every release (which the normal release workflow already does).
- The build is intentionally not minified, which keeps AMO's source review
  straightforward.

---

## How a release works now

1. Bump `manifest.json` version, update `CHANGELOG.md` / `RELEASES.md`.
2. `npm run build`, commit everything.
3. `git tag vX.Y.Z && git push origin main && git push origin vX.Y.Z`.
4. The **Publish extension** workflow runs automatically: it builds once, then
   publishes to the Chrome Web Store and Firefox AMO (each skipped if its secrets
   aren't set). Watch it under the repo's **Actions** tab.

The workflow fails fast if the tag doesn't match `manifest.json`'s version, so the
store version and the git tag can't drift apart.

You can also run it manually from **Actions → Publish extension → Run workflow**
(with a checkbox to publish or, for Chrome, upload-as-draft).
