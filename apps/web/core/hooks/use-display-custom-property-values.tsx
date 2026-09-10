/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext, useEffect, useMemo, useRef } from "react";
import { sortBy } from "lodash-es";
import { useParams } from "next/navigation";
import type { IIssueDisplayProperties, TGroupedIssues, TSubGroupedIssues } from "@plane/types";
import { getEnabledCustomPropertyIds } from "@plane/utils";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { StoreContext } from "@/lib/store-context";

type TGroupedIssueIds = TGroupedIssues | TSubGroupedIssues | string[] | undefined;

const flattenIssueIds = (grouped: TGroupedIssueIds): string[] => {
  if (!grouped) return [];
  if (Array.isArray(grouped)) return grouped.filter(Boolean);

  const result: string[] = [];
  for (const value of Object.values(grouped)) {
    if (Array.isArray(value)) {
      result.push(...value.filter(Boolean));
    } else if (value && typeof value === "object") {
      for (const nested of Object.values(value)) {
        if (Array.isArray(nested)) result.push(...nested.filter(Boolean));
      }
    }
  }
  return result;
};

/**
 * Bulk-loads custom property values when any custom property is enabled in display options.
 * Lookups run in an effect so board observers are not subscribed to the full issues map.
 */
export const useDisplayCustomPropertyValues = (
  displayProperties: IIssueDisplayProperties | undefined,
  groupedIssueIds: TGroupedIssueIds
) => {
  const { workspaceSlug } = useParams();
  const issueTypeStore = useIssueType();
  const storeContext = useContext(StoreContext);
  const prevEnabledKeyByProjectRef = useRef(new Map<string, string>());
  const fetchedIdsRef = useRef(new Set<string>());

  const enabledCustomPropertyIds = useMemo(
    () => sortBy(getEnabledCustomPropertyIds(displayProperties)),
    [displayProperties]
  );
  const enabledCustomPropertyKey = enabledCustomPropertyIds.join(",");

  const typesReadyKey = Object.keys(issueTypeStore.fetchedMap).toSorted().join(",");
  const revisionKey = Object.entries(issueTypeStore.projectRevisionMap)
    .map(([projectId, revision]) => `${projectId}:${revision}`)
    .join("|");

  useEffect(() => {
    if (!workspaceSlug || !enabledCustomPropertyKey || !storeContext) return;

    const ids = flattenIssueIds(groupedIssueIds);
    if (ids.length === 0) return;

    const getIssueById = storeContext.issue.issues.getIssueById;
    const byProject = new Map<string, string[]>();

    for (const issueId of ids) {
      const issue = getIssueById(issueId);
      if (!issue?.project_id) continue;
      const list = byProject.get(issue.project_id) ?? [];
      list.push(issueId);
      byProject.set(issue.project_id, list);
    }

    for (const [projectId, projectIssueIds] of byProject) {
      if (!issueTypeStore.fetchedMap[projectId]) continue;
      const allowedPropertyIds = new Set(
        issueTypeStore.getActiveProjectProperties(projectId).map((property) => property.id)
      );
      const scopedEnabledKey = enabledCustomPropertyIds
        .filter((propertyId) => allowedPropertyIds.has(propertyId))
        .join(",");
      if (!scopedEnabledKey) {
        prevEnabledKeyByProjectRef.current.delete(projectId);
        continue;
      }

      const enabledSetChanged = prevEnabledKeyByProjectRef.current.get(projectId) !== scopedEnabledKey;
      prevEnabledKeyByProjectRef.current.set(projectId, scopedEnabledKey);

      const idsToFetch = enabledSetChanged
        ? projectIssueIds
        : projectIssueIds.filter(
            (issueId) => !fetchedIdsRef.current.has(issueId) && !(issueId in issueTypeStore.propertyValuesMap)
          );
      if (idsToFetch.length === 0) continue;

      for (const issueId of idsToFetch) fetchedIdsRef.current.add(issueId);
      void issueTypeStore.fetchPropertyValuesBulk(workspaceSlug.toString(), projectId, idsToFetch);
    }
  }, [
    workspaceSlug,
    enabledCustomPropertyKey,
    enabledCustomPropertyIds,
    groupedIssueIds,
    typesReadyKey,
    revisionKey,
    issueTypeStore,
    storeContext,
  ]);
};
