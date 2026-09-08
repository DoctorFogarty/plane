/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import type { ChangeEvent } from "react";
import { Paperclip, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { convertBytesToSize, getFileExtension, hasDangerousAttachmentExtension } from "@plane/utils";
import { getFileIcon } from "@/components/icons/attachment/attachment-icon";
import type { TPendingAttachment } from "@/helpers/create-issue-attachments";
import { addPendingAttachments } from "@/helpers/create-issue-attachments";
import { useFileSize } from "@/hooks/use-file-size";

type TCreateIssueAttachmentChipProps = {
  attachment: TPendingAttachment;
  disabled?: boolean;
  onRemove: (id: string) => void;
};

export function CreateIssueAttachmentChip(props: TCreateIssueAttachmentChipProps) {
  const { attachment, disabled = false, onRemove } = props;
  const { t } = useTranslation();
  const fileName = attachment.file.name;
  const fileIcon = getFileIcon(getFileExtension(fileName), 14);

  return (
    <li className="flex max-w-full items-center gap-1.5 rounded-sm border-[0.5px] border-subtle px-2 py-1 text-caption-sm-regular">
      <span className="flex-shrink-0">{fileIcon}</span>
      <span className="min-w-0 truncate text-secondary">{fileName}</span>
      <span className="flex-shrink-0 text-11 text-tertiary">{convertBytesToSize(attachment.file.size)}</span>
      <button
        type="button"
        className="rounded p-0.5 text-secondary hover:text-primary disabled:cursor-not-allowed"
        aria-label={t("attachment.delete")}
        disabled={disabled}
        onClick={() => onRemove(attachment.id)}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

type TCreateIssueAttachmentsProps = {
  files: TPendingAttachment[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  tabIndex?: number;
};

export function CreateIssueAttachments(props: TCreateIssueAttachmentsProps) {
  const { files, onAdd, onRemove, disabled = false, tabIndex } = props;
  const { t } = useTranslation();
  const { maxFileSize } = useFileSize();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) return;

    const result = addPendingAttachments(files, selected, { maxFileSize });
    if (result.error === "type") {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("file_upload.invalid_file_type"),
      });
    }
    if (result.error === "size") {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("attachment.file_size_limit", { size: Math.round(maxFileSize / 1024 / 1024) }),
      });
    }

    const accepted = selected.filter((file) => file.size <= maxFileSize && !hasDangerousAttachmentExtension(file.name));
    if (accepted.length === 0) return;
    onAdd(accepted);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        disabled={disabled}
        aria-label={t("attachment.add")}
        onChange={handleInputChange}
      />
      <button
        type="button"
        className="flex h-7 cursor-pointer items-center justify-between gap-1 rounded-sm border-[0.5px] border-strong px-2 py-0.5 text-caption-sm-regular hover:bg-layer-1 disabled:cursor-not-allowed"
        disabled={disabled}
        tabIndex={tabIndex}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="h-3 w-3 flex-shrink-0" />
        <span className="whitespace-nowrap">{t("attachment.add")}</span>
      </button>
      {files.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-2">
          {files.map((attachment) => (
            <CreateIssueAttachmentChip
              key={attachment.id}
              attachment={attachment}
              disabled={disabled}
              onRemove={onRemove}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
