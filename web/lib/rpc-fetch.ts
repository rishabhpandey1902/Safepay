// Keeps every blockchain read under the public RPC limit (15 requests per second).
const MAX_PER_SECOND = 10;
const stamps: number[] = [];
let queue: Promise<void> = Promise.resolve();

function waitForSlot(): Promise<void> {
  const next = queue.then(async () => {
    for (;;) {
      const now = Date.now();
      while (stamps.length > 0 && now - stamps[0] >= 1000) stamps.shift();
      if (stamps.length < MAX_PER_SECOND) {
        stamps.push(Date.now());
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 - (now - stamps[0]) + 5));
    }
  });
  queue = next;
  return next;
}

export const throttledFetch: typeof fetch = async (input, init) => {
  await waitForSlot();
  return fetch(input, init);
};