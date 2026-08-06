/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo, useState } from "react";
import { observer } from "mobx-react";
import type { ISearchIssueResponse, TIssue, TIssuePropertyValueErrors, TIssuePropertyValues } from "@plane/types";
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import type { TIssueModalContext } from "@/components/issues/issue-modal/context";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useUser } from "@/hooks/store/user/user-user";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

function isEmptyValue(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds } = props;
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  const [issuePropertyValues, setIssuePropertyValues] = useState<TIssuePropertyValues>({});
  const [issuePropertyValueErrors, setIssuePropertyValueErrors] = useState<TIssuePropertyValueErrors>({});
  const { projectsWithCreatePermissions } = useUser();
  const issueTypeStore = useIssueType();
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  const contextValue = useMemo<TIssueModalContext>(
    () => ({
      allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
      workItemTemplateId: null,
      setWorkItemTemplateId: () => {},
      isApplyingTemplate: false,
      setIsApplyingTemplate: () => {},
      selectedParentIssue,
      setSelectedParentIssue,
      issuePropertyValues,
      setIssuePropertyValues,
      issuePropertyValueErrors,
      setIssuePropertyValueErrors,
      getIssueTypeIdOnProjectChange: (projectId) => {
        if (!issueTypeStore.isIssueTypeEnabled(projectId)) return null;
        return issueTypeStore.getDefaultIssueTypeId(projectId);
      },
      getActiveAdditionalPropertiesLength: ({ projectId, watch }) => {
        if (!projectId || !issueTypeStore.isIssueTypeEnabled(projectId)) return 0;
        const typeId = watch("type_id") || issueTypeStore.getDefaultIssueTypeId(projectId);
        return issueTypeStore.getActivePropertiesForType(typeId).length;
      },
      handlePropertyValuesValidation: ({ projectId, watch }) => {
        if (!projectId || !issueTypeStore.isIssueTypeEnabled(projectId)) return true;
        const typeId = watch("type_id") || issueTypeStore.getDefaultIssueTypeId(projectId);
        const properties = issueTypeStore.getActivePropertiesForType(typeId);
        const errors: TIssuePropertyValueErrors = {};
        properties.forEach((property) => {
          if (!property.is_required) return;
          if (property.property_type === "BOOLEAN") return;
          const settings = property.settings || {};
          if ((settings.display_format || settings.format) === "readonly") return;
          if (isEmptyValue(issuePropertyValues[property.id])) {
            errors[property.id] = `${property.name} is required`;
          }
        });
        setIssuePropertyValueErrors(errors);
        return Object.keys(errors).length === 0;
      },
      handleCreateUpdatePropertyValues: async ({ issueId, projectId, workspaceSlug, issueTypeId, isDraft }) => {
        if (isDraft || !issueTypeId || !issueTypeStore.isIssueTypeEnabled(projectId)) return;
        if (!Object.keys(issuePropertyValues).length) return;
        await issueTypeStore.upsertPropertyValues(workspaceSlug, projectId, issueId, issuePropertyValues, true);
      },
      handleProjectEntitiesFetch: async ({ workItemProjectId, workspaceSlug }) => {
        if (!workItemProjectId) return;
        await issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, workItemProjectId);
      },
      handleTemplateChange: () => Promise.resolve(),
      handleConvert: () => Promise.resolve(),
      handleCreateSubWorkItem: () => Promise.resolve(),
    }),
    [
      allowedProjectIds,
      projectIdsWithCreatePermissions,
      selectedParentIssue,
      issuePropertyValues,
      issuePropertyValueErrors,
      issueTypeStore,
    ]
  );

  return <IssueModalContext.Provider value={contextValue}>{children}</IssueModalContext.Provider>;
});
