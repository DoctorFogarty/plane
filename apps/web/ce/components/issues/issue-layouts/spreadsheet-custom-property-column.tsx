/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { TIssue } from "@plane/types";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { IssuePropertyInput } from "@/plane-web/components/issues/issue-properties/property-input";

type Props = {
  issue: TIssue;
  propertyId: string;
  disabled: boolean;
  onClose: () => void;
};

export const SpreadsheetCustomPropertyColumn = observer(function SpreadsheetCustomPropertyColumn(props: Props) {
  const { issue, propertyId, disabled } = props;
  const { workspaceSlug } = useParams();
  const issueTypeStore = useIssueType();

  if (!issue.project_id || !issueTypeStore.isIssueTypeEnabled(issue.project_id)) {
    return <div className="h-11 border-b-[0.5px] border-subtle" />;
  }

  const typeId = issue.type_id || issueTypeStore.getDefaultIssueTypeId(issue.project_id);
  const property = typeId
    ? issueTypeStore.getActivePropertiesForType(issue.project_id, typeId).find((p) => p.id === propertyId)
    : undefined;

  if (!property) {
    return <div className="h-11 border-b-[0.5px] border-subtle" />;
  }

  const values = issueTypeStore.getPropertyValues(issue.id);
  const value = values[propertyId];
  const isReadonly = disabled || (property.settings?.display_format || property.settings?.format) === "readonly";

  const handleChange = async (nextValue: unknown) => {
    if (isReadonly || !issue.project_id || !workspaceSlug) return;
    await issueTypeStore.upsertPropertyValues(
      workspaceSlug.toString(),
      issue.project_id,
      issue.id,
      { [propertyId]: nextValue },
      false
    );
  };

  return (
    <div className="flex h-11 items-center border-b-[0.5px] border-subtle px-page-x">
      <IssuePropertyInput
        property={property}
        projectId={issue.project_id}
        value={value}
        hideLabel
        variant="sidebar"
        disabled={isReadonly}
        onChange={handleChange}
      />
    </div>
  );
});
