// content/features/multi-position-sample-create/capture-store.js
//
// Holds the most recent create-sample request snapshot forwarded from the page
// world (EVENTS.CREATE_SAMPLE_CAPTURED). This is the fallback payload source for
// the multi-position feature when `new FormData(form)` cannot reproduce the body
// (React-built dialog).
//
// Internal to the Batch Create feature: no other feature reads this, and nothing
// here knows how the snapshot was obtained (fetch vs XHR) — that is the capture
// module's private concern.
//
// What it must NOT do: DOM, network, payload mutation. It only remembers.

let lastCaptured = null;

export function setCapturedCreate(record) {
    if (!record || !record.url || !record.body) return;
    lastCaptured = { ...record, capturedAt: Date.now() };
}

export function getCapturedCreate() {
    return lastCaptured;
}
