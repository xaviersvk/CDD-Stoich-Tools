// content/utils/concurrency.js

// Run `task` over `items` with at most `limit` in flight, preserving order.
// Stops launching new tasks once `shouldStop()` returns true (cancellation);
// unlaunched slots stay `undefined` in the result array.
export async function mapLimit(items, limit, task, shouldStop) {
    const results = new Array(items.length);
    let next = 0;

    async function worker() {
        while (next < items.length) {
            if (shouldStop?.()) return;
            const index = next;
            next += 1;
            results[index] = await task(items[index], index);
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(limit, items.length); i += 1) {
        workers.push(worker());
    }
    await Promise.all(workers);

    return results;
}
