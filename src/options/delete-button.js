// options/delete-button.js
//
// The small "✕" that ends a row in every list on the settings page — prefix
// colours, registration defaults, remembered densities and names, phrases.
// One builder so they cannot drift apart; the class picks the look
// (`prefix-color-delete` for editable rows, `density-memory-delete` for
// remembered ones).

export function deleteButton({ className, label, title, onClick }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-label", label);
    button.textContent = "✕";
    if (title) button.title = title;
    button.addEventListener("click", onClick);
    return button;
}
