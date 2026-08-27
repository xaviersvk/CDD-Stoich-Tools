# Product suffix — which reaction an ID came from

**Since 15.5.0**, small letters since 15.6.0. Settings → *Registration form →
From the ELN* → **Product suffix**.

## 1. What it does

An ELN entry can hold several stoichiometry tables. When a product is
registered from one of them, the entry ID it carries gets a mark saying which
table it came out of — otherwise every product of the entry would register
under the same Internal ID.

Two settings decide what that mark looks like. They are independent, so there
are ten combinations:

| style ⟍ *Mark the first table too* | off (default) | on |
| --- | --- | --- |
| **Letters** (default) | `MDX-113`, `MDX-113B`, `MDX-113C` | `MDX-113A`, `MDX-113B`, `MDX-113C` |
| **Small letters** | `MDX-113`, `MDX-113b`, `MDX-113c` | `MDX-113a`, `MDX-113b`, `MDX-113c` |
| **Letters after a dash** | `MDX-113`, `MDX-113-B`, `MDX-113-C` | `MDX-113-A`, `MDX-113-B`, `MDX-113-C` |
| **Small letters after a dash** | `MDX-113`, `MDX-113-b`, `MDX-113-c` | `MDX-113-a`, `MDX-113-b`, `MDX-113-c` |
| **Numbers** | `MDX-113`, `MDX-113-2`, `MDX-113-3` | `MDX-113-1`, `MDX-113-2`, `MDX-113-3` |

The default — capital letters, first table bare — is what the extension wrote
before 15.5.0. Nothing changes until something is switched.

**Parallel ("bulk") reactions ignore both settings.** Their product keeps
`-<n><letter>`: `MDX-113-1A`, `-1B`, `-2A`, where `n` counts the entry's
parallel reactions and the letter is the one CDD itself prints beside the
reagent/product pair. That letter is on screen next to the row, so the ID has
to keep matching it — capital, even with a small-letter style picked.

Both routes that stamp an ID read the same settings:

- the **Register** link in a stoichiometry row (stamped into
  `?cdd_eln_id=…`, pre-fills the registration form);
- the **panel button** that writes onto a batch registered earlier.

Flipping a setting takes effect on an ELN entry already open — no page reload.

## 2. Where it lives

| Piece | File |
| --- | --- |
| The rule | `src/shared/eln-id-carry.js` — `tableSuffix(index, style, markFirst)`, reached through `productSuffix()` |
| Storage | same file — `cddElnTableSuffixStyle` (`"letter"` \| `"lower-letter"` \| `"dash-letter"` \| `"dash-lower-letter"` \| `"number"`), `cddElnTableSuffixFirst` (boolean) |
| Register link | `src/content/features/ui-fixes/eln-id-to-registration.js` — `stampLink()` |
| Panel button | `src/shared/eln-id-to-batch.js` — `composeBatchElnId()`, called from `sample-panel.js` |
| The UI | `src/options/options.html` + `options.js` — radios `elnTableSuffixStyle`, checkbox `elnTableSuffixFirst` |

`tableSuffix()` is the only place that knows what a suffix looks like. Both
callers reach it through `productSuffix({ parallel, tableIndex, style,
markFirst })`, so a change to the shape of a suffix is a change to one
function.

Letters come from a `columnName(n)` helper — spreadsheet column names of
`index + 1` — which is why the 27th table gets `AA` rather than running off
the end of the alphabet. The four letter styles differ in two independent ways,
dash or no dash and capital or small, and `tableSuffix()` reads both off the
style name rather than branching four times. An unrecognised style falls back to
the original bare capital.

## 3. Two things to know before changing it

- **`markFirst` is a separate switch on purpose.** Whether an entry with one
  reaction should carry a mark at all is a different question from which
  alphabet the others are in. Folding it into the style would make "Numbers"
  mean two things at once.
- **A Register link outside any stoichiometry table** gets `tableIndex` 0
  (`tableIndexOf()` returns 0 when `closest()` finds no table). With
  *Mark the first table too* on, such a link is marked as the first table.
  That is intended, not a bug.

## 4. Testing it

`src/shared/eln-id-carry.js` has no imports and no top-level `chrome` access,
so node can exercise it directly:

```bash
node -e "import('./src/shared/eln-id-carry.js').then(m => console.log(
  m.tableSuffix(0, 'letter', true),        // A
  m.tableSuffix(1, 'dash-letter', false),  // -B
  m.tableSuffix(1, 'lower-letter', false), // b
  m.tableSuffix(2, 'number', true)         // -3
))"
```

Anything past that needs the built extension: reload `dist/`, open an entry
with two or more tables, and check the Register link and the panel button
write the same string.
