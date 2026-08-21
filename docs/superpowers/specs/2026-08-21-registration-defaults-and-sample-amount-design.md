# Per-vault registration defaults, and sample amount from the ELN — design

Date: 2026-08-21
Status: approved by user (conversation)

Two halves of the same workflow — "I am registering the product of this
reaction" — so they share a spec and a release. D fills constants the user
always types; E carries a number that only the ELN knows.

Both build on the wire `eln-id-to-registration.js` already runs: the Register
link is stamped with query parameters on the way out, and the registration
page reads its own query string. The two pages never share a JavaScript
world (the link opens a new tab), which is why storage would be a race and
the URL is not.

## D · Field defaults, per vault

### Problem

Registering a product from a stoichiometry row means typing the same
constants every time. `Origin` is always `Synthesized` for a compound that
came out of a reaction — the value never depends on the reaction, only on
the fact that there was one.

The registration form in vault 8158 has **52 editable fields**, most of them
`<select>`: `Toxicity`, `Origin`, `Intermediate/Final`, `Purity Method`,
`Stability`, `Explosive`, `Hygroscopic`… A setting for `Origin` alone would
be rewritten the first time a second field came up.

Field sets are also **per vault** — vault 8158 has `Origin`, the next vault
may not, and a value that is right in one is meaningless in another.

### Decision

A new `src/shared/registration-defaults.js`:

```js
// Record<vaultId, { label?: string, fields: Array<{ label, value }> }>
export const REGISTRATION_DEFAULTS_KEY = "cddRegistrationDefaults";
```

`fields` is the list of defaults. `label` is a name the user may type for the
vault so the options page reads better than a bare number; it is optional and
purely cosmetic.

**Not harvested from the page.** CDD's header carries the vault name only
inside the vault-switcher dropdown, which lists every vault the account can
reach — other groups' vaults included — and every one of its links carries
the *current* vault id, so the active one cannot even be picked out of it.
Reading that list to prettify a settings heading would mean storing other
people's data for decoration. The user types the label instead, or leaves it
blank.

`extractVaultId(pathname)` already exists in `shared/registration-form.js`
and is exported through `registration-form-fields.js`; the `Record<vaultId,
…>` storage shape is already used twice in this codebase
(`cddRegFormFieldMap`, `cddRegFormFilterLastUsed`). This follows both.

### When it fills

**Only when the URL carries `cdd_eln_id`** — that is, only on a registration
opened from an ELN entry. A registration form opened by hand from Explore
Data is left alone: the user did not come from a reaction, so "this compound
was synthesized" is not a safe assumption.

### How it fills

Extends the fill already in `eln-id-to-registration.js`, which finds a cell
by `[data-editable-cell-label]` and `fieldLabelsMatch` (that helper already
strips CDD's required-marker `*`, so a setting saying `Purity [%]` matches
the cell labelled `*Purity [%]`).

The one new thing is the control kind. Today `findTargetInput()` queries
`input[type="text"], textarea` and would silently miss every `<select>`:

- **text / textarea** — set `.value`, dispatch `input` and `change`.
- **select** — set `.value` only if an option matches the setting
  (case-insensitively, trimmed), then dispatch `input` and `change`. **If no
  option matches, skip the field and leave it alone.** Picking the nearest
  option would be a silent wrong answer on a form the user is about to save.
- **anything else** (checkbox, file, number) — skipped in this pass. Nothing
  asked for them, and a number field has no label-matching problem worth
  solving blind.

Every existing guard is inherited, because they are the reason this feature
is safe to have at all:

- a field that already has a value is never overwritten,
- a field the user is typing in (`document.activeElement`) is never touched,
- each field is filled at most once per page.

### Options UI

A section per vault id the settings know about, each with an optional name
and rows of *field → value*. The field name is chosen from the harvested
`cddRegFormFieldMap` for that vault when one exists (it already lists every
`entity`/`batch`/`sample` field the vault defines), and typed freely when it
does not — a vault whose map has not been harvested yet must still be
configurable.

