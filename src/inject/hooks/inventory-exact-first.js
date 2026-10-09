// inject/hooks/inventory-exact-first.js
//
// Inventory → search. CDD's keyword search splits "SM000008" into "SM" and
// "000008" (the server's own `highlights` show only <em>SM</em> on most
// hits), so it returns every sample in the vault, sorted by Name, 30 to a
// page — the sample asked for came 15th, and for another query could be on
// page 2. The same endpoint matches exactly when the text is quoted.
//
// So the search request itself is answered with both: the original query
// and the quoted one, merged — exact hits first, the rest after them with
// those hits taken out. CDD gets one ordinary response and renders its own
// table, so every row looks and behaves exactly as usual.
//
//   POST /vaults/<v>/inventory_search.json   {"text":"SM000008","page":0,…}
//   → { inventory_entries: [...], total_count, all_available_units }
//
// Only the XHR CDD uses for this request is touched, and only when the text
// has no quotes and no `*` (then the chemist is steering the search). On
// any failure the original request goes out untouched.

const PATH = /\/vaults\/\d+\/inventory_search\.json(?:$|\?)/;

// The exact hits are also published on <html> as `data-cdd-exact` (JSON:
// names and sample links), so the content script can lift those rows into
// an "Exact" table above CDD's (ui-fixes/inventory-exact-table.js). An empty
// attribute means "no exact hits for this search".
const EXACT_ATTR = "data-cdd-exact";

function publish(hits, url) {
    const vault = /\/vaults\/(\d+)\//.exec(url)?.[1];
    const payload = hits.length
        ? JSON.stringify(hits.map((e) => ({
            name: e.name,
            url: vault && e.batch?.molecule_id
                ? `/vaults/${vault}/molecules/${e.batch.molecule_id}#molecule-inventory_samples/${e.id}`
                : null,
        })))
        : "";
    document.documentElement.setAttribute(EXACT_ATTR, payload);
}

function parseBody(body) {
    if (typeof body !== "string") return null;
    try {
        const parsed = JSON.parse(body);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function wantsExact(request) {
    const text = typeof request?.text === "string" ? request.text.trim() : "";
    return text !== "" && !/["*]/.test(text);
}

async function post(url, headers, body) {
    const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { json: await response.json(), contentType: response.headers.get("content-type") };
}

function merge(original, exact, page) {
    const entries = Array.isArray(original.inventory_entries) ? original.inventory_entries : [];
    const hits = Array.isArray(exact.inventory_entries) ? exact.inventory_entries : [];
    if (!hits.length) return original;
    const hitIds = new Set(hits.map((e) => e.id));
    const rest = entries.filter((e) => !hitIds.has(e.id));
    // The hits lead page 1 only; later pages just lose their duplicates.
    return { ...original, inventory_entries: page === 0 ? [...hits, ...rest] : rest };
}

// Make the XHR look finished with `text` as its body, the way a real one
// does: state, status, body, headers, then the three events (dispatching
// also runs the on… handlers, which is what axios listens on).
function complete(xhr, url, text, contentType) {
    const define = (name, value) =>
        Object.defineProperty(xhr, name, { configurable: true, get: () => value });
    define("readyState", 4);
    define("status", 200);
    define("statusText", "OK");
    define("responseURL", new URL(url, location.href).href);
    define("responseText", text);
    define("response", xhr.responseType === "json" ? JSON.parse(text) : text);
    const headers = `content-type: ${contentType || "application/json; charset=utf-8"}\r\n`;
    xhr.getAllResponseHeaders = () => headers;
    xhr.getResponseHeader = (name) =>
        String(name).toLowerCase() === "content-type"
            ? contentType || "application/json; charset=utf-8"
            : null;
    for (const type of ["readystatechange", "load", "loadend"]) {
        xhr.dispatchEvent(new Event(type));
    }
}

export function installInventoryExactFirst() {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__cddExact = String(method).toUpperCase() === "POST" && PATH.test(String(url))
            ? { url: String(url), headers: {} }
            : null;
        return origOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        if (this.__cddExact) this.__cddExact.headers[name] = value;
        return origSetHeader.call(this, name, value);
    };

    XMLHttpRequest.prototype.send = function (body) {
        const ctx = this.__cddExact;
        const request = ctx && parseBody(body);
        if (!request || !wantsExact(request)) {
            if (request) publish([], ctx.url);
            return origSend.call(this, body);
        }

        const xhr = this;
        const page = Number(request.page) || 0;
        (async () => {
            const [original, exact] = await Promise.all([
                post(ctx.url, ctx.headers, request),
                post(ctx.url, ctx.headers, { ...request, text: `"${request.text.trim()}"`, page: 0 }),
            ]);
            const merged = merge(original.json, exact.json, page);
            const hits = Array.isArray(exact.json.inventory_entries) ? exact.json.inventory_entries : [];
            // Lifted to the top of page 1 only, so only page 1 shows them apart.
            publish(page === 0 ? hits : [], ctx.url);
            complete(xhr, ctx.url, JSON.stringify(merged), original.contentType);
        })().catch((err) => {
            console.debug("[CDD Stoich Tools] exact-first search failed, sending as is", err);
            publish([], ctx.url);
            origSend.call(xhr, body);
        });
    };
}
