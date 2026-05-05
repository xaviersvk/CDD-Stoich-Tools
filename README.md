# CDD-Stoich-Tools

## 🌐 Availability

This extension is available as an official browser plugin with regular updates and ongoing feature development:

- Chrome/Brave Web Store: https://chromewebstore.google.com/detail/cdd-stoichiometric-table/ghbhjmmmgejokgekdcbcmgcfaoddlffg
- Firefox Add-ons: https://addons.mozilla.org/en-GB/firefox/addon/cdd-stoichiometric-table-tools/

The plugin is actively maintained and continuously improved based on real user workflows and feedback.

## Environment
- OS used for build: Windows 11
- Node.js: 22.13.1
- npm: 10.8.3

## Install
npm install

## Build
npm run build

## Package
Build output is generated into the extension package directory / dist directory used for AMO upload.

## Notes
- No remote code is executed.
- All extension logic is bundled locally with Vite.
- The submitted extension package is built from this source code without manual post-processing.


# Description

Browser extension that enhances the CDD Vault ELN interface with missing functionality for everyday lab workflows.

The goal is simple: remove friction from working with samples, stoichiometry tables, and dose-response data.

---

## 🚀 Core Features

### 🧪 Sample & Stoichiometry Enhancements
- Floating panel with quick access to stoichiometry tables
- Automatic grouping of samples by reaction
- Displays extended metadata:
    - concentration (with units)
    - purity
    - density
    - solvent / buffer
    - internal sample ID
- Visual indicators:
    - low purity highlighting
    - depleted sample marking

---

### ⚡ Efficiency Tools
- One-click copy of values directly from UI (copyable fields)
- Clipboard-friendly formatting (e.g. normalized concentrations)
- Faster access to data hidden in CDD payloads

---

### 🧬 Dose-Response Override (v3.0.0+)
- Override dose-response intercept values directly in UI
- Easy override toggle
- Action menu per plot
- Payload manipulation without backend access

---

### 🖨️ Printing & Reporting
- Print stoichiometry tables per reaction
- Clean structured layout including:
    - reaction image
    - experiment ID
    - timestamp
    - full table

---

### 🎯 UI Fixes & Improvements
- Fixes broken or annoying CDD UI behavior:
    - file dialog layout issues
    - truncated file names
    - button positioning
- Responsive improvements for dialogs and tables
- Smart default selection for filter operators (auto-selects meaningful option instead of "Any value")
- Groups depleted samples into a collapsible container to keep active samples clean and focused
- Fixes broken location tree layout and adds resizable panel with persistent width (localStorage)
### 🎛️ Smart Filter Defaults (NEW)

- Automatically adjusts filter operators to a more useful default
- Instead of the CDD default `Any value`, the extension selects the second logical option:
  - `has` for text fields (e.g. Author, Solvent)
  - `from` for date fields (e.g. Created)
- Works across:
  - ELN filters
  - Inventory filters (Material UI-based)
- Reacts dynamically when:
  - a new filter is added
  - the filter field is changed
---

## 🧠 How It Works (High-Level)

This extension injects logic directly into the CDD web app:

- Hooks into DOM via MutationObserver
- Enhances existing UI instead of replacing it
- Reads CDD payloads (XHR/fetch interception)
- Injects custom UI components dynamically

No backend. No API keys. Everything runs in the browser.

---

