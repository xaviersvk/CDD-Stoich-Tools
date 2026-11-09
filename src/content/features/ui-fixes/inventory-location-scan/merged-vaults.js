// content/features/ui-fixes/inventory-location-scan/merged-vaults.js
//
// "Merge vaults" in the Edit Locations footer: a switch that swaps CDD's tree
// on the left for one tree folded from every vault of the account. A location
// whose path of names is the same in several vaults is one row, and the dots
// after it say which vaults hold it — hover them for the names, and for the
// vaults that have the parent but not this one.
//
// Each row has one action, for the vault the dialog belongs to:
//   - Show: the location is here. The view switches off and CDD's tree opens
//     at it, selected, so CDD's own row icons add a location or box under it.
//   - Create here: it is not. The missing part of its path is made through
//     CDD's own buttons (dialog-dom.js, as Scan racks does), a box at the
//     size the other vault has it. The view stays on, so several can be made
//     in a row; nothing is kept until the user presses Save.
// Both find the place in the LIVE tree (bridge) by name path, not by id, so
// a location created but not saved yet counts as here.
//
// CDD's tree is hidden, never unmounted, so unsaved edits in it survive the
// view; and Create here drives it while hidden — React renders it all the
// same. The merged trees are the SAVED ones (fetched, vault-locations.js);
// what Create here made in this dialog is drawn as a ring in this vault's
// colour until it is saved.
//
// The switch stays as it was left for the page session, and the trees are
// fetched once per dialog: switching off and on again in the same dialog
// does not reload them, reopening the dialog does.

import { extractVaultId } from "../../../../shared/registration-form.js";
import {
    countBoxes,
    filterMergedTree,
    locateInLiveTree,
    mergeVaultTrees,
    nameKey,
} from "../../../../shared/merged-location-tree.js";
import { mouseClick } from "../../../utils/dom.js";
import { loadAccountVaults, loadVaultLocationTree } from "../../../api/vault-locations.js";
import {
    createBoxUnder,
    createLocationUnder,
    findLeftColumn,
    footerAnchor,
    nextFrame,
    treeItems,
} from "./dialog-dom.js";
import { expandTree, readRawTree, readTreeState } from "./tree-source.js";

const SWITCH_CLASS = "cdd-merge-switch";
export const MERGED_PANEL_CLASS = "cdd-merged-tree";
const MERGED_ATTR = "data-cdd-merged";

// Told apart on white at dot size; the current vault always takes the first.
const COLORS = ["#1565c0", "#e65100", "#2e7d32", "#c2185b", "#6a1b9a", "#00838f", "#f9a825", "#5d4037"];
const MISSING_COLOR = "#9e9e9e";

const ICON_FOLDER =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const ICON_BOX =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 5l6-3 6 3v6l-6 3-6-3z M2 5l6 3 6-3 M8 8v6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';

let enabled = false;
const loads = new WeakMap(); // dialog -> Promise<data>
const createdIn = new WeakMap(); // dialog -> Set<merged key> made by Create here
let view = null; // see mount()

function sortVaults(vaults, currentId) {
    const current = vaults.filter((v) => v.id === currentId);
    const others = vaults
        .filter((v) => v.id !== currentId)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
    return [...current, ...others];
}

async function loadMerged() {
    const currentId = extractVaultId(location.pathname);
    if (!currentId) throw new Error("not on a vault page");
    const vaults = sortVaults(await loadAccountVaults(currentId), currentId);
    const results = await Promise.all(vaults.map(async (vault) => {
        try {
            return { ...vault, roots: await loadVaultLocationTree(vault.id) };
        } catch (error) {
            // A vault the user cannot read is one missing colour, not a
            // missing view.
            console.debug("[CDD merge-vaults] could not read vault", vault.id, error);
            return { ...vault, roots: null };
        }
    }));
    const read = results.filter((r) => r.roots);
    // Colours go to vaults that have locations; an empty one has no dot to
    // tell apart.
    const color = new Map(read.filter((v) => v.roots.length)
        .map((v, i) => [v.id, COLORS[i % COLORS.length]]));
    return {
        currentId,
        vaults: read,
        failed: results.filter((r) => !r.roots),
        color,
        names: new Map(read.map((v) => [v.id, v.name])),
        // Vaults with no locations at all are not "missing" anything.
        withLocations: read.filter((v) => v.roots.length).map((v) => v.id),
        roots: mergeVaultTrees(read),
    };
}

