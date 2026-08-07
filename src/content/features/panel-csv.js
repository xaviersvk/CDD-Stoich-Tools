// content/features/panel-csv.js
//
// CSV export of the Samples panel table — the same rows and columns the
// panel's Print button produces, in the English CSV convention (comma
// separator, dot decimals, RFC 4180 quoting) plus a UTF-8 BOM so Excel
// reads the diacritics correctly.

import { STATE } from "../state.js";
import { buildPrintColumns } from "./panel-print.js";
import { isShowProductsEnabled } from "../../shared/show-products-flag.js";

// Quote when the value could otherwise break the row: separator, quote,
// newline, or padding spaces Excel would swallow. Inner quotes double.
function csvCell(value) {
    const text = value == null ? "" : String(value);
    if (/[",\r\n]/.test(text) || text !== text.trim()) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function csvRow(cells) {
    return cells.map(csvCell).join(",");
}

// "PHA-MDX-0095" from the ELN header, else the numeric id from the URL,
// else "entry" — only used to name the file.
function resolveEntryId() {
    const headerMatch = (document.body?.innerText || "").match(/\bID:\s*([A-Za-z0-9-]+)/);
    if (headerMatch) return headerMatch[1];

    const urlMatch = location.pathname.match(/\/entries\/(\d+)/);
    return urlMatch ? urlMatch[1] : "entry";
}

function today() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function downloadCsv(filename, csv) {
    // The BOM is what makes Excel treat the file as UTF-8.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    // Give the download a tick to start before the URL dies.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportPanelCsv(visibleFields = {}) {
    const payload = STATE.lastPayload;
    if (!payload?.samples?.length) {
        alert("No sample data available.");
        return;
    }

    const showProducts = isShowProductsEnabled();
    const samples = payload.samples.filter((s) => showProducts || !s.isProduct);
    const anyProduct = samples.some((s) => s.isProduct);
    const columns = buildPrintColumns(samples, visibleFields);

    const header = [
        "Reaction",
        ...(anyProduct ? ["Type"] : []),
        ...columns.map((column) => column.label),
    ];

    const lines = [csvRow(header)];
    samples.forEach((sample, index) => {
        lines.push(csvRow([
            sample.reactionLabel || "",
            ...(anyProduct ? [sample.isProduct ? "Product" : ""] : []),
            ...columns.map((column) => column.getText(sample, index)),
        ]));
    });

    downloadCsv(`cdd-samples-${resolveEntryId()}-${today()}.csv`, lines.join("\r\n"));
}
