/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Short-lived registry that lets a speculative prefetch (hover/focus) hand its
 * in-flight request to the SWR fetcher that mounts moments later, so the
 * navigation does not issue the same request a second time. Entries expire
 * after a TTL so a hover that never became a navigation cannot serve stale
 * data minutes later.
 */

type TPrefetchEntry = { promise: Promise<unknown>; at: number };

export const PREFETCH_TTL_MS = 10_000;

const entries = new Map<string, TPrefetchEntry>();

const isFresh = (entry: TPrefetchEntry | undefined, ttlMs: number, now: number): entry is TPrefetchEntry =>
  !!entry && now - entry.at < ttlMs;

/**
 * Start (or reuse) a prefetch for `key`. Repeated calls within the TTL share
 * the same promise, which collapses hover → focus → click into one request.
 */
export function runPrefetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = PREFETCH_TTL_MS,
  now: number = Date.now()
): Promise<T> {
  const existing = entries.get(key);
  if (isFresh(existing, ttlMs, now)) return existing.promise as Promise<T>;
  const promise = fetcher();
  entries.set(key, { promise, at: now });
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });
  return promise;
}

/**
 * Consume a fresh prefetch for `key` if one exists, otherwise run `fetcher`.
 * The entry is removed either way so the next mount revalidates normally.
 */
export function consumePrefetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = PREFETCH_TTL_MS,
  now: number = Date.now()
): Promise<T> {
  const existing = entries.get(key);
  entries.delete(key);
  if (isFresh(existing, ttlMs, now)) return existing.promise as Promise<T>;
  return fetcher();
}

/** Test hook. */
export function clearPrefetchRegistry() {
  entries.clear();
}
