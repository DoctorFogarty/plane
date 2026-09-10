/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef } from "react";
import {
  PROJECT_DETAILS,
  PROJECT_LABELS,
  PROJECT_ME_INFORMATION,
  PROJECT_MEMBERS,
  PROJECT_MEMBER_PREFERENCES,
  PROJECT_STATES,
  WORK_ITEM_TYPES_PROPERTIES_AND_OPTIONS,
} from "@plane/constants";
import { EIssuesStoreType } from "@plane/types";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useIssues } from "@/hooks/store/use-issues";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useRouterParams } from "@/hooks/store/use-router-params";
import { useUserPermissions } from "@/hooks/store/user";
import { runPrefetch } from "@/lib/prefetch-registry";
import { getIssueListPrefetchOptions } from "./issue-list-prefetch-options";

/**
 * Warm the destination project's list-critical caches on hover/focus so the
 * subsequent navigation does not water-fall ME → states/labels/members.
 *
 * Requests go through the prefetch registry under the same keys
 * ProjectAuthWrapper uses, so hover → focus → click collapses into one request
 * per resource and the wrapper's SWR fetchers reuse it on mount.
 */
export function usePrefetchProject(workspaceSlug: string) {
  const { fetchProjectDetails } = useProject();
  const { fetchUserProjectInfo } = useUserPermissions();
  const stateStore = useProjectState();
  const { fetchProjectLabels } = useLabel();
  const {
    project: { fetchProjectMembers, fetchProjectUserProperties, getProjectUserProperties },
  } = useMember();
  const issueTypeStore = useIssueType();
  const { issues, issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const routerStore = useRouterParams();

  // Keep store handles in refs so this callback identity stays stable and so
  // observers do not subscribe to fetched maps that only matter on hover.
  const routerStoreRef = useRef(routerStore);
  routerStoreRef.current = routerStore;
  const stateStoreRef = useRef(stateStore);
  stateStoreRef.current = stateStore;
  const issueTypeStoreRef = useRef(issueTypeStore);
  issueTypeStoreRef.current = issueTypeStore;
  const issuesFilterRef = useRef(issuesFilter);
  issuesFilterRef.current = issuesFilter;
  const issuesRef = useRef(issues);
  issuesRef.current = issues;
  const getProjectUserPropertiesRef = useRef(getProjectUserProperties);
  getProjectUserPropertiesRef.current = getProjectUserProperties;

  return useCallback(
    (projectId: string) => {
      // Hovering the open project has nothing to warm; its wrapper is mounted.
      if (routerStoreRef.current.projectId === projectId) return;
      const swallow = () => undefined;
      runPrefetch(PROJECT_DETAILS(workspaceSlug, projectId), () => fetchProjectDetails(workspaceSlug, projectId)).catch(
        swallow
      );
      runPrefetch(PROJECT_ME_INFORMATION(workspaceSlug, projectId), () =>
        fetchUserProjectInfo(workspaceSlug, projectId)
      ).catch(swallow);
      // Once the destination's saved filters are known, request its first page
      // too. The list layout consumes this instead of a fresh round trip.
      const hydrateFilters = () => {
        if (!getProjectUserPropertiesRef.current(projectId)) return;
        const filterStore = issuesFilterRef.current;
        filterStore.hydrateFilters(workspaceSlug, projectId);
        const options = getIssueListPrefetchOptions(filterStore.getIssueFilters(projectId)?.displayFilters);
        if (options) issuesRef.current.prefetchIssues(workspaceSlug, projectId, options);
      };
      hydrateFilters();
      runPrefetch(PROJECT_MEMBER_PREFERENCES(projectId, undefined), () =>
        fetchProjectUserProperties(workspaceSlug, projectId)
      )
        .then(hydrateFilters)
        .catch(swallow);
      if (!stateStoreRef.current.fetchedMap[projectId]) {
        runPrefetch(PROJECT_STATES(projectId, undefined), () =>
          stateStoreRef.current.fetchProjectStates(workspaceSlug, projectId)
        ).catch(swallow);
      }
      runPrefetch(PROJECT_LABELS(projectId, undefined), () => fetchProjectLabels(workspaceSlug, projectId)).catch(
        swallow
      );
      runPrefetch(PROJECT_MEMBERS(projectId, undefined), () => fetchProjectMembers(workspaceSlug, projectId)).catch(
        swallow
      );
      const typeStore = issueTypeStoreRef.current;
      if (!typeStore.fetchedMap[projectId]) {
        runPrefetch(WORK_ITEM_TYPES_PROPERTIES_AND_OPTIONS(projectId, undefined), () =>
          typeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId)
        ).catch(swallow);
      }
    },
    [
      fetchProjectDetails,
      fetchProjectLabels,
      fetchProjectMembers,
      fetchProjectUserProperties,
      fetchUserProjectInfo,
      workspaceSlug,
    ]
  );
}
