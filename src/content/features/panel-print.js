// content/features/panel-print.js
import { STATE } from "../state.js";
import { escapeHtml } from "../utils/dom.js";
import {EVENT_SOURCE} from "../../shared/event-types";



export function printPanel() {
    const payload = STATE.lastPayload;
    if (!payload?.samples?.length) {
        alert("No sample data available.");
        return;
    }

    const rowsHtml = payload.samples.map(sample => `
        <tr>
            <td>${escapeHtml(sample.reactionLabel || "")}</td>
            <td>${escapeHtml(sample.name || "")}</td>
            <td>${escapeHtml(sample.location || "")}</td>
            <td>${escapeHtml(sample.concentration || "")}</td>
            <td>${escapeHtml(sample.purity || "")}</td>
            <td>${escapeHtml(sample.density || "")}</td>
        </tr>
    `).join("");

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
            <tr>
                <th>Reaction</th>
                <th>Name</th>
                <th>Location</th>
                <th>Concentration</th>
                <th>Purity</th>
                <th>Density</th>
            </tr>
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