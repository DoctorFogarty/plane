/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { CustomSelect } from "@plane/ui";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";

export type TIssueTypeSwitcherProps = {
  issueId: string;
  disabled: boolean;
};

export const IssueTypeSwitcher = observer(function IssueTypeSwitcher(props: TIssueTypeSwitcherProps) {
  const { issueId, disabled } = props;
  const { workspaceSlug } = useParams();
  const {
    issue: { getIssueById },
    updateIssue,
  } = useIssueDetail();
  const issueTypeStore = useIssueType();
  const issue = getIssueById(issueId);
  const didAutoAssignType = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceSlug || !issue?.project_id) return;
    if (!issueTypeStore.fetchedMap[issue.project_id]) {
      void issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug.toString(), issue.project_id);
    }
  }, [workspaceSlug, issue?.project_id, issueTypeStore]);

  const defaultTypeId = issue?.project_id ? issueTypeStore.getDefaultIssueTypeId(issue.project_id) : null;
  const enabled = issue?.project_id ? issueTypeStore.isIssueTypeEnabled(issue.project_id) : false;

  // Assign default type to legacy issues so the switcher and custom properties work
  useEffect(() => {
    if (didAutoAssignType.current === issueId) return;
    if (!enabled || !defaultTypeId || !workspaceSlug || !issue?.project_id || disabled) return;
    if (issue.type_id) return;

    didAutoAssignType.current = issueId;
    void updateIssue(workspaceSlug.toString(), issue.project_id, issueId, { type_id: defaultTypeId });
  }, [enabled, defaultTypeId, workspaceSlug, issue, issueId, disabled, updateIssue]);

  if (!issue || !issue.project_id) return <></>;

  const types = issueTypeStore.getActiveProjectIssueTypes(issue.project_id);
  const effectiveTypeId = issue.type_id || defaultTypeId;
  const currentType = issueTypeStore.getIssueTypeById(issue.project_id, effectiveTypeId);

  return (
    <div className="flex items-center gap-2">
      <IssueIdentifier issueId={issueId} projectId={issue.project_id} size="md" enableClickToCopyIdentifier />
      {enabled && types.length > 0 && (
        <CustomSelect
          value={effectiveTypeId}
          label={currentType?.name || "Type"}
          onChange={async (typeId: string) => {
            if (!workspaceSlug || disabled) return;
            await updateIssue(workspaceSlug.toString(), issue.project_id!, issueId, { type_id: typeId });
          }}
          disabled={disabled}
          maxHeight="lg"
          buttonClassName="text-xs"
        >
          {types.map((type) => (
            <CustomSelect.Option key={type.id} value={type.id}>
              {type.name}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      )}
    </div>
  );
});