function loadFor(dialog) {
    let promise = loads.get(dialog);
    if (!promise) {
        promise = loadMerged();
        loads.set(dialog, promise);
        promise.catch(() => loads.delete(dialog));
    }
    return promise;
}

function createdKeys(dialog) {
    let keys = createdIn.get(dialog);
    if (!keys) {
        keys = new Set();
        createdIn.set(dialog, keys);
    }
    return keys;
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function currentColor() {
    return view.data.color.get(view.data.currentId) || COLORS[0];
}

function isHere(node) {
    return node.vaults.includes(view.data.currentId) || createdKeys(view.dialog).has(node.key);
}

function renderLegend() {
    const { legend, data } = view;
    legend.replaceChildren();
    for (const vault of data.vaults) {
        const item = element("span", "cdd-mt-legend-item");
        if (vault.roots.length) {
            const dot = element("span", "cdd-mt-dot");
            dot.style.background = data.color.get(vault.id);
            item.append(dot, vault.name);
        } else {
            item.classList.add("cdd-mt-legend-empty");
            item.append(`${vault.name} (no locations)`);
        }
        if (vault.id === data.currentId) item.classList.add("cdd-mt-legend-current");
        legend.append(item);
    }
    for (const vault of data.failed) {
        const item = element("span", "cdd-mt-legend-item cdd-mt-legend-failed", `${vault.name}: could not read`);
        legend.append(item);
    }
}

function dotsFor(node, parentVaults) {
    const { data } = view;
    const dots = element("span", "cdd-mt-dots");
    for (const id of node.vaults) {
        const dot = element("span", "cdd-mt-dot");
        dot.style.background = data.color.get(id) || MISSING_COLOR;
        dots.append(dot);
    }
    const lines = [`In: ${node.vaults.map((id) => data.names.get(id)).join(", ")}`];
    const createdHere = !node.vaults.includes(data.currentId) && createdKeys(view.dialog).has(node.key);
    if (createdHere) {
        const ring = element("span", "cdd-mt-dot cdd-mt-dot-new");
        ring.style.borderColor = currentColor();
        dots.prepend(ring);
        lines.push(`Created in ${data.names.get(data.currentId) || "this vault"}, not saved yet`);
    }
    const missing = parentVaults.filter((id) =>
        !node.vaults.includes(id) && !(createdHere && id === data.currentId));
    if (missing.length) lines.push(`Not in: ${missing.map((id) => data.names.get(id)).join(", ")}`);
    dots.title = lines.join("\n");
    return dots;
}

function actionFor(node) {
    const here = isHere(node);
    const button = element("button", "cdd-mt-action", here ? "Show" : "Create here");
    button.type = "button";
    button.dataset.action = here ? "show" : "create";
    button.title = here
        ? "Open this location in this vault's tree"
        : `Create ${node.labels.join(" > ")} in this vault`;
    if (view.busy) button.disabled = true;
    return button;
}

function renderTree() {
    const { tree, data, expanded } = view;
    const filter = filterMergedTree(data.roots, view.query);
    view.byKey = new Map();
    const fragment = document.createDocumentFragment();

    const draw = (nodes, depth, parentVaults) => {
        for (const node of nodes) {
            if (filter && !filter.show.has(node.key)) continue;
            view.byKey.set(node.key, node);

            const hasChildren = node.children.length > 0;
            // A match's own children come back whole when it is opened; a
            // node that is only on the path to a match shows just that path.
            const autoOpen = filter?.open.has(node.key);
            const isOpen = hasChildren && (autoOpen || expanded.has(node.key));
            const onlyPath = autoOpen && !filter.matches.has(node.key) && !expanded.has(node.key);

            const row = element("div", "cdd-mt-row");
            row.dataset.key = node.key;
            row.style.paddingLeft = `${4 + depth * 16}px`;
            if (filter?.matches.has(node.key)) row.classList.add("cdd-mt-match");

            const chevron = element("span", "cdd-mt-chevron", hasChildren ? (isOpen ? "▾" : "▸") : "");
            const icon = element("span", "cdd-mt-icon");
            icon.innerHTML = node.isBox ? ICON_BOX : ICON_FOLDER;
            const label = element("span", "cdd-mt-label", node.label);
            row.append(chevron, icon, label);
            if (hasChildren && !isOpen) {
                const boxes = countBoxes(node);
                if (boxes) row.append(element("span", "cdd-mt-count", String(boxes)));
            }
            row.append(dotsFor(node, parentVaults), actionFor(node));
            fragment.append(row);

            if (isOpen) {
                const children = onlyPath
                    ? node.children.filter((child) => filter.show.has(child.key))
                    : node.children;
                draw(children, depth + 1, node.vaults);
            }
        }
    };
    draw(data.roots, 0, data.withLocations);

    if (!fragment.childNodes.length) {
        fragment.append(element("div", "cdd-mt-status", view.query ? "No location matches." : "No locations in any vault."));
    }
    tree.replaceChildren(fragment);
}

function setStatus(text) {
    view.tree.replaceChildren(element("div", "cdd-mt-status", text));
}

function say(text, isError = false) {
    if (!view) return;
    view.message.textContent = text;
    view.message.hidden = !text;
    view.message.classList.toggle("cdd-mt-message-error", isError);
}

/* ----- the live tree ----- */

async function waitFor(predicate, tries = 60) {
    for (let attempt = 0; attempt < tries; attempt += 1) {
        const value = predicate();
        if (value) return value;
        await nextFrame();
    }
    return null;
}

function rowOf(dialog, id) {
    return treeItems(dialog).find((item) => item.dataset.nodeid === String(id)) || null;
}

// MUI renders only the children of expanded nodes, so a row deep in the tree
// exists only once every location above it is open. Opens them (keeping
// what the user had open) and resolves with the row, or null.
async function revealRow(dialog, liveNodes, id) {
    const byId = new Map(liveNodes.map((node) => [String(node.id), node]));
    const chain = [];
    const seen = new Set();
    let cursor = byId.get(String(id));
    while (cursor && cursor.parentId != null && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        chain.push(String(cursor.parentId));
        cursor = byId.get(String(cursor.parentId));
    }
    if (!rowOf(dialog, id)) {
        const { expanded } = await readTreeState(dialog);
        expandTree([...new Set([...expanded, ...chain])]);
    }
    return waitFor(() => rowOf(dialog, id));
}

async function readLive() {
    const live = await readRawTree();
    if (!live) throw new Error("could not read this vault's tree");
    return live;
}

/* ----- the two actions ----- */

async function showHere(node) {
    const { dialog } = view;
    try {
        const live = await readLive();
        const spot = locateInLiveTree(live, node.labels);
        if (!spot || spot.missing.length) {
            say(`"${node.label}" is not in this vault's tree any more.`, true);
            return;
        }
        leaveMergedView(dialog);
        const item = await revealRow(dialog, live, spot.anchorId);
        if (!item) return;
        const content = item.querySelector(":scope > .MuiTreeItem-content");
        content?.scrollIntoView({ block: "center" });
        // CDD selects a row on a click on it: the right pane then edits it
        // and the row's own icons add under it.
        const label = content?.querySelector(".MuiTreeItem-label") || content;
        if (label && !content.classList.contains("Mui-selected")) mouseClick(label);
    } catch (error) {
        console.warn("[CDD merge-vaults] show failed", error);
        say(`Could not open "${node.label}": ${error.message}.`, true);
    }
}

async function createHere(node) {
    if (view.busy) return;
    const mine = view;
    const { dialog } = view;
    const keys = createdKeys(dialog);
    view.busy = true;
    say(`Creating ${node.labels.join(" > ")}…`);
    renderTree();
    try {
        const live = await readLive();
        const spot = locateInLiveTree(live, node.labels);
        if (!spot) throw new Error("this vault's tree has no root");
        if (!spot.missing.length) {
            keys.add(node.key);
            say(`"${node.label}" is already in this vault.`);
            return;
        }
        // The anchor's own icons make the first missing node, so its row
        // has to be on the page — hidden is fine, absent is not.
        if (!(await revealRow(dialog, live, spot.anchorId))) {
            throw new Error("its parent did not open in CDD's tree");
        }

        const have = node.labels.length - spot.missing.length;
        let parentId = spot.anchorId;
        for (let i = 0; i < spot.missing.length; i += 1) {
            const name = spot.missing[i];
            const isTarget = i === spot.missing.length - 1;
            if (isTarget && node.isBox && node.box) {
                parentId = await createBoxUnder(dialog, { parentId, name, ...node.box });
            } else {
                parentId = await createLocationUnder(dialog, { parentId, name });
            }
            keys.add(node.labels.slice(0, have + i + 1).map(nameKey).join("\u0000"));
        }
        say(`Created ${node.labels.join(" > ")}. Press Save to keep it.`);
    } catch (error) {
        // What was made stays — it is in CDD's tree, and CDD's Cancel is
        // what discards it.
        console.warn("[CDD merge-vaults] create failed", error);
        say(`Could not create "${node.label}": ${error.message}.`, true);
    } finally {
        mine.busy = false;
        if (view === mine && view.data) renderTree();
    }
}

/* ----- mounting ----- */

function mount(dialog) {
    const left = findLeftColumn(dialog);
    if (!left) return;

    const panel = element("div", MERGED_PANEL_CLASS);
    const input = element("input", "cdd-mt-filter");
    input.type = "text";
    input.placeholder = "Filter merged locations";
    input.setAttribute("aria-label", "Filter merged locations");
    const legend = element("div", "cdd-mt-legend");
    const note = element(
        "div",
        "cdd-mt-note",
        "Saved trees of all vaults. Show opens a location in this vault; Create here adds a missing one, then Save.",
    );
    const message = element("div", "cdd-mt-message");
    message.hidden = true;
    message.setAttribute("role", "status");
    const tree = element("div", "cdd-mt-tree");
    tree.setAttribute("role", "tree");
    panel.append(input, legend, note, message, tree);

    left.setAttribute(MERGED_ATTR, "");
    left.append(panel);

    // Enter here would be Save; swallowed before CDD sees it, as the
    // tree filter does.
    const onKeyDown = (event) => {
        if (event.key === "Enter" && event.target === input) {
            event.preventDefault();
            event.stopPropagation();
        }
    };
    window.addEventListener("keydown", onKeyDown, true);

    view = {
        dialog, left, panel, input, legend, message, tree,
        expanded: new Set(), query: "", data: null, byKey: new Map(), busy: false, onKeyDown,
    };

    input.addEventListener("input", () => {
        view.query = input.value;
        if (view.data) renderTree();
    });
    tree.addEventListener("click", (event) => {
        const row = event.target.closest(".cdd-mt-row");
        const node = row && view.byKey.get(row.dataset.key);
        if (!node) return;

        const action = event.target.closest(".cdd-mt-action");
        if (action) {
            if (action.dataset.action === "show") void showHere(node);
            else void createHere(node);
            return;
        }

        if (!node.children.length) return;
        const filter = filterMergedTree(view.data.roots, view.query);
        const open = filter?.open.has(node.key) || view.expanded.has(node.key);
        // Closing a branch the filter opened would just reopen it on the
        // next keystroke; a click there means "show me everything here".
        if (open && filter?.open.has(node.key) && !view.expanded.has(node.key) && !filter.matches.has(node.key)) {
            view.expanded.add(node.key);
        } else if (open) view.expanded.delete(node.key);
        else view.expanded.add(node.key);
        renderTree();
    });

    setStatus("Loading the vaults' locations…");
    const mine = view;
    loadFor(dialog).then(
        (data) => {
            if (view !== mine) return;
            view.data = data;
            renderLegend();
            renderTree();
        },
        (error) => {
            if (view !== mine) return;
            console.warn("[CDD merge-vaults] load failed", error);
            setStatus("Could not read the vaults' locations.");
        },
    );
}

function unmount() {
    if (!view) return;
    window.removeEventListener("keydown", view.onKeyDown, true);
    view.panel.remove();
    view.left.removeAttribute(MERGED_ATTR);
    view = null;
}

function syncView(dialog) {
    if (!enabled) {
        unmount();
        return;
    }
    if (view && view.dialog === dialog && view.panel.isConnected) return;
    unmount();
    mount(dialog);
}

function ensureSwitch(dialog, footer) {
    let input = footer.querySelector(`.${SWITCH_CLASS} input`);
    if (!input) {
        const label = element("label", SWITCH_CLASS);
        label.title = "Show one tree folded from every vault of the account";
        input = element("input");
        input.type = "checkbox";
        label.append(input, element("span", "cdd-merge-track"), element("span", "cdd-merge-text", "Merge vaults"));
        input.addEventListener("change", () => {
            enabled = input.checked;
            syncView(dialog);
        });
        const anchor = footerAnchor(footer);
        if (anchor) footer.insertBefore(label, anchor);
        else footer.prepend(label);
    }
    if (input.checked !== enabled) input.checked = enabled;
}

// Called on every discovery pass; cheap when nothing changed.
export function ensureMergedVaults(dialog, footer) {
    if (!footer) return;
    ensureSwitch(dialog, footer);
    syncView(dialog);
}

// Scan racks picks its target in CDD's tree, and Show hands the user that
// tree: both switch the merged view off.
export function leaveMergedView(dialog) {
    if (!enabled) return;
    enabled = false;
    const input = dialog?.querySelector(`.${SWITCH_CLASS} input`);
    if (input) input.checked = false;
    unmount();
}

export function closeMergedView() {
    unmount();
}
