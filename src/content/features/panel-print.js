// content/features/panel-print.js
import { STATE } from "../state.js";
import { escapeHtml } from "../utils/dom.js";
import { EVENT_SOURCE } from "../../shared/event-types";
import {
    SAMPLE_PANEL_FIELDS,
    resolveFieldValue,
    getCustomFieldsFromSample,
} from "../../shared/sample-panel-fields.js";

// Build print columns from the same enabled fields the floating panel uses:
// enabled static registry fields first, then enabled custom fields. A column is
// kept only if at least one sample actually has a value for it.
function buildPrintColumns(samples, visibleFields) {
    const columns = [];

    for (const field of SAMPLE_PANEL_FIELDS) {
        if (!visibleFields[field.key]) continue;
        columns.push({
            label: field.label,
            getText: (sample) => resolveFieldValue(field, sample)?.text ?? "",
        });
    }

    // Custom field values, precomputed per sample for direct lookup.
    const customMaps = samples.map((sample) => {
        const map = {};
        for (const field of getCustomFieldsFromSample(sample)) {
            map[field.key] = field.value;
        }
        return map;
    });

    const customKeys = [];
    for (const map of customMaps) {
        for (const key of Object.keys(map)) {
            if (visibleFields[key] && !customKeys.includes(key)) customKeys.push(key);
        }
    }

    for (const key of customKeys) {
        const label = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
        columns.push({
            label,
            getText: (sample, index) => {
                const value = customMaps[index]?.[key];
                return value == null ? "" : String(value);
            },
        });
    }

    // Drop columns where no sample has any data.
    return columns.filter((column) =>
        samples.some((sample, index) => column.getText(sample, index) !== "")
    );
}

export function printPanel(visibleFields = {}) {
    const payload = STATE.lastPayload;
    if (!payload?.samples?.length) {
        alert("No sample data available.");
        return;
    }

    const samples = payload.samples;
    const columns = buildPrintColumns(samples, visibleFields);

    const headHtml = ["Reaction", ...columns.map((c) => c.label)]
        .map((label) => `<th>${escapeHtml(label)}</th>`)
        .join("");

    const rowsHtml = samples
        .map((sample, index) => {
            const cells = [
                sample.reactionLabel || "",
                ...columns.map((column) => column.getText(sample, index)),
            ];
            return `<tr>${cells.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
        })
        .join("");

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>CDD Samples</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 24px;
            color: #111;
        }
        h1 {
            margin-bottom: 16px;
            font-size: 20px;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            font-size: 12px;
        }
        th, td {
            border: 1px solid #ccc;
            padding: 6px 8px;
            text-align: left;
            vertical-align: top;
        }
        th {
            background: #f3f4f6;
        }
    </style>
</head>
<body>
    <h1>CDD Samples</h1>
    <table>
        <thead>
            <tr>${headHtml}</tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
    </table>
</body>
</html>
`;

    window.postMessage({
        source: EVENT_SOURCE,
        type: "PRINT_REQUEST",
        payload: { html }
    }, "*");
}