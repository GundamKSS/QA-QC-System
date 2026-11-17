/**
 * "The data you read from the API is out of date." A form that saved something calls `invalidateApiReads()`;
 * every `useApiRead` on the page subscribes (via `useSyncExternalStore`) and puts the version in its request
 * key, so each one fetches again. Module state is per browser tab, which is exactly the scope we want.
 */
let version = 0;
const listeners = new Set<() => void>();

/** The current version; it only ever goes up. */
export const apiReadVersion = () => version;

/** For `useSyncExternalStore`: returns the function that unsubscribes. */
export function subscribeApiReads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function invalidateApiReads(): void {
  version += 1;
  // Copy first: a listener that unsubscribes while we iterate must not skip its neighbour.
  for (const listener of [...listeners]) listener();
}
