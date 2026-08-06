/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueServiceType, TWorkItemWidgets } from "@plane/types";
import { DevelopmentCollapsible } from "./development/root";

export type TWorkItemAdditionalWidgetCollapsiblesProps = {
  disabled: boolean;
  hideWidgets: TWorkItemWidgets[];
  issueServiceType: TIssueServiceType;
  projectId: string;
  workItemId: string;
  workspaceSlug: string;
};

export function WorkItemAdditionalWidgetCollapsibles(props: TWorkItemAdditionalWidgetCollapsiblesProps) {
  const { disabled, hideWidgets, issueServiceType, projectId, workItemId, workspaceSlug } = props;

  if (hideWidgets?.includes("development")) return null;

  return (
    <DevelopmentCollapsible
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      issueId={workItemId}
      disabled={disabled}
      issueServiceType={issueServiceType}
    />
  );
}
