// Strict match for a real ELN entry page: /vaults/<id>/eln/entries/<id>.
// Shared by the sample panel (sample-panel.js) and the ELN tab-title feature
// (eln-title.js) so both agree on what counts as an ELN entry page.
export function isElnEntryPage() {
  const path = location.pathname || "";
  return /^\/vaults\/\d+\/eln\/entries\/\d+/.test(path);
}