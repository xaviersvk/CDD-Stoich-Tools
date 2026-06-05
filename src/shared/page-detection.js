export function isElnEntryPage() {
  const path = location.pathname || "";
  return /eln/i.test(path) || /entry/i.test(path);
}