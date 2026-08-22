// shared/places-editor.js
//
// Editor for the categories a phrase is filed under: the current ones as
// chips (✕ removes one), plus one input — free text, or ▾ to pick an
// existing category — and an Add button. Used by the save dialog on the
// page and by the phrase rows in Settings.
//
// DOM-only. Class names for the caller's stylesheet:
//   .cdd-places            wrapper
//   .cdd-places__chips     chip row
//   .cdd-place-chip        one category; .cdd-place-chip__x its remove button
//   .cdd-places__add       the input row; .cdd-places__add-btn its button

import { makeComboInput } from "./combo-input.js";
import { phraseCategories, sanitizeCategories } from "./phrases.js";

export function makeCategoriesEditor({ categories = [], phrases = [], onChange, inputClass = "" } = {}) {
    let current = sanitizeCategories(categories);

    const root = document.createElement("div");
    root.className = "cdd-places";

    const chips = document.createElement("div");
    chips.className = "cdd-places__chips";

    const addRow = document.createElement("div");
    addRow.className = "cdd-places__add";

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 40;
    input.placeholder = "Category — type a new one or pick ▾";
    input.className = inputClass;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "cdd-places__add-btn";
    addBtn.textContent = "+ Add";
    addBtn.title = "File the phrase under this category as well";

    addRow.append(input, addBtn);
    // Only categories the phrase is not already in.
    makeComboInput(input, () =>
        phraseCategories(phrases).filter((c) => !current.some((x) => x.toLowerCase() === c.toLowerCase()))
    );

    const emit = () => onChange?.(getCategories());

    const renderChips = () => {
        chips.replaceChildren();
        if (!current.length) {
            const none = document.createElement("span");
            none.className = "cdd-place-chip cdd-place-chip--none";
            none.textContent = "No category";
            chips.appendChild(none);
            return;
        }
        for (const category of current) {
            const chip = document.createElement("span");
            chip.className = "cdd-place-chip";
            chip.textContent = category;
            const x = document.createElement("button");
            x.type = "button";
            x.className = "cdd-place-chip__x";
            x.textContent = "✕";
            x.title = `Remove from ${category}`;
            x.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                current = current.filter((c) => c !== category);
                renderChips();
                emit();
            });
            chip.appendChild(x);
            chips.appendChild(chip);
        }
    };

    // Adds what is typed; returns false when there is nothing to add.
    const commitPending = () => {
        const next = sanitizeCategories([...current, input.value]);
        input.value = "";
        if (next.length === current.length) return false;
        current = next;
        renderChips();
        emit();
        return true;
    };

    addBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        commitPending();
        input.focus();
    });
    input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        commitPending();
    });

    root.append(chips, addRow);
    renderChips();

    function getCategories() {
        return current.slice();
    }

    return {
        element: root,
        getCategories,
        // What the user typed but did not press Add for — the save dialog
        // treats it as one more category rather than losing it.
        commitPending,
        focus: () => input.focus(),
    };
}

export const PLACES_STYLES = `
  .cdd-places { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .cdd-places__chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .cdd-place-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 8px;
    font: 12px Arial, sans-serif;
    border-radius: 999px;
  }
  .cdd-place-chip--none { padding-right: 8px; opacity: 0.7; }
  .cdd-place-chip__x {
    padding: 0 5px;
    font: 11px Arial, sans-serif;
    line-height: 16px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
  }
  .cdd-places__add { display: flex; gap: 6px; align-items: stretch; }
  .cdd-places__add > .cdd-combo { flex: 1 1 0; }
  .cdd-places__add-btn { flex: 0 0 auto; white-space: nowrap; }
`;
