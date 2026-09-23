// inject/hooks/content-type.js
//
// Response types that cannot hold a JSON payload. The fetch and XHR hooks
// skip reading these bodies — every Turbo navigation is a full HTML page, and
// a run's heat maps are ~400 kB of text/javascript apiece — while anything
// else (JSON, text/plain, no type at all) is still read, so JSON that CDD
// serves under a loose type keeps working.
const NOT_JSON_RE = /html|css|javascript|ecmascript|turbo-stream|^image\/|^font\/|^audio\/|^video\//i;

export function isSurelyNotJson(contentType) {
    return NOT_JSON_RE.test(contentType || "");
}
