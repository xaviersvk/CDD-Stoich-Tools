// content/features/ui-fixes/inventory-location-tree/tree-view.js
//
// The collapsed tree the user actually sees and drives, mounted over CDD's own
// autocomplete list.
//
// The contract with CDD (read this before changing anything here)
// ---------------------------------------------------------------
// We NEVER write the location ourselves. Choosing a location means clicking the
// original <li> that CDD rendered and letting CDD's React set both the visible
// text and `plate[inventory_location_id]`. That is why the source <ul> is only
// visually hidden, never removed or display:none'd. If CDD changes how the id is
// written, this feature keeps working, because it never knew the id in the first
// place. Verified live: clicking a hidden <li> set the hidden input to 60741.
//
// Two modes, one panel
//   - BROWSE (search box empty): the tree, collapsed, one level at a time.
//   - SEARCH (user typed): MUI has already filtered its own <li> list, so we
//     just render those matches flat, leaf first, path underneath. Search
//     results are meant to be flat - that is the point of searching.
//
// Keyboard: we own it in both modes and stop the event before MUI sees it,
// because MUI's highlight moves through the flat list underneath and would
// disagree with what is on screen.
//
// What it must NOT do: no network, no location ids, no writing form fields.

import {
    buildLocationTree,
    ancestorPaths,
    splitPath,
    looksLikePathList,
} from "./location-tree-model.js";

// Above this many search hits, rendering every row costs more than it helps.
const MAX_RESULTS = 200;

const NAV_KEYS = new Set([
    "ArrowDown",
    "ArrowUp",
    "ArrowRight",
    "ArrowLeft",
    "Enter",
    "Home",
    "End",
]);

