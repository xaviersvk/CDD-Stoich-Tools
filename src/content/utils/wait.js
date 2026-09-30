// content/utils/wait.js
//
// Waiting on a page that CDD's React is repainting, for the features that
// drive CDD's own settings pages (field clipboard, registration systems).

// One beat: the next DOM mutation, or `ms`, whichever is first.
// Timers alone are throttled in a hidden tab; mutations are not.
export function nextBeat(ms) {
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            observer.disconnect();
            resolve();
        };
        const observer = new MutationObserver(() => setTimeout(finish, 0));
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        setTimeout(finish, ms);
    });
}

// `predicate`'s first truthy value, checked once per beat for up to `tries`
// beats; null if it never comes.
export async function waitForBeats(predicate, tries, ms) {
    for (let attempt = 0; attempt < tries; attempt += 1) {
        const value = predicate();
        if (value) return value;
        await nextBeat(ms);
    }
    return null;
}
