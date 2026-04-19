export function getCsrfToken() {
    return (
        document.querySelector('meta[name="csrf-token"]')?.content ||
        document.querySelector('meta[name="csrfToken"]')?.content ||
        ""
    );
}

export async function fetchJson(url, options = {}) {
    const csrf = getCsrfToken();

    const response = await fetch(url, {
        credentials: "include",
        headers: {
            Accept: "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest",
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
            ...(options.body ? { "Content-Type": "application/json" } : {})
        },
        ...options
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} for ${url}\n${text}`);
    }

    return response.json();
}