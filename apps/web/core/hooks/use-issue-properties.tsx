/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import type { TIssueServiceType } from "@plane/types";
import { useIssueType } from "@/hooks/store/use-issue-type";

export const useWorkItemProperties = (
  projectId: string | undefined | null,
  workspaceSlug: string | undefined | null,
  workItemId: string | undefined | null,
  _issueServiceType?: TIssueServiceType
) => {
  const issueTypeStore = useIssueType();

  useEffect(() => {
    if (!projectId || !workspaceSlug || !workItemId) return;
    if (!issueTypeStore.fetchedMap[projectId]) {
      void issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId);
    }
    void issueTypeStore.fetchPropertyValues(workspaceSlug, projectId, workItemId);
  }, [projectId, workspaceSlug, workItemId, issueTypeStore]);
};
