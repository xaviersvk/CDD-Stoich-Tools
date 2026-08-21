// content/features/ui-fixes/plate-location-csv.js
//
// The tail both plate-location exports share: given a list of { name, href }
// plates, look up each one's Inventory Location and download the CSV.
//
// The two callers reach that list very differently — plate-list-export.js pages
// through the Plates list, plate-location-export.js scans compound search
// results — but from there on they were the same 29 lines, down to the file
// name and the column headings. Only the finding differs; the resolving does
// not.
//
// Everything about WHEN to run (the size confirmation, its threshold, the
// cancel wiring, the finally block) stays in the callers, which disagree about
// all of it.

import { getPlateInfo } from "../../api/plate-info.js";
import { mapLimit } from "../../utils/concurrency.js";
import { buildCsv, downloadCsv } from "../../utils/csv.js";

// Concurrent plate-page fetches: enough to be quick, polite to CDD.
const CONCURRENCY = 4;

/**
 * resolveAndDownloadPlateLocations({ plates, status, stop })
 *
 * Fetches each plate's page (api/plate-info.js — cached and shared with the
 * Location column and the hover bubble), writes progress into `status`, and
 * downloads a name + location CSV sorted by name for an easy walk of the lab.
 *
 * `stop()` is polled by mapLimit between plates and again before the download,
 * so cancelling never leaves a half-resolved file on disk.
 *
 * Returns the number of rows written, or null when cancelled — in which case
 * `status` already says so.
 */
export async function resolveAndDownloadPlateLocations({ plates, status, stop }) {
    let done = 0;
    const rows = await mapLimit(
        plates,
        CONCURRENCY,
        async (plate) => {
            const { inventoryLocation } = await getPlateInfo(plate.href);
            done += 1;
            status.textContent = `Resolving locations… ${done}/${plates.length}`;
            return [plate.name, inventoryLocation || ""];
        },
        stop
    );

    if (stop()) {
        status.textContent = "Cancelled";
        return null;
    }

    const resolved = rows.filter(Boolean);
    resolved.sort((a, b) =>
        a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" })
    );

    downloadCsv(
        "cdd-plate-locations.csv",
        buildCsv(["Plate Name", "Inventory Location"], resolved)
    );
    status.textContent = `Exported ${resolved.length} plate(s)`;
    return resolved.length;
}
