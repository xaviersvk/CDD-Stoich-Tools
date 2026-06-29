// content/features/multi-position-sample-create/response-store.js
//
// One-slot, Promise-based wait for the RESPONSE to the native first create.
//
// The batch orchestrator must NOT replay until CDD's own (native) first save has
// come back successful. The inject world taps that response and forwards it as
// EVENTS.CREATE_SAMPLE_RESPONDED -> message-router -> notifyCreateResponse here.
// The orchestrator arms the waiter immediately BEFORE clicking the native Save,
// so the response cannot be missed, then awaits waitForNextResponse().
//
// Single in-flight create at a time, so a single pending slot is sufficient.
//
// What it must NOT do: DOM, network, payload mutation. Pure async coordination.

let pending = null; // { resolve, timer }
let lastResponse = null;

// Drop any stale response and clear a dangling waiter. Called right before a new
// native save so a previous create's response can never satisfy this round.
export function armResponseWaiter() {
    lastResponse = null;
    if (pending) {
        clearTimeout(pending.timer);
        pending = null;
    }
}

// Resolve with the next create response, or a synthetic timeout record. The
// record shape mirrors the inject payload: { ok, status, bodyText, correlationId? }.
export function waitForNextResponse(timeoutMs = 30000) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            if (pending && pending.resolve === resolve) pending = null;
            resolve({
                ok: false,
                timedOut: true,
                status: 0,
                bodyText: "",
                errorText: `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for CDD's create response.`,
            });
        }, timeoutMs);
        pending = { resolve, timer };
    });
}

// Called by the message router when the page world forwards a create response.
export function notifyCreateResponse(record) {
    if (!record) return;
    lastResponse = record;
    if (pending) {
        clearTimeout(pending.timer);
        const { resolve } = pending;
        pending = null;
        resolve(record);
    }
}

export function getLastResponse() {
    return lastResponse;
}
