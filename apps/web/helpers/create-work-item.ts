/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue, TIssuePropertyValues } from "@plane/types";
import type {
  TCreateSubWorkItemProps,
  TCreateUpdatePropertyValuesProps,
} from "@/components/issues/issue-modal/context/issue-modal-context";
import type { TPendingAttachment } from "@/helpers/create-issue-attachments";
import { uploadPendingIssueAttachments } from "@/helpers/create-issue-attachments";
import { store } from "@/lib/store-context";
import { FileService } from "@/services/file.service";

const fileService = new FileService();

export type TCreateWorkItemParams = {
  workspaceSlug: string;
  payload: Partial<TIssue>;
  isDraft: boolean;
  uploadedAssetIds: string[];
  pendingAttachments: TPendingAttachment[];
  issuePropertyValues: TIssuePropertyValues;
  handleCreateUpdatePropertyValues: (args: TCreateUpdatePropertyValuesProps) => Promise<void>;
  handleCreateSubWorkItem: (args: TCreateSubWorkItemProps) => Promise<void>;
  createIssue?: (projectId: string, data: Partial<TIssue>) => Promise<TIssue | undefined>;
};

export type TCreateWorkItemResult = {
  issue: TIssue;
  failedAttachmentCount: number;
};

const createOnStore = async (params: TCreateWorkItemParams): Promise<TIssue | undefined> => {
  const { workspaceSlug, payload, isDraft } = params;
  if (!payload.project_id) return undefined;

  if (isDraft) {
    return (await store.issue.workspaceDraftIssues.createIssue(workspaceSlug, {
      ...payload,
      property_values: params.issuePropertyValues,
    })) as TIssue | undefined;
  }

  if (params.createIssue) {
    return params.createIssue(payload.project_id, payload);
  }

  return store.issue.projectIssues.createIssue(workspaceSlug, payload.project_id, payload);
};

export const createWorkItem = async (params: TCreateWorkItemParams): Promise<TCreateWorkItemResult> => {
  const issue = await createOnStore(params);
  if (!issue) throw new Error("Work item create returned no issue");

  const { workspaceSlug, payload, isDraft } = params;
  const projectId = issue.project_id;
  const sideEffects: Promise<unknown>[] = [];
  const usedCollectionCreate = !isDraft && !!params.createIssue;

  if (params.uploadedAssetIds.length > 0 && projectId && issue.id) {
    sideEffects.push(
      fileService.updateBulkProjectAssetsUploadStatus(workspaceSlug, projectId, issue.id, {
        asset_ids: params.uploadedAssetIds,
      })
    );
  }

  if (!isDraft && projectId && !usedCollectionCreate) {
    if (payload.cycle_id) {
      sideEffects.push(store.issue.cycleIssues.addIssueToCycle(workspaceSlug, projectId, payload.cycle_id, [issue.id]));
    }
    if (payload.module_ids && payload.module_ids.length > 0) {
      sideEffects.push(
        store.issue.moduleIssues.changeModulesInIssue(workspaceSlug, projectId, issue.id, payload.module_ids, [])
      );
    }
  }

  if (issue.id && projectId) {
    sideEffects.push(
      params.handleCreateUpdatePropertyValues({
        issueId: issue.id,
        issueTypeId: issue.type_id,
        projectId,
        workspaceSlug,
        isDraft,
      })
    );
    sideEffects.push(
      params.handleCreateSubWorkItem({
        workspaceSlug,
        projectId,
        parentId: issue.id,
      })
    );
  }

  let failedAttachmentCount = 0;
  if (!isDraft && params.pendingAttachments.length > 0 && issue.id && projectId) {
    sideEffects.push(
      uploadPendingIssueAttachments({
        workspaceSlug,
        projectId,
        issueId: issue.id,
        files: params.pendingAttachments.map((item) => item.file),
      }).then(({ failed, attachments }) => {
        failedAttachmentCount = failed;
        if (attachments.length > 0) store.issue.issueDetail.addAttachments(issue.id, attachments);
        return failed;
      })
    );
  }

  const results = await Promise.allSettled(sideEffects);
  const rejected = results.filter((result) => result.status === "rejected");
  if (rejected.length > 0) {
    console.error("Non-fatal work item side effects failed after create", rejected);
  }

  return { issue, failedAttachmentCount };
};
