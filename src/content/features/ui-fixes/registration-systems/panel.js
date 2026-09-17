// content/features/ui-fixes/registration-systems/panel.js
//
// "Create multiple systems" beside CDD's own "Create a new System", and the
// card it opens underneath: a box with one prefix per line, and a list of
// what will be made before anything is. The run drives CDD's own Create
// dialog one system at a time; every system starts at 1.
//
// The link lives inside CDD's React section and is put back whenever it is
// repainted. The card does not: it hangs off <body>, placed under the link,
// so the re-render after every Save cannot take a run in progress with it.

import { CURRENT_VALUE, PLAN_ADD, parsePrefixes, planSystems } from "./system-model.js";
import { createSystem, existingPrefixes } from "./page-dom.js";

export const LINK_CLASS = "cdd-regsys-link";
export const CARD_CLASS = "cdd-regsys-card";

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// The link copies CDD's own: same class, same "add" icon.
export function buildLink(createLink, onOpen) {
    const link = el("a", `${createLink.className} ${LINK_CLASS}`);
    link.href = "#";
    const icon = createLink.querySelector("img")?.cloneNode(true);
    if (icon) link.append(icon);
    link.append(el("span", null, " Create multiple systems"));
    link.addEventListener("click", (event) => {
        event.preventDefault();
        onOpen(link);
    });
    return link;
}

export function buildCard() {
    const card = el("div", `cdd-fc-card ${CARD_CLASS}`);
    card.hidden = true;

    const head = el("div", "cdd-fc-head");
    head.append(el("span", "cdd-fc-title", "Create registration systems"));
    head.append(el("span", "cdd-fc-note", "One prefix per line. Each starts at 1."));

    const text = el("textarea", "cdd-regsys-text");
    text.rows = 8;
    text.placeholder = "PRJ-SM\nPRJ-AB\n…";

    const list = el("div", "cdd-fc-list");
    const foot = el("div", "cdd-fc-foot");
    const run = el("button", "cdd-fc-add", "Create");
    run.type = "button";
    const cancel = el("button", "cdd-fc-cancel", "Close");
    cancel.type = "button";
    const status = el("span", "cdd-fc-status");
    foot.append(run, cancel, status);

    card.append(head, text, list, foot);

    let plan = [];
    let lines = [];
    let running = false;
    let anchor = null;

    function render() {
        plan = planSystems(parsePrefixes(text.value), existingPrefixes());
        list.textContent = "";
        list.hidden = plan.length === 0;
        lines = plan.map((item) => {
            const line = el("div", "cdd-fc-row");
            if (item.status !== PLAN_ADD) line.classList.add("cdd-fc-row--skip");
            line.append(el("span", "cdd-fc-name", item.prefix));
            if (item.note) line.append(el("span", "cdd-fc-why", item.note));
            list.append(line);
            return line;
        });
        const add = plan.filter((item) => item.status === PLAN_ADD).length;
        run.textContent = `Create ${plural(add, "system")}`;
        run.disabled = running || add === 0;
    }

    // Right edge under the link, in page coordinates so it scrolls with it.
    function place() {
        if (!anchor?.isConnected) return;
        const box = anchor.getBoundingClientRect();
        card.style.top = `${box.bottom + window.scrollY + 6}px`;
        card.style.left = `${Math.max(8, box.right + window.scrollX - card.offsetWidth)}px`;
    }

    text.addEventListener("input", () => { if (!running) render(); });
    cancel.addEventListener("click", () => { card.hidden = true; });
    window.addEventListener("resize", () => { if (!card.hidden) place(); });

    run.addEventListener("click", async () => {
        const todo = plan.map((item, index) => ({ item, line: lines[index] })).filter(({ item }) => item.status === PLAN_ADD);
        running = true;
        run.disabled = true;
        cancel.disabled = true;
        text.disabled = true;
        status.classList.remove("is-done");

        let made = 0;
        try {
            for (const { item, line } of todo) {
                status.textContent = `Creating ${made + 1} of ${todo.length}: ${item.prefix}…`;
                await createSystem(item.prefix, CURRENT_VALUE);
                line.classList.add("cdd-fc-row--done");
                made += 1;
            }
            text.value = "";
            status.textContent = `Created ${plural(made, "system")}.`;
            status.classList.add("is-done");
        } catch (error) {
            status.textContent = `Created ${made} of ${todo.length}. Stopped at "${todo[made]?.item.prefix}" — ${error.message}.`;
        } finally {
            running = false;
            cancel.disabled = false;
            text.disabled = false;
            run.disabled = true;
        }
    });

    return {
        card,
        // A new link after a repaint takes over as the anchor.
        anchorTo(link) {
            anchor = link;
            if (!card.hidden) place();
        },
        toggle(link) {
            anchor = link;
            if (running) return;
            card.hidden = !card.hidden;
            if (card.hidden) return;
            status.textContent = "";
            render();
            place();
            text.focus();
        },
    };
}
