# Panel CSV export — design

Date: 2026-08-07
Status: approved by user (conversation)

## Problem

The Samples panel can print its table, but the data often needs further
work in Excel. Printing to PDF and retyping is the current workaround.

## Decisions (from brainstorming)

- Scope: the **panel table** only (the same content the panel's Print
  button produces) — not the per-reaction print sheets.
- Format: **CSV in the English convention** — comma separator, dot as the
  decimal point, values unchanged from what the panel shows.
- No libraries (extension CSP forbids CDN scripts); no new permissions.

## Components

### `src/content/features/panel-csv.js` (new)

- `exportPanelCsv(visibleFields)`:
  - reuses `buildPrintColumns(samples, visibleFields)` exported from
    `panel-print.js` — one column definition for print and CSV;
  - rows: same filtering as the print table (products only when the
    show-products option is on) and the same optional `Type` column
    ("Product"/"") when a product is present;
  - escaping: a field is quoted when it contains a comma, a double quote,
    a newline or a leading/trailing space; inner quotes are doubled
    (RFC 4180);
  - line ending `\r\n`, UTF-8 **with BOM** so Excel reads the diacritics
    correctly;
  - download: `Blob` + object URL + a temporary `<a download>` click,
    then `URL.revokeObjectURL`. File name:
    `cdd-samples-<entry id>-YYYY-MM-DD.csv`, where the entry id comes from
    the ELN page (`ID: PHA-MDX-0095` in the header) and falls back to the
    numeric id in the URL.

### `src/content/features/panel-print.js`

Export `buildPrintColumns` (currently module-private) so the CSV module
can share it. No behaviour change.

### `src/content/features/sample-panel.js`

A **CSV** button next to Print in the panel header; its click handler
mirrors the Print one (`exportPanelCsv(visibleFields)`).

## Verification

`npm run build` + live: click CSV on entry 2504170 → a file downloads;
opening it in Excel shows the same columns/rows as the panel Print, with
numbers as numbers; with products enabled, the Type column appears and
product rows are included.

Ships in release 12.6.0. The tag is pushed only after explicit user
approval.
