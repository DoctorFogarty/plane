/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueAttachment } from "@plane/types";
import { hasDangerousAttachmentExtension } from "@plane/utils";
import { IssueAttachmentService } from "@/services/issue/issue_attachment.service";

const issueAttachmentService = new IssueAttachmentService();

export type TPendingAttachment = {
  id: string;
  file: File;
};

export type TAddPendingAttachmentsResult = {
  next: TPendingAttachment[];
  error?: "size" | "type";
};

export type TUploadPendingIssueAttachmentsParams = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  files: File[];
  uploadFile?: (workspaceSlug: string, projectId: string, issueId: string, file: File) => Promise<unknown>;
};

export type TUploadPendingIssueAttachmentsResult = {
  uploaded: number;
  failed: number;
  attachments: TIssueAttachment[];
};

const isIssueAttachment = (value: unknown): value is TIssueAttachment =>
  typeof value === "object" && value !== null && "id" in value && typeof (value as { id: unknown }).id === "string";

const createPendingAttachmentId = (file: File): string => {
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${file.name}-${file.size}-${file.lastModified}-${unique}`;
};

export const addPendingAttachments = (
  current: TPendingAttachment[],
  files: File[],
  options?: { maxFileSize?: number }
): TAddPendingAttachmentsResult => {
  if (files.length === 0) return { next: current };

  const maxFileSize = options?.maxFileSize ?? Number.POSITIVE_INFINITY;
  const accepted: TPendingAttachment[] = [];
  let error: TAddPendingAttachmentsResult["error"];

  for (const file of files) {
    if (hasDangerousAttachmentExtension(file.name)) {
      error = "type";
      continue;
    }
    if (file.size > maxFileSize) {
      if (error !== "type") error = "size";
      continue;
    }
    accepted.push({ id: createPendingAttachmentId(file), file });
  }

  if (accepted.length === 0) return { next: current, error };
  return { next: [...current, ...accepted], error };
};

export const uploadPendingIssueAttachments = async (
  params: TUploadPendingIssueAttachmentsParams
): Promise<TUploadPendingIssueAttachmentsResult> => {
  const { workspaceSlug, projectId, issueId, files, uploadFile } = params;
  if (files.length === 0) return { uploaded: 0, failed: 0, attachments: [] };

  const upload =
    uploadFile ??
    ((slug: string, project: string, issue: string, file: File) =>
      issueAttachmentService.uploadIssueAttachment(slug, project, issue, file));

  const results = await Promise.allSettled(files.map((file) => upload(workspaceSlug, projectId, issueId, file)));

  let uploaded = 0;
  let failed = 0;
  const attachments: TIssueAttachment[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      uploaded += 1;
      if (isIssueAttachment(result.value)) attachments.push(result.value);
    } else {
      failed += 1;
    }
  }

  return { uploaded, failed, attachments };
};
