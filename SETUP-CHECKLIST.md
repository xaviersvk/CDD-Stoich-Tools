# Deploy setup — checklist (do this once)

The publishing workflow (`.github/workflows/publish.yml`) is done and committed.
It won't do anything useful until the secrets below exist. Work through this
list; full detail for every step is in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

Each store is independent — you can finish Chrome tonight and Firefox another
day. A store with missing secrets is simply skipped (its job stays green).

---

## A. Chrome Web Store

- [ ] **Developer account** exists and the $5 fee is paid
      → https://chrome.google.com/webstore/devconsole
- [ ] **The item exists in the store** (first version uploaded manually once).
      Build locally, then upload the zip to create it:
      ```bash
      npm run build
      cd dist && zip -r ../extension.zip . && cd ..
      ```
      Copy the **Item ID** from the dashboard URL.  *(DEPLOYMENT.md part 1)*
- [ ] **Chrome Web Store API enabled** in a Google Cloud project.  *(part 2)*
- [ ] **OAuth consent screen** has scope
      `https://www.googleapis.com/auth/chromewebstore` **and is set to
      "In production"** (NOT "Testing").
      ⚠️ If it stays in "Testing", the refresh token dies after 7 days and CI
      breaks. This is the single most common mistake.  *(part 3)*
- [ ] **OAuth client (Desktop app)** created → note Client ID + Client secret.
- [ ] **Refresh token** generated. Open the consent URL in a browser (part 4),
      grab the `code`, then:
      ```bash
      curl -s -X POST https://oauth2.googleapis.com/token \
        -d client_id=CLIENT_ID \
        -d client_secret=CLIENT_SECRET \
        -d code=THE_CODE \
        -d grant_type=authorization_code \
        -d redirect_uri=http://localhost
      ```
      Copy `refresh_token` from the response.
- [ ] **Add the 4 GitHub secrets** (Settings → Secrets and variables → Actions):

  | Secret                 | From                       |
  | ---------------------- | -------------------------- |
  | `CHROME_EXTENSION_ID`  | item ID (step 2)           |
  | `CHROME_CLIENT_ID`     | OAuth client ID            |
  | `CHROME_CLIENT_SECRET` | OAuth client secret        |
  | `CHROME_REFRESH_TOKEN` | refresh token              |

---

## B. Firefox (AMO)

- [ ] **The add-on listing exists on AMO** as a *listed* add-on, with ID
      `cdd-stoich-tools@local` (matches `manifest.json`).
      → https://addons.mozilla.org/developers/  *(DEPLOYMENT.md part 6)*
      *(You likely already publish to AMO manually — if so, this is done.)*
- [ ] **API credentials** created → JWT issuer + JWT secret.
      → https://addons.mozilla.org/developers/addon/api/key/
      ⚠️ The secret is shown only once — copy it immediately.
- [ ] **Add the 2 GitHub secrets:**

  | Secret            | From                         |
  | ----------------- | ---------------------------- |
  | `AMO_JWT_ISSUER`  | JWT issuer (`user:12345:67`) |
  | `AMO_JWT_SECRET`  | JWT secret (long hex)        |

---

## C. Test it (before trusting a real release)

- [ ] Go to **Actions → Publish extension → Run workflow**.
- [ ] First run: **uncheck "Publish"** so Chrome uploads a *draft* only (safe).
- [ ] Check the run: the `chrome` job should upload; the `firefox` job should
      sign & submit (or skip if AMO secrets aren't set yet).
- [ ] Fix anything the logs complain about.
- [ ] When happy, a normal release just works:
      `git tag vX.Y.Z && git push origin main && git push origin vX.Y.Z`
      → the workflow builds and publishes to both stores automatically.

---

## Notes / gotchas

- The workflow **fails fast if the git tag ≠ `manifest.json` version** — keep
  them in sync (the release workflow already does).
- Chrome respects the repo variable `CHROME_AUTOPUBLISH=false` for draft-only.
  Firefox always submits to AMO review (no draft mode).
- Every release needs a version bump — the same version can't be uploaded twice
  to either store.
