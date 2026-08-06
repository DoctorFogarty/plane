/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { GitBranchPlus } from "lucide-react";
import type { TIssueServiceType, TWorkItemWidgets } from "@plane/types";
import { IssueDetailWidgetButton } from "@/components/issues/issue-detail-widgets/widget-button";
import { connectCodeModalStore } from "@/plane-web/store/connect-code-modal.store";

export type TWorkItemAdditionalWidgetActionButtonsProps = {
  disabled: boolean;
  hideWidgets: TWorkItemWidgets[];
  issueServiceType: TIssueServiceType;
  projectId: string;
  workItemId: string;
  workspaceSlug: string;
};

export function WorkItemAdditionalWidgetActionButtons(props: TWorkItemAdditionalWidgetActionButtonsProps) {
  const { disabled, hideWidgets, workItemId } = props;

  if (hideWidgets?.includes("development")) return null;

  return (
    <IssueDetailWidgetButton
      title="Connect code"
      icon={<GitBranchPlus className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
      disabled={disabled}
      onClick={() => connectCodeModalStore.open(workItemId, "create_branch")}
    />
  );
}
