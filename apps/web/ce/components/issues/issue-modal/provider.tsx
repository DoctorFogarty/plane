/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import type {
  ISearchIssueResponse,
  TIssue,
  TIssuePropertyValueErrors,
  TIssuePropertyValues,
  TWorkspaceDraftIssue,
} from "@plane/types";
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import type { TIssueModalContext } from "@/components/issues/issue-modal/context";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useWorkspaceDraftIssues } from "@/hooks/store/workspace-draft";
import { useUser } from "@/hooks/store/user/user-user";
import {
  buildDefaultPropertyValues,
  validateRequiredPropertyValues,
} from "@/plane-web/components/issues/issue-properties/property-values";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds, dataForPreload } = props;
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  const [issuePropertyValues, setIssuePropertyValues] = useState<TIssuePropertyValues>(() => {
    const preloadValues = (dataForPreload as { property_values?: TIssuePropertyValues } | undefined)?.property_values;
    return preloadValues && typeof preloadValues === "object" ? { ...preloadValues } : {};
  });
  const [issuePropertyValueErrors, setIssuePropertyValueErrors] = useState<TIssuePropertyValueErrors>({});
  const { projectsWithCreatePermissions } = useUser();
  const issueTypeStore = useIssueType();
  const { updateIssue: updateDraftIssue } = useWorkspaceDraftIssues();
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});
  const lastSyncedTypeKeyRef = useRef<string | null>(null);
  const loadedEditIssueIdRef = useRef<string | null>(null);

  const applyDefaultsForType = useCallback(
    (projectId: string | null | undefined, typeId: string | null | undefined) => {
      if (!projectId || !typeId || !issueTypeStore.isIssueTypeEnabled(projectId)) {
        setIssuePropertyValues({});
        setIssuePropertyValueErrors({});
        return;
      }
      const properties = issueTypeStore.getActivePropertiesForType(projectId, typeId);
      setIssuePropertyValues(buildDefaultPropertyValues(properties));
      setIssuePropertyValueErrors({});
    },
    [issueTypeStore]
  );

  // Hydrate create defaults / draft values when project entities are available
  useEffect(() => {
    const projectId = dataForPreload?.project_id;
    if (!projectId || !issueTypeStore.isIssueTypeEnabled(projectId)) return;
    if (!issueTypeStore.fetchedMap[projectId]) return;

    const workItemId = dataForPreload?.id;
    const typeId = dataForPreload?.type_id || issueTypeStore.getDefaultIssueTypeId(projectId);
    const syncKey = `${projectId}:${typeId ?? ""}:${workItemId ?? "create"}`;

    // Existing draft: hydrate from payload once
    const draftValues = (dataForPreload as { property_values?: TIssuePropertyValues } | undefined)?.property_values;
    if (workItemId && dataForPreload?.is_draft && draftValues && loadedEditIssueIdRef.current !== workItemId) {
      loadedEditIssueIdRef.current = workItemId;
      lastSyncedTypeKeyRef.current = syncKey;
      setIssuePropertyValues({ ...draftValues });
      return;
    }

    // Edit existing issue: fetch values once (handled in modal-additional-properties / here)
    if (workItemId && !dataForPreload?.is_draft) {
      return;
    }

    // Create mode: apply defaults when type/project sync key changes
    if (!workItemId && typeId && lastSyncedTypeKeyRef.current !== syncKey) {
      lastSyncedTypeKeyRef.current = syncKey;
      applyDefaultsForType(projectId, typeId);
    }
  }, [dataForPreload, issueTypeStore, applyDefaultsForType]);

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
        const watchedTypeId = watch("type_id");
        const typeId = issueTypeStore.isTypeInProject(projectId, watchedTypeId)
          ? watchedTypeId
          : issueTypeStore.getDefaultIssueTypeId(projectId);
        return issueTypeStore.getActivePropertiesForType(projectId, typeId).length;
      },
      handlePropertyValuesValidation: ({ projectId, watch }) => {
        if (!projectId || !issueTypeStore.isIssueTypeEnabled(projectId)) return true;
        const watchedTypeId = watch("type_id");
        const typeId = issueTypeStore.isTypeInProject(projectId, watchedTypeId)
          ? watchedTypeId
          : issueTypeStore.getDefaultIssueTypeId(projectId);
        const properties = issueTypeStore.getActivePropertiesForType(projectId, typeId);
        const errors = validateRequiredPropertyValues(properties, issuePropertyValues);
        setIssuePropertyValueErrors(errors);
        return Object.keys(errors).length === 0;
      },
      handleCreateUpdatePropertyValues: async ({ issueId, projectId, workspaceSlug, issueTypeId, isDraft }) => {
        const resolvedTypeId = issueTypeStore.isTypeInProject(projectId, issueTypeId)
          ? issueTypeId
          : issueTypeStore.getDefaultIssueTypeId(projectId);
        if (!resolvedTypeId || !issueTypeStore.isIssueTypeEnabled(projectId)) return;

        if (isDraft) {
          // Persist JSON map on the draft record
          await updateDraftIssue(workspaceSlug, issueId, {
            property_values: issuePropertyValues,
          } as Partial<TWorkspaceDraftIssue>);
          return;
        }

        await issueTypeStore.upsertPropertyValues(workspaceSlug, projectId, issueId, issuePropertyValues, true);
      },
      handleProjectEntitiesFetch: async ({ workItemProjectId, workspaceSlug }) => {
        if (!workItemProjectId) return;
        await issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, workItemProjectId);
      },
      resetPropertyValuesToDefaults: (projectId, typeId) => {
        const resolvedTypeId = issueTypeStore.isTypeInProject(projectId, typeId)
          ? typeId
          : issueTypeStore.getDefaultIssueTypeId(projectId);
        const key = `${projectId}:${resolvedTypeId ?? ""}:create`;
        lastSyncedTypeKeyRef.current = key;
        applyDefaultsForType(projectId, resolvedTypeId);
      },
      handleIssueTypeChange: (projectId, typeId) => {
        const resolvedTypeId = issueTypeStore.isTypeInProject(projectId, typeId)
          ? typeId
          : issueTypeStore.getDefaultIssueTypeId(projectId);
        const key = `${projectId}:${resolvedTypeId ?? ""}:create`;
        lastSyncedTypeKeyRef.current = key;
        applyDefaultsForType(projectId, resolvedTypeId);
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
      updateDraftIssue,
      applyDefaultsForType,
    ]
  );

  return <IssueModalContext.Provider value={contextValue}>{children}</IssueModalContext.Provider>;
});
