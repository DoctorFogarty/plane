/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { getCollectionLayoutHref } from "@plane/constants";
import { EIssuesStoreType } from "@plane/types";
import { useIssues } from "@/hooks/store/use-issues";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { getProjectFeatureNavigation } from "@/plane-web/components/projects/navigation/helper";
import { getProjectSwitchUrl, getTabPreferences } from "./tab-navigation-utils";

export function useProjectSwitchHref(workspaceSlug: string) {
  const { getPartialProjectById } = useProject();
  const {
    project: { getProjectUserProperties },
  } = useMember();
  const { issuesFilter } = useIssues(EIssuesStoreType.PROJECT);

  return useCallback(
    (destinationProjectId: string) => {
      const destinationProject = getPartialProjectById(destinationProjectId);
      const destinationDefaultTab =
        getProjectUserProperties(destinationProjectId)?.preferences?.navigation?.default_tab ??
        getTabPreferences(destinationProjectId).defaultTab;
      const destinationTabKeys = destinationProject
        ? getProjectFeatureNavigation(workspaceSlug, destinationProjectId, destinationProject)
            .filter((item) => item.shouldRender)
            .map((item) => item.key)
        : undefined;
      const href = getProjectSwitchUrl(workspaceSlug, destinationProjectId, destinationDefaultTab, destinationTabKeys);

      // The legacy work-items tab resolves to the `/issues` index, which then
      // redirects to `/issues/<layout>` once filters hydrate. That is a second
      // navigation and a second full tree render. When the destination's stored
      // layout is already known (hover prefetch hydrates it), go straight there.
      if (href === `/${workspaceSlug}/projects/${destinationProjectId}/issues`) {
        const storedLayout = issuesFilter.getIssueFilters(destinationProjectId)?.displayFilters?.layout;
        if (storedLayout) {
          return getCollectionLayoutHref({
            workspaceSlug,
            projectId: destinationProjectId,
            kind: "issues",
            layout: storedLayout,
          });
        }
      }
      return href;
    },
    [getPartialProjectById, getProjectUserProperties, issuesFilter, workspaceSlug]
  );
}
