/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { ISSUE_GITHUB_INSTALLATION_REPOS } from "@plane/constants";
import type { TGithubInstallationRepositories } from "@plane/types";
import useDebounce from "@/hooks/use-debounce";

type TFetcher = (q: string) => Promise<TGithubInstallationRepositories>;

export function useGithubInstallationRepositories(issueId: string, enabled: boolean, fetcher: TFetcher, query = "") {
  const debouncedQuery = useDebounce(query, 300);

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    enabled ? ISSUE_GITHUB_INSTALLATION_REPOS(issueId, debouncedQuery) : null,
    () => fetcher(debouncedQuery),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const repositories = data?.repositories ?? [];
  const errorMessage =
    error && typeof error === "object" && "error" in error
      ? String((error as { error?: string }).error ?? "")
      : error
        ? String(error)
        : "";

  return {
    repositories,
    totalCount: data?.total_count ?? 0,
    error,
    errorMessage,
    isNotConnected: /not installed|not connected/i.test(errorMessage),
    isLoading: Boolean(isLoading && !data),
    isSearching: Boolean(query) && (query !== debouncedQuery || isValidating),
    retry: () => {
      void mutate();
    },
  };
}
