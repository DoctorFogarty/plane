/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IIssueFilters } from "@plane/types";

export function shouldRenderCollectionLoader(args: {
  workspaceSlug?: string;
  projectId?: string;
  entityId?: string;
  workItemFilters?: IIssueFilters;
  initialWorkItemFilters?: IIssueFilters;
}): boolean {
  return (
    !args.workspaceSlug || !args.projectId || !args.entityId || !args.workItemFilters || !args.initialWorkItemFilters
  );
}
