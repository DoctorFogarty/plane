/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useFormContext } from "react-hook-form";
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { IssuePropertyInput } from "@/plane-web/components/issues/issue-properties/property-input";

export type TWorkItemModalAdditionalPropertiesProps = {
  isDraft?: boolean;
  projectId: string | null;
  workItemId?: string | null;
  workspaceSlug: string;
};

export const WorkItemModalAdditionalProperties = observer(function WorkItemModalAdditionalProperties(
  props: TWorkItemModalAdditionalPropertiesProps
) {
  const { projectId } = props;
  const { watch } = useFormContext();
  const { issuePropertyValues, setIssuePropertyValues, issuePropertyValueErrors } = useIssueModal();
  const issueTypeStore = useIssueType();

  if (!projectId || !issueTypeStore.isIssueTypeEnabled(projectId)) return null;

  const typeId = watch("type_id") || issueTypeStore.getDefaultIssueTypeId(projectId);
  const properties = issueTypeStore.getActivePropertiesForType(typeId);
  if (!properties.length) return null;

  return (
    <div className="space-y-3 px-1 py-2">
      {properties.map((property) => (
        <IssuePropertyInput
          key={property.id}
          property={property}
          projectId={projectId}
          value={issuePropertyValues[property.id]}
          error={issuePropertyValueErrors[property.id]}
          onChange={(value) =>
            setIssuePropertyValues((prev) => ({
              ...prev,
              [property.id]: value,
            }))
          }
        />
      ))}
    </div>
  );
});
