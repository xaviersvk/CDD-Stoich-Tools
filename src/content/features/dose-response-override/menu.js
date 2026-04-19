import {doseResponseOverrideState as state} from "./state";
import {handleDoNotCalculate, handleDoNotOverwrite, handleIc50GreaterThanMax, handleIc50LessThanMin} from "./actions";

export const actions = {
        ic50GreaterThanMax: {
            label: "IC50 > max",
            run: async (plotRoot) => {
                await handleIc50GreaterThanMax(plotRoot);
            }
        },
        ic50LessThanMin: {
            label: "IC50 < min",
            run: async (plotRoot) => {
                await handleIc50LessThanMin(plotRoot);
            }
        },
        doNotCalculate: {
            label: "Do not calculate",
            run: async (plotRoot) => {
                await handleDoNotCalculate(plotRoot);
            }
        },
        doNotOverwrite: {
            label: "Do not overwrite",
            run: async (plotRoot) => {
                await handleDoNotOverwrite(plotRoot);
            }
        }
    };

export function syncActionSelects (sourceSelect) {
        if (!sourceSelect) return;

        const newValue = sourceSelect.value;
        const allSelects = document.querySelectorAll(".cdd-dose-response-select");

        allSelects.forEach((select) => {
            if (select === sourceSelect) return;

            const wrapper = select.closest(".cdd-dose-response-actionbar");
            const button = wrapper?.querySelector(".cdd-dose-response-override-btn");

            if (button?.classList.contains("loading")) return;
            if (button?.classList.contains("success")) return;

            if (select.value !== newValue) {
                select.value = newValue;
            }
        });
    }

export function createActionMenu (plotRoot) {
        const wrapper = document.createElement("div");
        wrapper.className = "cdd-dose-response-actionbar";

        const select = document.createElement("select");
        select.className = "cdd-dose-response-select";

        Object.entries(actions).forEach(([key, action]) => {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = action.label;
            select.appendChild(option);
        });

        select.value = state?.selectedAction || "ic50GreaterThanMax";

        select.addEventListener("change", (event) => {
            const currentSelect = event.currentTarget;
            if (state) {
                state.selectedAction = currentSelect.value;
            }
            syncActionSelects(currentSelect);
        });

        const button = document.createElement("button");
        button.type = "button";
        button.className = "cdd-dose-response-override-btn";
        button.textContent = "Apply";

        button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const action = actions[select.value];
            if (!action) return;
            if (button.classList.contains("loading")) return;

            button.classList.remove("success", "error");
            button.classList.add("loading");
            button.textContent = "Applying…";

            try {
                await action.run(plotRoot);
                button.classList.remove("loading");
                button.classList.add("success");
                button.textContent = "Applied";
            } catch (error) {
                console.error("[CDD Override] Failed:", error);
                button.classList.remove("loading");
                button.classList.add("error");
                button.textContent = "Failed";

                setTimeout(() => {
                    button.classList.remove("error");
                    button.textContent = "Apply";
                }, 1800);
            }
        });

        wrapper.appendChild(select);
        wrapper.appendChild(button);

        return wrapper;
    }