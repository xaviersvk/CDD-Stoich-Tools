export function isCddHost() {
  return /collaborativedrug\.com$/i.test(location.hostname) ||
      /collaborativedrug\.com/i.test(location.hostname);
}

export function isElnEntryPage() {
  const path = location.pathname || "";
  return /eln/i.test(path) || /entry/i.test(path);
}