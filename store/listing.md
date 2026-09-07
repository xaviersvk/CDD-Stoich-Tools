# Store listing

The text shown on the Chrome Web Store and Firefox Add-ons pages. Neither
store can be updated from the publish workflow — the description is pasted
into each dashboard by hand — so the wording lives here, versioned, and the
dashboards are copies of it.

- Chrome: <https://chromewebstore.google.com/detail/cdd-stoichiometric-table/ghbhjmmmgejokgekdcbcmgcfaoddlffg>
- Firefox: <https://addons.mozilla.org/en-GB/firefox/addon/cdd-stoichiometric-table-tools/>

## Name

    CDD Stoichiometric Table Tools

Unchanged on purpose: it is what people have installed and searched for. The
subtitle and description carry the wider scope.

## Subtitle

Chrome takes this from `manifest.json` → `description` (max 132 characters),
so it reaches the Chrome page with the next version bump. AMO's *Summary*
field is edited in the dashboard and takes it right away.

    Practical helpers for CDD Vault: sample panel, one-click copy, printable stoichiometry sheets, inventory and plate tools.

## Description — Chrome (plain text)

The Chrome dashboard strips markup. Headings are a line on their own with a
blank line above.

```
CDD Stoichiometric Table Tools adds small, practical helpers to the CDD Vault pages you already use. It began as a floating sample panel for ELN stoichiometry tables and has grown into a set of shortcuts for the ELN, Inventory, Search and Registration pages. Everything runs locally in your browser.

ELN entries
- A floating panel lists every sample in the entry's reaction tables, grouped by reaction. Click any value to copy it; concentrations come out in CDD-ready units.
- Choose which fields to show — location, purity, density, MW, batch, owner, your vault's custom fields. Low-purity and depleted samples are flagged.
- Print a clean A4 stoichiometry sheet per reaction: scheme, masses, volumes, equivalents, yield.
- Work out the HPLC injection volume in the panel, and keep phrases you type often.
- Register a product straight from the entry — the form fills itself in and the batch gets the entry ID as its Internal ID.

Inventory and plates
- Pick Location: create several samples at once from empty wells, hover a well to see its structure, colour wells by sample-ID prefix.
- The location picker opens as a folder tree with search and arrow-key navigation. Scan a shelf of racks into a location with a barcode scanner.
- See where a plate physically lives, add a Location column to the Plates tab, export plate locations to CSV. Hover a plate-map well for its synonym and structure.

Search and tables
- The Filter and Keywords field pickers open as wide, searchable multi-column popovers instead of one long dropdown.
- Column Manager gets search, category chips and type badges.
- Sensible filter defaults ("has" for text, "from" for dates), Copy Link on saved searches, one-click copy on molecule and batch fields.

Registration and dose-response
- Entity-type lists in your order, defaulted to your last choice — in the Create Entity form and in bulk registration.
- Easy Override for dose-response curves, right in the search results.

Settings
Click the extension icon, or open "CDD Plugin options" from CDD's user menu. The basics work out of the box; newer helpers are switched on there.

Not a CDD product
This is an open-source extension written by CDD Vault users. Collaborative Drug Discovery does not build, endorse or support it. If something in CDD looks wrong, disable the extension, reload the page and check again before contacting CDD support. Report problems on GitHub: https://github.com/xaviersvk/CDD-Stoich-Tools/issues

Privacy
Runs only on CDD Vault pages. No accounts, no backend, no analytics — nothing leaves your browser. The only permission is "storage", for your own settings.

What changed in each version: https://xaviersvk.github.io/CDD-Stoich-Tools/
```

## Description — Firefox (AMO HTML)

Same words; AMO allows `<b>`, `<ul>`, `<a>`.

```html
CDD Stoichiometric Table Tools adds small, practical helpers to the CDD Vault pages you already use. It began as a floating sample panel for ELN stoichiometry tables and has grown into a set of shortcuts for the ELN, Inventory, Search and Registration pages. Everything runs locally in your browser.

<b>ELN entries</b>
<ul>
<li>A floating panel lists every sample in the entry's reaction tables, grouped by reaction. Click any value to copy it; concentrations come out in CDD-ready units.</li>
<li>Choose which fields to show — location, purity, density, MW, batch, owner, your vault's custom fields. Low-purity and depleted samples are flagged.</li>
<li>Print a clean A4 stoichiometry sheet per reaction: scheme, masses, volumes, equivalents, yield.</li>
<li>Work out the HPLC injection volume in the panel, and keep phrases you type often.</li>
<li>Register a product straight from the entry — the form fills itself in and the batch gets the entry ID as its Internal ID.</li>
</ul>

<b>Inventory and plates</b>
<ul>
<li>Pick Location: create several samples at once from empty wells, hover a well to see its structure, colour wells by sample-ID prefix.</li>
<li>The location picker opens as a folder tree with search and arrow-key navigation. Scan a shelf of racks into a location with a barcode scanner.</li>
<li>See where a plate physically lives, add a Location column to the Plates tab, export plate locations to CSV. Hover a plate-map well for its synonym and structure.</li>
</ul>

<b>Search and tables</b>
<ul>
<li>The Filter and Keywords field pickers open as wide, searchable multi-column popovers instead of one long dropdown.</li>
<li>Column Manager gets search, category chips and type badges.</li>
<li>Sensible filter defaults ("has" for text, "from" for dates), Copy Link on saved searches, one-click copy on molecule and batch fields.</li>
</ul>

<b>Registration and dose-response</b>
<ul>
<li>Entity-type lists in your order, defaulted to your last choice — in the Create Entity form and in bulk registration.</li>
<li>Easy Override for dose-response curves, right in the search results.</li>
</ul>

<b>Settings</b>
Click the extension icon, or open <i>CDD Plugin options</i> from CDD's user menu. The basics work out of the box; newer helpers are switched on there.

<b>Not a CDD product</b>
This is an open-source extension written by CDD Vault users. Collaborative Drug Discovery does not build, endorse or support it. If something in CDD looks wrong, disable the extension, reload the page and check again before contacting CDD support. Report problems on GitHub: <a href="https://github.com/xaviersvk/CDD-Stoich-Tools/issues">github.com/xaviersvk/CDD-Stoich-Tools/issues</a>

<b>Privacy</b>
Runs only on CDD Vault pages. No accounts, no backend, no analytics — nothing leaves your browser. The only permission is <i>storage</i>, for your own settings.

What changed in each version: <a href="https://xaviersvk.github.io/CDD-Stoich-Tools/">xaviersvk.github.io/CDD-Stoich-Tools</a>
```

## Dashboard checklist

Done by hand, once per wording change.

**Chrome Web Store** — Developer Dashboard → item → *Store listing*
- [ ] Description → paste the plain-text block
- [ ] Category stays *Functionality & UI*
- [ ] Support URL → `https://github.com/xaviersvk/CDD-Stoich-Tools/issues`
- [ ] Save draft → *Submit for review* (listing-only changes still go through review)

**Firefox Add-ons** — Developer Hub → add-on → *Edit Product Page*
- [ ] Summary → the subtitle
- [ ] Description → paste the HTML block
- [ ] Category: *Web Development* → *Productivity*
- [ ] Homepage → `https://xaviersvk.github.io/CDD-Stoich-Tools/`
- [ ] Support site → `https://github.com/xaviersvk/CDD-Stoich-Tools/issues`

## Keeping it current

When a release adds something a chemist would look for on the store page,
add one line to the matching section here and paste the block into both
dashboards. Screenshots are tracked separately — the current sets predate
most of the Inventory, Search and Registration helpers.
