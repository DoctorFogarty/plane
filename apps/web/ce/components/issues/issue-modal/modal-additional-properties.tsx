/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { useFormContext } from "react-hook-form";
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { CustomPropertiesFields } from "@/plane-web/components/issues/issue-properties/custom-properties-fields";

export type TWorkItemModalAdditionalPropertiesProps = {
  isDraft?: boolean;
  projectId: string | null;
  workItemId?: string | null;
  workspaceSlug: string;
};

export const WorkItemModalAdditionalProperties = observer(function WorkItemModalAdditionalProperties(
  props: TWorkItemModalAdditionalPropertiesProps
) {
  const { projectId, workItemId, workspaceSlug, isDraft } = props;
  const { watch } = useFormContext();
  const {
    issuePropertyValues,
    setIssuePropertyValues,
    issuePropertyValueErrors,
    setIssuePropertyValueErrors,
    handleIssueTypeChange,
  } = useIssueModal();
  const issueTypeStore = useIssueType();
  const previousProjectIdRef = useRef<string | null>(null);
  const loadedIssueIdRef = useRef<string | null>(null);

  const formTypeId = watch("type_id") as string | null | undefined;
  // Only use form type_id when it belongs to the current project — never render
  // another project's property schema under the wrong project.
  const effectiveTypeId =
    formTypeId && issueTypeStore.isTypeInProject(projectId, formTypeId)
      ? formTypeId
      : issueTypeStore.getDefaultIssueTypeId(projectId);
  const areProjectIssueTypesFetched = projectId ? !!issueTypeStore.fetchedMap[projectId] : false;

  // Fetch definitions when project changes
  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    if (!issueTypeStore.fetchedMap[projectId]) {
      void issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId);
    }
  }, [workspaceSlug, projectId, issueTypeStore]);

  // Preload existing property values when editing a real work item
  useEffect(() => {
    if (!workspaceSlug || !projectId || !workItemId || isDraft) return;
    if (loadedIssueIdRef.current === workItemId) return;
    loadedIssueIdRef.current = workItemId;
    void issueTypeStore.fetchPropertyValues(workspaceSlug, projectId, workItemId).then((values) => {
      setIssuePropertyValues(values || {});
      setIssuePropertyValueErrors({});
      return undefined;
    });
  }, [
    workspaceSlug,
    projectId,
    workItemId,
    isDraft,
    issueTypeStore,
    setIssuePropertyValues,
    setIssuePropertyValueErrors,
  ]);

  // Create mode: apply defaults for the current project's default type on first
  // mount and whenever the project changes. Never reuse a stale type_id.
  useEffect(() => {
    if (!projectId || workItemId) return;
    if (!areProjectIssueTypesFetched) return;

    const defaultTypeId = issueTypeStore.isIssueTypeEnabled(projectId)
      ? issueTypeStore.getDefaultIssueTypeId(projectId)
      : null;

    if (previousProjectIdRef.current === null) {
      previousProjectIdRef.current = projectId;
      handleIssueTypeChange(projectId, defaultTypeId);
      return;
    }

    if (previousProjectIdRef.current !== projectId) {
      previousProjectIdRef.current = projectId;
      handleIssueTypeChange(projectId, defaultTypeId);
    }
  }, [projectId, workItemId, issueTypeStore, areProjectIssueTypesFetched, handleIssueTypeChange]);

  if (!projectId || !issueTypeStore.isIssueTypeEnabled(projectId)) return null;
  if (!areProjectIssueTypesFetched) return null;

  const properties = issueTypeStore.getActivePropertiesForType(projectId, effectiveTypeId);
  if (!properties.length) return null;

  return (
    <CustomPropertiesFields
      projectId={projectId}
      properties={properties}
      values={issuePropertyValues}
      errors={issuePropertyValueErrors}
      onChange={(propertyId, value) => {
        setIssuePropertyValues((prev) => ({
          ...prev,
          [propertyId]: value,
        }));
        if (issuePropertyValueErrors[propertyId]) {
          setIssuePropertyValueErrors((prev) => {
            const next = { ...prev };
            delete next[propertyId];
            return next;
          });
        }
      }}
    />
  );
});
