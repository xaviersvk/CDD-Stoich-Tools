# Create-a-new Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A *Location* entry in Explore Data's *Create a new…* menu, shown only to vault and inventory administrators, that lands on Settings with *Edit Locations* already open.

**Architecture:** One new ui-fix directory. `permission.js` decides (header role, else one cached probe), `menu-item.js` mounts the `<li>`, `auto-open.js` consumes `#edit-locations` on the settings page by clicking CDD's own two links, `init.js` runs both from one debounced observer. Spec: `docs/superpowers/specs/2026-09-15-create-location-link-design.md`.

**Tech Stack:** Plain ES modules, Vite, throwaway `node` test.

## Global Constraints

- Link target: `/vaults/<id>/inventory_field_definitions#edit-locations`, same tab.
- Show when the header role link reads exactly `Vault Administrator`, else when `GET` of the settings path answers `ok` at the same pathname. Cache per vault in `sessionStorage` key `cddCanEditLocations:<id>`.
- Consume the hash with `history.replaceState` before clicking anything.
- Idempotent mounting: one item per menu, class `cdd-create-location-item`.
- No switch. Commit per task. Do not push.

---

### Task 1: `permission.js` (+ node test for the pure parts)
- [ ] Test `vaultIdFromPath("/vaults/6772/searches/new") === "6772"`, `"/vaults/6772" → "6772"`, `"/" → null`, `settingsPath("6772")`.
- [ ] Implement per spec; commit.

### Task 2: `menu-item.js`, `auto-open.js`, `init.js`, registration in `content/main.js`
- [ ] Implement per spec; `npm run build`; commit.

### Task 3: Live check and release 15.13.0
- [ ] Admin account: entry present, click opens the dialog, hash gone, reload does not reopen.
- [ ] `manifest.json` 15.13.0, CHANGELOG, RELEASES, FEATURE_CATALOG, README one line; build; commit. Stop.
