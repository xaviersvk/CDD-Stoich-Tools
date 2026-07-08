// content/utils/csv.js

// Quote a CSV field per RFC 4180: wrap in quotes, double any embedded quote.
// Locations like "Lab 2 > Fridge 2" are safe but plate names can carry commas.
export function csvField(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

// header: array of column titles; rows: array of arrays.
export function buildCsv(header, rows) {
    const lines = [header, ...rows].map((cols) => cols.map(csvField).join(","));
    // Leading BOM so Excel reads UTF-8 (accented location names) correctly.
    return "﻿" + lines.join("\r\n") + "\r\n";
}

export function downloadCsv(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Give the download a tick to start before releasing the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
