# Product suffix — which reaction an ID came from

**Since 15.5.0**, small letters since 15.6.0, counted by product since 15.7.0.
Settings → *Registration form → From the ELN* → **Product suffix**.

## 1. What it does

An ELN entry can hold several products — several stoichiometry tables, or one
table with more than one product row. When a product is registered, the entry
ID it carries gets a mark saying WHICH product of the entry it is; otherwise
every product would register under the same Internal ID.

Products are counted in the order the entry shows them: reaction 1's products,
then reaction 2's. Every product row counts, registered or not, so the ordinal
does not shift as people work.

Two settings decide what that mark looks like. They are independent, so there
are ten combinations:

| style ⟍ *Mark the first product too* | off (default) | on |
| --- | --- | --- |
| **Letters** | `MDX-113`, `MDX-113B`, `MDX-113C` | `MDX-113A`, `MDX-113B`, `MDX-113C` |
| **Small letters** | `MDX-113`, `MDX-113b`, `MDX-113c` | `MDX-113a`, `MDX-113b`, `MDX-113c` |
| **Letters after a dash** (default) | `MDX-113`, `MDX-113-B`, `MDX-113-C` | `MDX-113-A`, `MDX-113-B`, `MDX-113-C` |
| **Small letters after a dash** | `MDX-113`, `MDX-113-b`, `MDX-113-c` | `MDX-113-a`, `MDX-113-b`, `MDX-113-c` |
| **Numbers** | `MDX-113`, `MDX-113-2`, `MDX-113-3` | `MDX-113-1`, `MDX-113-2`, `MDX-113-3` |

The default is **letters after a dash**, first product bare: `MDX-113`,
`MDX-113-B`. Up to 15.8.0 it was a bare letter, `MDX-113B`, which reads as part
of the compound number rather than as a mark on it.

The default moved in 15.9.0 and nothing else did. The style is written to
storage only when someone picks one, so the change reaches exactly the people
who never chose — anyone who did, Letters included, keeps their choice. An ID
already written into a record is never rewritten; only the next one minted
follows the new default.

**Only products are marked, and only products are filled.** A Register link on
a reagent row writes nothing — a starting material is not a product of the
entry.

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
| The rule | `src/shared/eln-id-carry.js` — `productMark(ordinal, style, markFirst)`, reached through `productSuffix()`; the ordinal comes from `productOrdinalOf(samples, sample)` |
| Row → product | same file — `findRowSample(samples, tableIndex, rowNumber)`; the Register link matches its row by the number the table prints, exactly as `name-watch.js` does |
| Storage | same file — `cddElnTableSuffixStyle` (`"letter"` \| `"lower-letter"` \| `"dash-letter"` \| `"dash-lower-letter"` \| `"number"`), `cddElnTableSuffixFirst` (boolean) |
| Register link | `src/content/features/ui-fixes/eln-id-to-registration.js` — `stampLink()` |
| Panel button | `src/shared/eln-id-to-batch.js` — `composeBatchElnId()`, called from `sample-panel.js` |
| The UI | `src/options/options.html` + `options.js` — radios `elnTableSuffixStyle`, checkbox `elnTableSuffixFirst` |

`productMark()` is the only place that knows what a suffix looks like. Both
callers reach it through `productSuffix({ parallel, productIndex, style,
markFirst })`, so a change to the shape of a suffix is a change to one
function. Both feed it an ordinal from `productOrdinalOf()` over the same
array — `STATE.lastPayload.samples` — so the Register link and the panel
button cannot drift apart.

Letters come from a `columnName(n)` helper — spreadsheet column names of
`index + 1` — which is why the 27th table gets `AA` rather than running off
the end of the alphabet. The four letter styles differ in two independent ways,
dash or no dash and capital or small, and `tableSuffix()` reads both off the
style name rather than branching four times. An unrecognised style falls back to
the original bare capital.

## 3. Two things to know before changing it

- **`markFirst` is a separate switch on purpose.** Whether an entry with one
  product should carry a mark at all is a different question from which
  alphabet the others are in. Folding it into the style would make "Numbers"
  mean two things at once.
- **The role comes from the payload, not the markup.** Ordinary product rows
  carry no `data-autotest-id` of their own, so `isProduct` is read from
  `STATE.lastPayload.samples`. Until that payload arrives, a Register link
  stamps nothing — an empty field beats a wrong ID on a registration. The same
  goes for a Register link outside any stoichiometry table: no row, no product,
  no stamp.

## 4. Testing it

`src/shared/eln-id-carry.js` has no imports and no top-level `chrome` access,
so node can exercise it directly:

```bash
node -e "import('./src/shared/eln-id-carry.js').then(m => console.log(
  m.productMark(0, 'letter', true),        // A
  m.productMark(1, 'dash-letter', false),  // -B
  m.productMark(1, 'lower-letter', false), // b
  m.productMark(2, 'number', true)         // -3
))"
```

Anything past that needs the built extension: reload `dist/`, open an entry
with two or more tables, and check the Register link and the panel button
write the same string.
