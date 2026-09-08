/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { DANGEROUS_EXTENSIONS, DEFAULT_ATTACHMENT_MIME_TYPE } from "@plane/constants";

export const PREVIEWABLE_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff", "tif"]);

export const resolveAttachmentMimeType = (...candidates: Array<string | null | undefined>): string => {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const normalized = candidate.trim();
      if (normalized) return normalized;
    }
  }
  return DEFAULT_ATTACHMENT_MIME_TYPE;
};

export const hasDangerousAttachmentExtension = (filename: string): boolean => {
  if (!filename) return false;

  const parts = filename
    .split(".")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length < 2) return false;

  const extension = parts[parts.length - 1] ?? "";
  if (DANGEROUS_EXTENSIONS.includes(extension)) return true;

  if (parts.length >= 3) {
    const secondLast = parts[parts.length - 2] ?? "";
    if (DANGEROUS_EXTENSIONS.includes(secondLast)) return true;
  }

  return false;
};

export const generateFileName = (fileName: string) => {
  const date = new Date();
  const timestamp = date.getTime();

  const _fileName = getFileName(fileName);
  const nameWithoutExtension = _fileName.length > 80 ? _fileName.substring(0, 80) : _fileName;
  const extension = getFileExtension(fileName);

  return `${nameWithoutExtension}-${timestamp}.${extension}`;
};

export const getFileExtension = (filename: string) => filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2);

export const getFileName = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf(".");

  const nameWithoutExtension = fileName.substring(0, dotIndex);

  return nameWithoutExtension;
};

/**
 * Returns true when the given filename or extension can be previewed as an image in the browser.
 */
export const isPreviewableImage = (filenameOrExtension: string): boolean => {
  const normalized = filenameOrExtension.trim().toLowerCase();
  if (!normalized) return false;

  const extension = normalized.includes(".")
    ? getFileExtension(normalized).toLowerCase()
    : normalized.replace(/^\./, "");

  return PREVIEWABLE_IMAGE_EXTENSIONS.has(extension);
};

export const convertBytesToSize = (bytes: number) => {
  let size;

  if (bytes < 1024 * 1024) {
    size = Math.round(bytes / 1024) + " KB";
  } else {
    size = Math.round(bytes / (1024 * 1024)) + " MB";
  }

  return size;
};
