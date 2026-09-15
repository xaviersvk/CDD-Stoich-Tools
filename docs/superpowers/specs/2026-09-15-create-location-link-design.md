# A "Location" entry in Create a new… — design

Date: 2026-09-15
Status: designed

## Problem

*Edit Locations* is four clicks deep: Settings → Vault → Sample/Inventory
Fields → Add/Edit Inventory Fields → Edit Locations. The place a chemist
actually stands when a new rack needs a home is Explore Data, whose sidebar
already offers *Create a new…* — Protocol, Molecule, Project, ELN Entry. A
*Location* entry belongs there. It must appear only for people who may edit
locations: vault administrators and inventory administrators.

## What exists today (verified live, vault 6772)

- The sidebar block is `#dataSources-createNew`: an `<a>` trigger
  (`#dataSources-createNew-link`) and a plain `<ul>` of `<li><a>` entries,
  `class="open"` on the block while the menu is shown. Rails-rendered, no
  React.
- The header's user dropdown (`.user-dropdown ul`) carries the user's role in
  this vault as a link to the help topic `user_roles`: *Vault Administrator*
  for this account. The help page lists the roles: Read Only, Read Download,
  Read Export, Read Add (– Biology), Full Access (– Biology), Vault Admin.
  **Inventory administrator is not a role**; it is a separate grant on top
  of a role and does not show in the header.
- The dialog lives on `/vaults/<id>/inventory_field_definitions`, rendered by
  React after load. Its opening sequence is two clicks: the link
  *Add/Edit Inventory Fields*, then the link *Edit Locations* that appears
  once the table is in edit mode. The server-rendered HTML of that page
  contains neither text.
- CDD is a Turbo SPA: a plain `<a href>` is a Turbo visit, `<body>` is
  swapped, the URL hash survives.
- The extension's `options-menu-link.js` already appends an item to the
  header dropdown with an idempotent observer on `document.documentElement`.

## Decisions

- **New tab.** The entry is a plain link to
  `/vaults/<id>/inventory_field_definitions#edit-locations` with
  `target="_blank"`, so the search being built stays where it is. (Same
  tab was chosen first and reversed on review.)
- **Two gates, header first.** *Vault Administrator* in the header shows the
  entry with no request. Otherwise one probe: GET the settings page; `200`
  at the requested path means allowed, a redirect or any other status means
  not. Remembered per vault for the session in `sessionStorage`.
- **The negative case is the user's to verify** with a plain account and an
  inventory administrator; only an admin account was available while
  designing. If CDD answers an unauthorized GET with `200` on the same path,
  the entry shows and the click lands on CDD's own refusal — nothing worse.
- **No switch.** Like the filter and the orange names.
- **The hash is consumed.** On arrival the extension drops it with
  `replaceState` before clicking, so a reload of the settings page does not
  reopen the dialog.

## Design

New directory `src/content/features/ui-fixes/create-location-link/`:

| File | Responsibility |
| --- | --- |
| `permission.js` | `vaultIdFromPath`, `settingsPath`, `headerSaysAdmin`, `canEditLocations(vaultId)` — header check, session cache, single in-flight probe. |
| `menu-item.js` | `ensureMenuItem(vaultId)` — appends `<li class="cdd-create-location-item"><a>Location</a></li>` to every `#dataSources-createNew ul` that lacks it. |
| `auto-open.js` | `autoOpenIfAsked()` — on the settings page with `#edit-locations`: drop the hash, wait for *Add/Edit Inventory Fields*, click, wait for *Edit Locations*, click. Five seconds per wait, then a `console.warn` and nothing else. |
| `init.js` | `initCreateLocationLink()` — one observer on `document.documentElement`, debounced; each pass runs `autoOpenIfAsked()` and, when a create menu is on the page, resolves `canEditLocations` and mounts the item. |

Registered from `content/main.js` beside the other ui-fixes.

## Verification

Pure (`node`): `vaultIdFromPath` on `/vaults/6772/searches/new`,
`/vaults/6772`, `/`; `settingsPath`.

Live, vault 6772, admin account: the entry appears last in *Create a new…*
on `/searches/new`; clicking it lands on the settings page with the dialog
open and the hash gone, in a new tab; a reload of the settings
page does not reopen the dialog.

By the user: a plain member sees no entry; an inventory administrator does.

## Not in scope

- Rendering the dialog on the search page itself.
- A switch in settings.
