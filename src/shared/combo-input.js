// shared/combo-input.js
//
// A text input that also offers a pick-list: type anything, or press ▾ and
// choose one of the existing values. Used for phrase categories in the
// content-script dialog and on the settings page — a <datalist> would do the
// same job on paper, but Chrome only shows it after a double-click or a
// keystroke, which nobody discovers.
//
// DOM-only; styling comes from the caller via the class names below:
//   .cdd-combo           wrapper (position: relative)
//   .cdd-combo__toggle   the ▾ button
//   .cdd-combo__menu     the absolutely positioned list
//   .cdd-combo__option   one row
//
// `getOptions()` is called each time the menu opens, so the list always
// reflects the current state.

export function makeComboInput(input, getOptions, { onPick } = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "cdd-combo";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cdd-combo__toggle";
    toggle.textContent = "▾";
    toggle.title = "Choose an existing one";
    toggle.tabIndex = -1;

    const menu = document.createElement("div");
    menu.className = "cdd-combo__menu";
    menu.hidden = true;

    const close = () => {
        menu.hidden = true;
        document.removeEventListener("mousedown", onOutside, true);
    };
    const onOutside = (event) => {
        if (wrapper.contains(event.target)) return;
        close();
    };

    const open = () => {
        const options = (getOptions() || []).filter(Boolean);
        menu.replaceChildren();
        if (!options.length) {
            const none = document.createElement("div");
            none.className = "cdd-combo__option cdd-combo__option--none";
            none.textContent = "Nothing saved yet — just type a new one";
            menu.appendChild(none);
        }
        for (const value of options) {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "cdd-combo__option";
            row.textContent = value;
            if (value === input.value.trim()) row.classList.add("cdd-combo__option--current");
            row.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                input.value = value;
                close();
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                onPick?.(value);
                input.focus();
            });
            menu.appendChild(row);
        }
        menu.hidden = false;
        document.addEventListener("mousedown", onOutside, true);
    };

    toggle.addEventListener("mousedown", (event) => event.preventDefault());
    toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (menu.hidden) open();
        else close();
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !menu.hidden) {
            event.stopPropagation();
            close();
        }
        if (event.key === "ArrowDown" && menu.hidden) {
            event.preventDefault();
            open();
        }
    });
    // Mousedown inside the menu must not steal focus / collapse selections.
    menu.addEventListener("mousedown", (event) => event.preventDefault());

    input.parentNode?.insertBefore(wrapper, input);
    wrapper.append(input, toggle, menu);
    return wrapper;
}

export const COMBO_STYLES = `
  .cdd-combo { position: relative; display: flex; align-items: stretch; min-width: 0; }
  .cdd-combo > input { flex: 1 1 auto; min-width: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .cdd-combo__toggle {
    flex: 0 0 auto;
    width: 24px;
    padding: 0;
    font: 11px Arial, sans-serif;
    cursor: pointer;
    border-top-left-radius: 0 !important;
    border-bottom-left-radius: 0 !important;
    border-left: 0 !important;
  }
  .cdd-combo__menu {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    z-index: 10;
    max-height: 180px;
    overflow: auto;
    margin-top: 2px;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  }
  .cdd-combo__option {
    display: block;
    width: 100%;
    padding: 5px 8px;
    text-align: left;
    font: 12px Arial, sans-serif;
    border: 0;
    border-radius: 0 !important;
    cursor: pointer;
  }
  .cdd-combo__option--none { cursor: default; opacity: 0.7; }
`;
