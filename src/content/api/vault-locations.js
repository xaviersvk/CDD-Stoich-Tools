// content/api/vault-locations.js
//
// Every vault of the current account, and each one's saved location tree —
// what the Edit Locations "Merge vaults" view folds into one. All on the
// session cookie, all GETs, nothing switched (the header's vault links go
// through /switch_vault, which changes the user's current vault; these do
// not). Measured 2026-11-09, account 1046, seven vaults:
//
//   GET /api/internal/v1/vaults/{v}                 -> { id, name, account_id, … }
//   GET /api/internal/v1/accounts/{a}/vaults        -> [{ id, name, … }]
//   GET /vaults/{v}/inventory_field_definitions.json
//       -> { inventory_event_field_definitions: [{ id, data_type_name: "Location", … }] }
//   GET /vaults/{v}/inventory_event_field_definitions/{fieldId}/inventory_locations.json
//       -> { inventory_locations: [ tree, as the Edit Locations dialog loads it ] }
//
// The location field id differs per vault (133542, 133543, …), hence the
// definitions request in between. A vault with no locations answers [].

async function getJson(url) {
    const response = await fetch(url, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response.json();
}

// The account's vault list changes rarely; one request per page session.
// A failure is dropped so the next caller retries.
let vaultsPromise = null;

// Promise<[{ id: string, name: string }]>
export function loadAccountVaults(currentVaultId) {
    if (!vaultsPromise) {
        vaultsPromise = (async () => {
            const vault = await getJson(`/api/internal/v1/vaults/${currentVaultId}`);
            if (vault?.account_id == null) throw new Error("no account_id on the vault");
            const list = await getJson(`/api/internal/v1/accounts/${vault.account_id}/vaults`);
            if (!Array.isArray(list)) throw new Error("vault list is not an array");
            return list
                .filter((v) => v && v.id != null)
                .map((v) => ({ id: String(v.id), name: String(v.name ?? v.id) }));
        })();
        vaultsPromise.catch(() => {
            vaultsPromise = null;
        });
    }
    return vaultsPromise;
}

// Promise<raw roots array>. Not cached: the tree is what the user is editing.
export async function loadVaultLocationTree(vaultId) {
    const definitions = await getJson(`/vaults/${vaultId}/inventory_field_definitions.json`);
    const field = (definitions?.inventory_event_field_definitions || [])
        .find((d) => d?.data_type_name === "Location");
    if (!field) return [];
    const json = await getJson(
        `/vaults/${vaultId}/inventory_event_field_definitions/${field.id}/inventory_locations.json`,
    );
    return Array.isArray(json?.inventory_locations) ? json.inventory_locations : [];
}
