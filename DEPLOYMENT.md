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

---

## 3. Create OAuth credentials

1. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - Add the scope `https://www.googleapis.com/auth/chromewebstore`.
   - Add your own Google account as a test user.
   - **Publish the app** (set the consent screen to **In production**).

   > ⚠️ **Important:** if the consent screen stays in **Testing**, the refresh
   > token **expires after 7 days** and CI will start failing. Publishing the
   > consent screen ("In production") gives a long-lived refresh token. This is
   > the #1 cause of Chrome CI breaking later.

2. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Desktop app**.
   - Save the **Client ID** (`CHROME_CLIENT_ID`) and **Client secret**
     (`CHROME_CLIENT_SECRET`).

---

## 4. Get a refresh token (one time)

Do this on your own machine. Replace `CLIENT_ID` / `CLIENT_SECRET`.

1. Open this URL in a browser (all one line):

   ```
   https://accounts.google.com/o/oauth2/auth?response_type=code&access_type=offline&prompt=consent&client_id=CLIENT_ID&redirect_uri=http://localhost&scope=https://www.googleapis.com/auth/chromewebstore
   ```

2. Approve. The browser redirects to `http://localhost/?code=...` — the page
   will fail to load, that's fine. Copy the `code` value from the address bar.

3. Exchange the code for a refresh token:

   ```bash
   curl -s -X POST https://oauth2.googleapis.com/token \
     -d client_id=CLIENT_ID \
     -d client_secret=CLIENT_SECRET \
     -d code=THE_CODE_FROM_STEP_2 \
     -d grant_type=authorization_code \
     -d redirect_uri=http://localhost
   ```

   The response contains `"refresh_token": "..."`. That is `CHROME_REFRESH_TOKEN`.

   > The `code` is single-use and expires within minutes — if the exchange fails,
   > redo step 1 to get a fresh code.

---

## 5. Add the secrets to GitHub

**Repository → Settings → Secrets and variables → Actions → New repository secret**,
add all four:

| Secret name            | Value                                  |
| ---------------------- | -------------------------------------- |
| `CHROME_EXTENSION_ID`  | item ID from step 1                    |
| `CHROME_CLIENT_ID`     | OAuth client ID from step 3            |
| `CHROME_CLIENT_SECRET` | OAuth client secret from step 3        |
| `CHROME_REFRESH_TOKEN` | refresh token from step 4              |

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
