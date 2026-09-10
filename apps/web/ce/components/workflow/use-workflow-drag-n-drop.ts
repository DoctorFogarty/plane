/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueGroupByOptions } from "@plane/types";

export const useWorkFlowFDragNDrop = (
  _groupBy: TIssueGroupByOptions | undefined,
  _subGroupBy?: TIssueGroupByOptions
) => ({
  workflowDisabledSource: undefined,
  isWorkflowDropDisabled: false,
  getIsWorkflowWorkItemCreationDisabled: (_groupId: string, _subGroupId?: string) => false,
  handleWorkFlowState: (
    _sourceGroupId: string,
    _destinationGroupId: string,
    _sourceSubGroupId?: string,
    _destinationSubGroupId?: string
  ) => {},
});