## E · Initial amount and units from the stoichiometry row

### Problem

The amount that goes into the new sample is the amount in the reaction — it
is written in the stoichiometry row the Register link sits in, and then
typed again by hand on the registration page.

### The page

The fields exist in the DOM from the start, behind an unticked checkbox:

| what | locator |
|---|---|
| the gate | `input[name="molecule[batch][create_new_sample]"]` |
| Initial Amount | `[name*="inventory_events_attributes"][name$="[value]"]` |
| Units | `[name$="[inventory_samples_attributes][0][units]"]` (a `<select>`) |

Located by `name`, never by `id`. The amount input's id in vault 8158 is
`inventory_event_field_159500`, and that number is a per-vault field
definition id — hardcoding it would make the feature quietly do nothing in
every other vault.

The Units select offers: `g, kg, mg, µg, ng, mL, L, µL, M, mM, µM, nM, mol,
mmol, µmol, nmol, pmol, count`.

### Decision

**The ELN side** stamps two more parameters onto the Register link, beside
the `cdd_eln_id` it already sets: `cdd_amount` and `cdd_amount_unit`.

The value is read from **the stoichiometry row the clicked link is in**
(`link.closest('[data-autotest-id="stoichiometry-row"]')`), not from the
parsed payload. The payload's row order is not the table's display order,
and the row under the link is the one the user is registering — matching it
back to a payload entry would be inventing a chance to get it wrong. See the
row-numbering comment in `inject/parsers/sample-data.js`.

Within that row, the Amounts cell prints `Mass: 6.38 g` or `Volume: 3.16 mL`.
**Mass is preferred; Volume is the fallback** — a solid product is registered
by what was isolated, and a row with only a volume is a liquid. A row with
neither (`Mass: Required`, the untouched product row) stamps nothing, and the
registration page fills nothing.

**The registration side** does nothing until the user ticks *Create a New
Sample*. That tick is what decides a sample record gets created on save, and
it is the user's decision, not the plugin's. A `change` listener on the
checkbox fills both fields the moment it goes on.

Units map onto the select by exact text after normalising the micro sign
(`uL` → `µL`, `ug` → `µg`) and trimming. **No match means the unit is left
unset** and the amount is still filled — a number with the wrong unit is
worse than a number with no unit, and the select is right there.

The same guards as D: never overwrite a non-empty field, never touch a
focused one, fill once.

## Not in scope

`shared/eln-id-carry.js` stores its target field label **globally**, while
its own comment says the label is per-vault configuration ("Internal ID in
this vault, something else in the next"). That is a real inconsistency, and
the per-vault store this spec introduces would be its natural home — but
moving it means migrating a setting users already have, which has nothing to
do with either request here. Recorded as debt, deliberately left alone.

## Verification

No test runner. The pure parts — unit normalisation, the mass/volume choice,
the vault-keyed storage shape — are checked with the usual throwaway `node`
script.

The rest is live, on the vault the user pointed at
(`eu.collaborativedrug.com` vault 8158, form reachable from ELN `KRAP-0821`):

1. Set `Origin → Synthesized` for vault 8158 in the options page.
2. From a stoichiometry row with a mass, click Register.
3. The form opens with Internal ID filled as before, and `Origin` now reading
   `Synthesized`.
4. Tick *Create a New Sample* — Initial Amount and Units fill from the row.
5. Set a default whose value is not one of the select's options; that field
   stays untouched and nothing else breaks.
6. Open `/molecules/new` by hand, with no `cdd_eln_id`: nothing is filled.

**Nothing is saved at any point.** The vault is production; the verification
ends at "the fields show the right values".

Release: bundled with the 0.1 µL injection step and the ID-only tab title as
one version bump, per the user's "damo to von ako jeden balik". The tag is
pushed only on explicit approval.
