/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";

export const useWorkspaceIssuePropertiesExtended = (workspaceSlug: string | string[] | undefined) => {
  const { joinedProjectIds } = useProject();
  const issueTypeStore = useIssueType();
  const slug = workspaceSlug?.toString();

  useEffect(() => {
    if (!slug || !joinedProjectIds?.length) return;
    // Prefetch for a small set of joined projects to avoid flooding the API
    joinedProjectIds.slice(0, 10).forEach((projectId) => {
      if (!issueTypeStore.fetchedMap[projectId]) {
        void issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(slug, projectId);
      }
    });
  }, [slug, joinedProjectIds, issueTypeStore]);
};
