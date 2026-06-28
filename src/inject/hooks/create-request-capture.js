// inject/hooks/create-request-capture.js  (PAGE / MAIN world)
//
// Snapshots the BODY of an outgoing create-sample request so the content side
// can use the real request CDD generated as a faithful payload template — for
// the case where the dialog is React-built and `new FormData(form)` cannot
// reproduce it.
//
// Why this lives in the page world: a content script has its own `window.fetch`
// and cannot see CDD's network calls (see ARCHITECTURE_REVIEW §3). Only page-
// world code can read the outgoing request body.
//
// SAFETY: this is strictly read-only. It always forwards the real call
// untouched, snapshots synchronously *before* send (the body stream is one-shot,
// so we copy entries, never re-read it), and swallows every error so it can
// never break a real create. It does NOT replay, POST, or modify anything.
//
// What it must NOT do: send requests, alter the body, or block the call.

const CREATE_URL_RE = /\/(inventory_samples|specified_batches)(\?|$)/;

// Serialise a request body into a postMessage-safe shape, or null if we can't.
function snapshotBody(body) {
    if (body instanceof FormData) {
        const entries = [];
        let hadNonString = false;
        for (const [k, v] of body.entries()) {
            if (typeof v === "string") {
                entries.push([k, v]);
            } else {
                hadNonString = true; // File/Blob — flagged; not faithfully clonable here
                entries.push([k, `[${v?.constructor?.name || "blob"}]`]);
            }
        }
        return { kind: "formdata", entries, hadNonString };
    }
    if (typeof body === "string") return { kind: "string", text: body };
    if (body instanceof URLSearchParams) return { kind: "urlencoded", text: body.toString() };
    return null; // ReadableStream / Blob / ArrayBuffer — cannot snapshot safely
}

export function installCreateRequestCapture(onCapture) {
    const report = (record) => {
        try {
            onCapture(record);
        } catch {
            /* never let reporting break the page */
        }
    };

    // ---- fetch ----
    const origFetch = window.fetch;
    if (typeof origFetch === "function" && !origFetch.__cddCreateCapture) {
        const wrapped = function (input, init) {
            try {
                const opts = init || {};
                const url = typeof input === "string" ? input : input?.url;
                const method = (
                    opts.method ||
                    (input && typeof input !== "string" && input.method) ||
                    "GET"
                ).toUpperCase();
                if (url && method === "POST" && CREATE_URL_RE.test(url)) {
                    const body = opts.body ?? (input && typeof input !== "string" ? input.body : undefined);
                    const snap = snapshotBody(body);
                    if (snap) report({ via: "fetch", url, method, body: snap });
                }
            } catch {
                /* ignore */
            }
            return origFetch.apply(this, arguments);
        };
        wrapped.__cddCreateCapture = true;
        window.fetch = wrapped;
    }

    // ---- XMLHttpRequest (safety net) ----
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    if (typeof origSend === "function" && !origSend.__cddCreateCapture) {
        XMLHttpRequest.prototype.open = function (method, url) {
            this.__cddMethod = String(method || "GET").toUpperCase();
            this.__cddUrl = url;
            return origOpen.apply(this, arguments);
        };
        const wrappedSend = function (body) {
            try {
                if (this.__cddUrl && this.__cddMethod === "POST" && CREATE_URL_RE.test(this.__cddUrl)) {
                    const snap = snapshotBody(body);
                    if (snap) report({ via: "xhr", url: this.__cddUrl, method: "POST", body: snap });
                }
            } catch {
                /* ignore */
            }
            return origSend.apply(this, arguments);
        };
        wrappedSend.__cddCreateCapture = true;
        XMLHttpRequest.prototype.send = wrappedSend;
    }
}