// Mount the tree over `listbox`. Returns a controller, or null if this listbox
// is not a location list after all.
export function createLocationTreeView(listbox, input) {
    let options = readOptions(listbox);
    if (!looksLikePathList(options.map((option) => option.path))) return null;

    let tree = buildLocationTree(options);

    // The path CDD currently holds. Seeded from the input so a plate that
    // already has a location opens with that branch unfolded.
    let committedPath = input ? input.value.trim() : "";

    const expanded = new Set(ancestorPaths(committedPath));
    let cursorPath = committedPath || (tree.roots[0] ? tree.roots[0].path : "");

    // Rebuilt on every render: what is on screen, top to bottom, for the keys.
    let rows = [];

    listbox.classList.add("cdd-loc-source-hidden");

    const container = document.createElement("div");
    container.className = "cdd-loc-tree";

    // The search row mirrors the combobox input CDD already renders above. It
    // cannot BE an input: MUI closes the whole popup the moment focus leaves its
    // own field - verified live, focusing an input in here dropped activeElement
    // to BODY and shut the picker. That field keeps the focus and therefore every
    // keystroke, so this row only has to show what is being typed, and show that
    // typing is possible at all.
    const search = document.createElement("div");
    search.className = "cdd-loc-search";
    search.appendChild(buildSearchIcon());

    const searchText = document.createElement("span");
    searchText.className = "cdd-loc-search-text";
    search.appendChild(searchText);

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "cdd-loc-clear";
    clearButton.textContent = "\u00D7";
    clearButton.setAttribute("aria-label", "Clear search");
    clearButton.addEventListener("mousedown", (event) => {
        // The click must never reach the page: losing focus closes the picker.
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
    });
    search.appendChild(clearButton);

    // Clicking the row does nothing by design - the caret is in the field above -
    // but it must not be the click that closes the picker.
    search.addEventListener("mousedown", (event) => event.preventDefault());

    const list = document.createElement("div");
    list.className = "cdd-loc-list";
    list.setAttribute("role", "tree");

    container.appendChild(search);
    container.appendChild(list);
    listbox.parentElement.insertBefore(container, listbox.nextSibling);

    // ===== SELECTION =====

    // Hand the choice back to CDD by clicking its own option.
    function selectOption(optionIndex) {
        const option = options[optionIndex];
        if (!option || !option.el) return;

        committedPath = option.path;
        firePointerSequence(option.el);
    }

    // ===== SEARCH ROW =====

    // A mirror holds no state of its own: it shows whatever the field has. Once a
    // location is chosen the field holds that full path, which is a selection
    // rather than a search, so the row goes back to its placeholder.
    function paintSearchRow(query) {
        const empty = query === "" || query === committedPath;

        searchText.textContent = empty ? "Type to search locations" : query;
        searchText.classList.toggle("cdd-loc-placeholder", empty);
        clearButton.hidden = empty;
    }

    // Type into CDD's field on the user's behalf. The native setter is what makes
    // React notice - assigning `.value` straight leaves its own state stale, and
    // the list would keep showing the old matches.
    function setQuery(value) {
        if (!input) return;

        const setValue = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
        ).set;

        setValue.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // ===== RENDER BUDGET =====
    //
    // This tree lives inside someone else's React tree, and we redraw in response
    // to React's own DOM changes. That shape can always turn into a feedback loop
    // through some interaction we did not foresee. If it ever does, the worst the
    // user may suffer is the picker looking the way it did before - never a locked
    // up tab. So we count redraws, and stand down if they run away.
    const RENDER_BUDGET = 300;
    const BUDGET_WINDOW_MS = 2000;
    let windowStartedAt = 0;
    let rendersInWindow = 0;
    let standDown = false;

    function overBudget() {
        const now = Date.now();
        if (now - windowStartedAt > BUDGET_WINDOW_MS) {
            windowStartedAt = now;
            rendersInWindow = 0;
        }
        rendersInWindow += 1;
        return rendersInWindow > RENDER_BUDGET;
    }

    // ===== RENDER =====

    function render() {
        if (standDown) return;
        if (overBudget()) {
            standDown = true;
            console.warn(
                "[CDD location-tree] redraw loop detected - handing the field back to CDD",
            );
            destroy();
            return;
        }

        // React owns this Paper; if it re-rendered us away, get back in.
        if (!container.isConnected && listbox.parentElement) {
            listbox.parentElement.insertBefore(container, listbox.nextSibling);
        }
        listbox.classList.add("cdd-loc-source-hidden");

        list.textContent = "";
        rows = [];

        const query = input ? input.value.trim() : "";
        const searching = query !== "" && query !== committedPath;

        paintSearchRow(query);

        if (searching) renderResults(query);
        else renderBranch(tree.roots);

        if (!rows.length) {
            const note = document.createElement("div");
            note.className = "cdd-loc-note";
            note.textContent = "No matching location.";
            list.appendChild(note);
            return;
        }

        if (!rows.some((row) => row.path === cursorPath)) cursorPath = rows[0].path;
        paintCursor();
    }

    function renderBranch(nodes) {
        for (const node of nodes) {
            list.appendChild(buildNodeRow(node));
            if (expanded.has(node.path)) renderBranch(node.children);
        }
    }

    function buildNodeRow(node) {
        const hasChildren = node.children.length > 0;
        const selectable = node.optionIndex !== null;
        const isOpen = expanded.has(node.path);

        const row = document.createElement("div");
        row.className = "cdd-loc-row";
        row.dataset.path = node.path;
        row.setAttribute("role", "treeitem");
        row.style.paddingLeft = `${6 + node.depth * 14}px`;
        if (selectable && node.path === committedPath) {
            row.classList.add("cdd-loc-current");
        }
        if (hasChildren) {
            row.classList.add("cdd-loc-branch");
            row.setAttribute("aria-expanded", String(isOpen));
        }

        if (hasChildren) {
            const caret = document.createElement("button");
            caret.type = "button";
            caret.className = "cdd-loc-caret" + (isOpen ? " cdd-loc-open" : "");
            caret.textContent = "\u25B6";
            caret.setAttribute("aria-label", isOpen ? "Collapse" : "Expand");
            caret.addEventListener("mousedown", (event) => {
                // mousedown, not click: MUI closes the popup on blur, and the
                // default mousedown is what moves focus off the search box.
                event.preventDefault();
                event.stopPropagation();
                toggle(node.path);
                cursorPath = node.path;
                render();
            });
            row.appendChild(caret);
        } else {
            const spacer = document.createElement("span");
            spacer.className = "cdd-loc-caret-spacer";
            row.appendChild(spacer);
        }

        const label = document.createElement("span");
        label.className = "cdd-loc-label";
        label.textContent = node.label;
        row.appendChild(label);

        if (node.selectableBelow > 0) {
            const count = document.createElement("span");
            count.className = "cdd-loc-count";
            count.textContent = String(node.selectableBelow);
            row.appendChild(count);
        }

        row.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            cursorPath = node.path;
            activate(node);
        });

        rows.push({
            path: node.path,
            node,
            activate: () => activate(node),
        });

        return row;
    }

    // A node that can be chosen is chosen; a node that is only a container
    // opens instead, so a single click always does the one useful thing.
    function activate(node) {
        if (node.optionIndex !== null) {
            selectOption(node.optionIndex);
            return;
        }
        toggle(node.path);
        render();
    }

    function toggle(path) {
        if (expanded.has(path)) expanded.delete(path);
        else expanded.add(path);
    }

    function renderResults(query) {
        const shown = options.slice(0, MAX_RESULTS);

        for (const option of shown) {
            const segments = splitPath(option.path);
            const leaf = segments[segments.length - 1] || option.path;
            const parent = segments.slice(0, -1).join(" \u203A ");

            const row = document.createElement("div");
            row.className = "cdd-loc-row cdd-loc-result";
            row.dataset.path = option.path;
            row.setAttribute("role", "option");
            if (option.path === committedPath) row.classList.add("cdd-loc-current");

            const leafEl = document.createElement("span");
            leafEl.className = "cdd-loc-leaf";
            appendHighlighted(leafEl, leaf, query);
            row.appendChild(leafEl);

            if (parent) {
                const pathEl = document.createElement("span");
                pathEl.className = "cdd-loc-path";
                appendHighlighted(pathEl, parent, query);
                row.appendChild(pathEl);
            }

            row.addEventListener("mousedown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                selectOption(option.index);
            });

            list.appendChild(row);
            rows.push({
                path: option.path,
                node: null,
                activate: () => selectOption(option.index),
            });
        }

        if (options.length > shown.length) {
            const note = document.createElement("div");
            note.className = "cdd-loc-note";
            note.textContent = `${options.length - shown.length} more - keep typing to narrow.`;
            list.appendChild(note);
        }
    }

    function paintCursor() {
        for (const el of list.querySelectorAll(".cdd-loc-cursor")) {
            el.classList.remove("cdd-loc-cursor");
        }
        const current = list.querySelector(
            `[data-path="${cssEscape(cursorPath)}"]`,
        );
        if (!current) return;
        current.classList.add("cdd-loc-cursor");
        current.scrollIntoView({ block: "nearest" });
    }

    // ===== KEYBOARD =====

    function onKeyDown(event) {
        if (!NAV_KEYS.has(event.key)) return;
        if (!rows.length) return;

        event.preventDefault();
        event.stopPropagation();

        const at = Math.max(
            0,
            rows.findIndex((row) => row.path === cursorPath),
        );
        const row = rows[at];

        switch (event.key) {
            case "ArrowDown":
                moveTo(Math.min(at + 1, rows.length - 1));
                break;
            case "ArrowUp":
                moveTo(Math.max(at - 1, 0));
                break;
            case "Home":
                moveTo(0);
                break;
            case "End":
                moveTo(rows.length - 1);
                break;
            case "ArrowRight":
                if (row.node && row.node.children.length && !expanded.has(row.path)) {
                    expanded.add(row.path);
                    render();
                } else {
                    moveTo(Math.min(at + 1, rows.length - 1));
                }
                break;
            case "ArrowLeft":
                if (row.node && expanded.has(row.path)) {
                    expanded.delete(row.path);
                    render();
                } else if (row.node && row.node.depth > 0) {
                    const parents = ancestorPaths(row.path);
                    cursorPath = parents[parents.length - 1] || cursorPath;
                    paintCursor();
                }
                break;
            case "Enter":
                row.activate();
                break;
        }
    }

    function moveTo(index) {
        cursorPath = rows[index].path;
        paintCursor();
    }

    // ===== LIFECYCLE =====

    // MUI replaces the <li> set on every keystroke - but it also re-renders for
    // reasons of its own, handing us back the very same options. Redrawing on
    // those is how a redraw becomes a loop, so we always refresh the element
    // references (they are what we click, and React may have replaced the nodes)
    // and only redraw when the CHOICES actually changed.
    let signature = optionSignature(options);

    const listObserver = new MutationObserver(() => {
        options = readOptions(listbox);

        const nextSignature = optionSignature(options);
        if (nextSignature === signature) return;

        signature = nextSignature;
        tree = buildLocationTree(options);
        render();
    });
    listObserver.observe(listbox, { childList: true });

    // MUI refilters as the user types and that arrives as a listbox change - but a
    // keystroke that leaves the matches alone still changes the search row, so we
    // redraw on the input event too.
    function onInput() {
        render();
    }

    if (input) {
        input.addEventListener("keydown", onKeyDown);
        input.addEventListener("input", onInput);
    }

    function destroy() {
        listObserver.disconnect();
        if (input) {
            input.removeEventListener("keydown", onKeyDown);
            input.removeEventListener("input", onInput);
        }
        container.remove();
        listbox.classList.remove("cdd-loc-source-hidden");
    }

    render();

    return { destroy };
}

