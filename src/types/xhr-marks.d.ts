// Types only — nothing here is bundled.
//
// The page-world hooks hang a few private marks on an XMLHttpRequest between
// open() and send(). Declaring them keeps the type checker and Qodana from
// reporting each write as an assignment to an undefined property.

interface XMLHttpRequest {
    /** xhr-hook.js: the URL given to open(), read back on load. */
    __cdd_url?: string | URL;
    /** create-request-capture.js: the method given to open(), upper-cased. */
    __cddMethod?: string;
    /** create-request-capture.js: the URL given to open(). */
    __cddUrl?: string | URL;
    /** inventory-exact-first.js: set on the inventory search POST, else null. */
    __cddExact?: { url: string; headers: Record<string, string> } | null;
}
