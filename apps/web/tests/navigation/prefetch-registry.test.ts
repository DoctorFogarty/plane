/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPrefetchRegistry, consumePrefetch, PREFETCH_TTL_MS, runPrefetch } from "@/lib/prefetch-registry";

describe("prefetch registry", () => {
  beforeEach(() => {
    clearPrefetchRegistry();
  });

  it("shares one in-flight request across repeated prefetches within the TTL", () => {
    const fetcher = vi.fn(() => Promise.resolve("a"));
    const first = runPrefetch("k", fetcher, PREFETCH_TTL_MS, 1_000);
    const second = runPrefetch("k", fetcher, PREFETCH_TTL_MS, 1_500);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("re-runs the prefetch once the previous one has expired", () => {
    const fetcher = vi.fn(() => Promise.resolve("a"));
    runPrefetch("k", fetcher, PREFETCH_TTL_MS, 1_000);
    runPrefetch("k", fetcher, PREFETCH_TTL_MS, 1_000 + PREFETCH_TTL_MS);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("lets the mount fetcher consume a fresh prefetch instead of refetching", async () => {
    const prefetch = vi.fn(() => Promise.resolve("prefetched"));
    const mountFetch = vi.fn(() => Promise.resolve("fetched"));
    const pending = runPrefetch("k", prefetch, PREFETCH_TTL_MS, 1_000);
    const consumed = consumePrefetch("k", mountFetch, PREFETCH_TTL_MS, 1_200);
    expect(consumed).toBe(pending);
    expect(mountFetch).not.toHaveBeenCalled();
    await expect(consumed).resolves.toBe("prefetched");
  });

  it("consumes each prefetch at most once so the next mount revalidates", async () => {
    const mountFetch = vi.fn(() => Promise.resolve("fetched"));
    runPrefetch("k", () => Promise.resolve("prefetched"), PREFETCH_TTL_MS, 1_000);
    consumePrefetch("k", mountFetch, PREFETCH_TTL_MS, 1_100);
    consumePrefetch("k", mountFetch, PREFETCH_TTL_MS, 1_200);
    expect(mountFetch).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale prefetch and fetches fresh data", async () => {
    const mountFetch = vi.fn(() => Promise.resolve("fetched"));
    runPrefetch("k", () => Promise.resolve("stale"), PREFETCH_TTL_MS, 1_000);
    const result = consumePrefetch("k", mountFetch, PREFETCH_TTL_MS, 1_000 + PREFETCH_TTL_MS);
    expect(mountFetch).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toBe("fetched");
  });

  it("drops a failed prefetch so the next caller retries", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("boom")));
    const failed = runPrefetch("k", failing, PREFETCH_TTL_MS, 1_000);
    await expect(failed).rejects.toThrow("boom");
    const retry = vi.fn(() => Promise.resolve("ok"));
    await expect(consumePrefetch("k", retry, PREFETCH_TTL_MS, 1_100)).resolves.toBe("ok");
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
