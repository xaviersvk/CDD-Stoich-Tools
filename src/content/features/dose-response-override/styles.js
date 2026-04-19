

    export function injectDoseResponseOverrideStyles() {
        if (document.getElementById("cdd-override-styles")) return;

        const style = document.createElement("style");
        style.id = "cdd-override-styles";
        style.textContent = `
        .cdd-dose-response-actionbar {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-top: 4px;
            margin-left: 8px;
            flex-wrap: wrap;
        }

        .cdd-dose-response-override-btn {
            appearance: none;
            border: 0;
            border-radius: 999px;
            padding: 4px 12px;
            min-height: 26px;
            font-size: 12px;
            font-weight: 600;
            line-height: 1;
            background: #2563eb;
            color: #fff;
            cursor: pointer;
            box-shadow: 0 1px 2px rgba(0,0,0,0.12);
            transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease, background 0.12s ease;
        }

        .cdd-dose-response-override-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 3px 8px rgba(0,0,0,0.16);
            background: #1d4ed8;
        }

        .cdd-dose-response-override-btn:active {
            transform: translateY(0);
            box-shadow: 0 1px 2px rgba(0,0,0,0.12);
        }

        .cdd-dose-response-override-btn.loading {
            background: #64748b;
            cursor: wait;
            opacity: 0.95;
        }

        .cdd-dose-response-override-btn.success {
            background: #16a34a;
        }

        .cdd-dose-response-override-btn.error {
            background: #dc2626;
        }

        .cdd-dose-response-override-link {
            font-size: 12px;
        }

        .cdd-easy-override-toggle {
            font-weight: 600;
        }

        .cdd-easy-override-toggle.enabled {
            color: #dc2626 !important;
        }
        
.cdd-separator {
    display: inline-block;
    width: 1px;
    height: 14px;
    background: rgba(0,0,0,0.2);
    margin: 0 8px;
    vertical-align: middle;
}
    `;
        document.head.appendChild(style);
    }