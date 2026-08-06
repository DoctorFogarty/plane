/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { TIssueIdentifierProps, TIssueTypeIdentifier } from "@plane/types";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";
import { IdentifierText } from "@/components/issues/issue-detail/identifier-text";

export const IssueIdentifier = observer(function IssueIdentifier(props: TIssueIdentifierProps) {
  const { projectId, variant, size, displayProperties, enableClickToCopyIdentifier = false } = props;
  const { getProjectIdentifierById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issueTypeStore = useIssueType();
  const isUsingStoreData = "issueId" in props;
  const issue = isUsingStoreData ? getIssueById(props.issueId) : null;
  const projectIdentifier = isUsingStoreData ? getProjectIdentifierById(projectId) : props.projectIdentifier;
  const issueSequenceId = isUsingStoreData ? issue?.sequence_id : props.issueSequenceId;
  const shouldRenderIssueID = displayProperties ? displayProperties.key : true;
  const issueTypeId = isUsingStoreData ? issue?.type_id : "issueTypeId" in props ? props.issueTypeId : undefined;
  const issueType = issueTypeStore.getIssueTypeById(issueTypeId);

  if (!shouldRenderIssueID) return null;

  return (
    <div className="flex shrink-0 items-center space-x-2">
      {issueType && (
        <span className="bg-custom-background-80 text-custom-text-200 rounded px-1.5 py-0.5 text-[10px] font-medium">
          {issueType.name}
        </span>
      )}
      <IdentifierText
        identifier={`${projectIdentifier}-${issueSequenceId}`}
        enableClickToCopyIdentifier={enableClickToCopyIdentifier}
        variant={variant}
        size={size}
      />
    </div>
  );
});

export const IssueTypeIdentifier = observer(function IssueTypeIdentifier(props: TIssueTypeIdentifier) {
  const { issueTypeId } = props;
  const issueTypeStore = useIssueType();
  const issueType = issueTypeStore.getIssueTypeById(issueTypeId);
  if (!issueType) return null;
  return (
    <span className="bg-custom-background-80 text-custom-text-200 rounded px-1.5 py-0.5 text-[10px] font-medium">
      {issueType.name}
    </span>
  );
});