// ===== HELPERS =====

const SVG_NS = "http://www.w3.org/2000/svg";

// Drawn rather than typed: a glyph or emoji magnifier renders differently on
// every machine, and this one has to sit on the text baseline of a 13px row.
function buildSearchIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "cdd-loc-search-icon");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");

    const lens = document.createElementNS(SVG_NS, "circle");
    lens.setAttribute("cx", "7");
    lens.setAttribute("cy", "7");
    lens.setAttribute("r", "4.5");
    lens.setAttribute("fill", "none");
    lens.setAttribute("stroke", "currentColor");
    lens.setAttribute("stroke-width", "1.6");

    const handle = document.createElementNS(SVG_NS, "line");
    handle.setAttribute("x1", "10.6");
    handle.setAttribute("y1", "10.6");
    handle.setAttribute("x2", "14");
    handle.setAttribute("y2", "14");
    handle.setAttribute("stroke", "currentColor");
    handle.setAttribute("stroke-width", "1.6");
    handle.setAttribute("stroke-linecap", "round");

    svg.appendChild(lens);
    svg.appendChild(handle);
    return svg;
}

// What the user can currently choose, as one comparable string. Element identity
// is deliberately not part of it: React swapping the nodes is not a new choice.
function optionSignature(options) {
    return options.map((option) => option.path).join("\n");
}

function readOptions(listbox) {
    return [...listbox.querySelectorAll("li")].map((el, index) => ({
        index,
        path: el.textContent.trim(),
        el,
    }));
}

// MUI's option handler wants the whole pointer sequence, not a bare click.
function firePointerSequence(el) {
    const send = (type, Ctor) =>
        el.dispatchEvent(
            new Ctor(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                button: 0,
            }),
        );

    send("pointerdown", PointerEvent);
    send("mousedown", MouseEvent);
    send("pointerup", PointerEvent);
    send("mouseup", MouseEvent);
    send("click", MouseEvent);
}

function appendHighlighted(parent, text, query) {
    const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
    if (at < 0) {
        parent.textContent = text;
        return;
    }
    parent.appendChild(document.createTextNode(text.slice(0, at)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(at, at + query.length);
    parent.appendChild(mark);
    parent.appendChild(document.createTextNode(text.slice(at + query.length)));
}

function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
}
