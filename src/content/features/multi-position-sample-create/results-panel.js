// content/features/multi-position-sample-create/results-panel.js
//
// A floating, position:fixed progress/results panel appended to <body>.
//
// Why floating (not the action bar): clicking CDD's native Save creates the
// first sample AND closes the Create Sample dialog, which destroys the action
// bar. Batch progress and per-position results must therefore live in an overlay
// that is independent of the dialog's lifecycle.
//
// Pure DOM. No network, no payload knowledge — the orchestrator drives it.

const PANEL_ID = "cdd-mp-float";

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

// total = how many samples this batch intends to create (used for the "k / N"
// progress readout). Returns a controller the orchestrator calls into.
export function createResultsPanel(total) {
    // Replace any leftover panel from a previous run.
    document.getElementById(PANEL_ID)?.remove();

    let done = 0;
    let intendedTotal = total;

    const root = el("div", "cdd-mp-float");
    root.id = PANEL_ID;

    const header = el("div", "cdd-mp-float__header");
    const title = el("span", "cdd-mp-float__title", "Batch create");
    const progress = el("span", "cdd-mp-float__progress");
    const closeBtn = el("button", "cdd-mp-float__close", "×");
    closeBtn.type = "button";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", () => root.remove());
    header.append(title, progress, closeBtn);

    const status = el("div", "cdd-mp-float__status");
    const error = el("div", "cdd-mp-float__error");
    error.style.display = "none";
    const rows = el("div", "cdd-mp-float__rows");
    const footer = el("div", "cdd-mp-float__footer");

    root.append(header, status, error, rows, footer);
    document.body.appendChild(root);

    function refreshProgress() {
        progress.textContent = `${done} / ${intendedTotal}`;
    }
    refreshProgress();

    const controller = {
        root,

        setTitle(text) {
            title.textContent = text;
        },

        setTotal(n) {
            intendedTotal = n;
            refreshProgress();
        },

        setStatus(text) {
            status.textContent = text;
        },

        setError(text) {
            if (!text) {
                error.style.display = "none";
                return;
            }
            error.textContent = text;
            error.style.display = "";
        },

        // { position, ok, label }
        addRow({ position, ok, label }) {
            done += 1;
            refreshProgress();
            const row = el("div", `cdd-mp-float__row ${ok ? "cdd-mp-ok" : "cdd-mp-err"}`);
            const mark = el("span", "cdd-mp-float__mark", ok ? "✓" : "✗");
            const pos = el("span", "cdd-mp-float__pos", `pos ${position}`);
            const text = el("span", "cdd-mp-float__label", label || (ok ? "created" : "failed"));
            row.append(mark, pos, text);
            rows.appendChild(row);
            rows.scrollTop = rows.scrollHeight;
        },

        // Show a "Retry failed (N)" button wired to onRetry.
        showRetry(count, onRetry) {
            footer.replaceChildren();
            const btn = el("button", "cdd-mp-float__retry", `Retry failed (${count})`);
            btn.type = "button";
            btn.addEventListener("click", () => onRetry());
            footer.appendChild(btn);
        },

        hideRetry() {
            footer.replaceChildren();
        },

        // Visually mark the panel busy (prevents the impression it is finished).
        setBusy(busy) {
            root.classList.toggle("cdd-mp-float--busy", !!busy);
        },

        remove() {
            root.remove();
        },
    };

    return controller;
}
