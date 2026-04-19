export function absoluteUrl(url) {
    if (!url) return null;
    return new URL(url, window.location.origin).toString();
}

export function viewUrlToEditUrl(viewUrl) {
    if (!viewUrl) return null;
    return viewUrl.replace(/\/dose_response_plot\/view(\?|$)/, "/dose_response_plot/edit$1");
}

export function editUrlToPutUrl(editUrl) {
    if (!editUrl) return null;
    return editUrl.replace(/\/edit(\?.*)?$/, "/");
}