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

// A semaphore for work that trickles in (observer callbacks, scroll): returns
// `run(task)`, which waits until fewer than `limit` tasks are in flight.
export function createLimiter(limit) {
    let active = 0;
    const waiters = [];

    return async function run(task) {
        if (active >= limit) {
            await new Promise((resolve) => waiters.push(resolve));
        }
        active += 1;
        try {
            return await task();
        } finally {
            active -= 1;
            waiters.shift()?.();
        }
    };
}
