// inject/hooks/create-request-capture.js  (PAGE / MAIN world)
//
// Snapshots the BODY of an outgoing create-sample request (so the content side
// can reuse the real request CDD generated as a faithful payload template — the
// dialog is React-built and `new FormData(form)` cannot reproduce it) AND taps
// the RESPONSE to that request (so the batch orchestrator can confirm the native
// first save SUCCEEDED before it replays the remaining positions).
//
// Why this lives in the page world: a content script has its own `window.fetch`
// and cannot see CDD's network calls (see ARCHITECTURE_REVIEW §3). Only page-
// world code can read the outgoing request body and the live response.
//
// SAFETY: strictly read-only. It always forwards the real call untouched,
// snapshots the body synchronously *before* send (the body stream is one-shot,
// so we copy entries, never re-read it), reads the response only via a CLONE
// (never draining the body CDD itself consumes), and swallows every error so it
// can never break a real create. It does NOT replay, POST, or modify anything.
//
// What it must NOT do: send requests, alter the body, drain CDD's response, or
// block the call.

const CREATE_URL_RE = /\/(inventory_samples|specified_batches)(\?|$)/;

// Child sample created from a parent's debit event: CDD sends a PUT to
//   /vaults/<v>/molecules/<m>/inventory_samples/<parentId>/create_sample_from_debit
// with the same multipart shape (nested under child_sample_attributes).
const CREATE_FROM_DEBIT_URL_RE = /\/inventory_samples\/\d+\/create_sample_from_debit(\?|$)/;

// A request whose body is worth snapshotting as a replay template: the plain
// create (POST) or the child-sample-from-debit variant (PUT).
function isCreateRequest(method, url) {
    if (!url) return false;
    if (method === "POST" && CREATE_URL_RE.test(url)) return true;
    if (method === "PUT" && CREATE_FROM_DEBIT_URL_RE.test(url)) return true;
    return false;
}

// Monotonic id pairing a captured request with its captured response. A single
// native create is ever in flight at a time, but correlating removes any doubt.
let correlationSeq = 0;

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

export function installCreateRequestCapture(onCapture, onResponse) {
    const reportCapture = (record) => {
        try {
            onCapture?.(record);
        } catch {
            /* never let reporting break the page */
        }
    };
    const reportResponse = (record) => {
        try {
            onResponse?.(record);
        } catch {
            /* never let reporting break the page */
        }
    };

    // Read a response WITHOUT consuming the body CDD will read: clone first.
    function tapResponse(correlationId, resp) {
        let ok = false;
        let status = 0;
        try {
            ok = !!resp.ok;
            status = resp.status || 0;
        } catch {
            /* opaque/edge response — fall through with defaults */
        }
        let clone = null;
        try {
            clone = resp.clone();
        } catch {
            /* body already locked elsewhere — report without text */
        }
        if (!clone) {
            reportResponse({ correlationId, ok, status, bodyText: "" });
            return;
        }
        clone.text().then(
            (bodyText) => reportResponse({ correlationId, ok, status, bodyText }),
            () => reportResponse({ correlationId, ok, status, bodyText: "" })
        );
    }

    // ---- fetch ----
    const origFetch = window.fetch;
    if (typeof origFetch === "function" && !origFetch.__cddCreateCapture) {
        const wrapped = function (input, init) {
            let correlationId = null;
            try {
                const opts = init || {};
                const url = typeof input === "string" ? input : input?.url;
                const method = (
                    opts.method ||
                    (input && typeof input !== "string" && input.method) ||
                    "GET"
                ).toUpperCase();
                if (isCreateRequest(method, url)) {
                    const body = opts.body ?? (input && typeof input !== "string" ? input.body : undefined);
                    const snap = snapshotBody(body);
                    if (snap) {
                        correlationId = ++correlationSeq;
                        reportCapture({ correlationId, via: "fetch", url, method, body: snap });
                    }
                }
            } catch {
                /* ignore */
            }

            const promise = origFetch.apply(this, arguments);

            // Tap the response on a DERIVED promise so CDD's own promise is
            // untouched (same value, same rejection). Only when we captured.
            if (correlationId != null && promise && typeof promise.then === "function") {
                promise.then(
                    (resp) => {
                        try {
                            tapResponse(correlationId, resp);
                        } catch {
                            /* ignore */
                        }
                    },
                    (err) => {
                        reportResponse({
                            correlationId,
                            ok: false,
                            status: 0,
                            bodyText: String(err?.message || err || "network error"),
                            networkError: true,
                        });
                    }
                );
            }
            return promise;
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
                if (isCreateRequest(this.__cddMethod, this.__cddUrl)) {
                    const snap = snapshotBody(body);
                    if (snap) {
                        const correlationId = ++correlationSeq;
                        reportCapture({ correlationId, via: "xhr", url: this.__cddUrl, method: this.__cddMethod, body: snap });
                        this.addEventListener("loadend", () => {
                            try {
                                reportResponse({
                                    correlationId,
                                    ok: this.status >= 200 && this.status < 300,
                                    status: this.status || 0,
                                    bodyText: typeof this.responseText === "string" ? this.responseText : "",
                                });
                            } catch {
                                /* ignore */
                            }
                        });
                    }
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
