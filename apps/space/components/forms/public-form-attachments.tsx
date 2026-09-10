/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useId, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { MAX_FILE_SIZE, MAX_INTAKE_FORM_ATTACHMENTS } from "@plane/constants";
import { SitesIntakeFormService } from "@plane/services";
import type { TIntakeFormField, TIntakeFormUploadedAttachment } from "@plane/types";
import { canAcceptMoreIntakeFormAttachments, convertBytesToSize } from "@plane/utils";

const formService = new SitesIntakeFormService();

type TLocalUpload = {
  localId: string;
  name: string;
  size: number;
};

type Props = {
  anchor: string;
  field: TIntakeFormField;
  value: TIntakeFormUploadedAttachment[];
  onAdd: (attachments: TIntakeFormUploadedAttachment[]) => void;
  onRemove: (assetId: string) => void;
  onBusyChange?: (busy: boolean) => void;
  error?: string;
};

export function PublicFormAttachmentsField(props: Props) {
  const { anchor, field, value, onAdd, onRemove, onBusyChange, error } = props;
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const [uploading, setUploading] = useState<TLocalUpload[]>([]);

  const maxCount = field.max_count ?? MAX_INTAKE_FORM_ATTACHMENTS;
  const maxSize = field.max_size ?? MAX_FILE_SIZE;
  const requiredMark = field.required ? " *" : "";
  const atCapacity = value.length + uploading.length >= maxCount;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const selected = Array.from(fileList);
    if (inputRef.current) inputRef.current.value = "";

    const oversized = selected.find((file) => file.size > maxSize);
    if (oversized) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("attachment.file_size_limit", { size: Math.round(maxSize / (1024 * 1024)) }),
      });
      return;
    }

    if (!canAcceptMoreIntakeFormAttachments(value.length + uploading.length, selected.length, maxCount)) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("project_settings.features.intake.form.attachments_too_many", { count: maxCount }),
      });
      return;
    }

    const locals: TLocalUpload[] = selected.map((file) => ({
      localId: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      size: file.size,
    }));
    setUploading((current) => [...current, ...locals]);
    onBusyChange?.(true);
    const pendingLocalIds = new Set(locals.map((local) => local.localId));

    const uploaded: TIntakeFormUploadedAttachment[] = [];
    await Promise.all(
      selected.map(async (file, index) => {
        const local = locals[index];
        try {
          const response = await formService.uploadAttachment(anchor, file);
          uploaded.push({ id: response.asset_id, name: file.name, size: file.size });
        } catch {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("error"),
            message: t("attachment.error"),
          });
        } finally {
          pendingLocalIds.delete(local.localId);
          setUploading((current) => current.filter((item) => item.localId !== local.localId));
          if (pendingLocalIds.size === 0) onBusyChange?.(false);
        }
      })
    );

    if (uploaded.length > 0) {
      onAdd(uploaded);
    }
  };

  const removeUploaded = (assetId: string) => {
    onRemove(assetId);
    void formService.deleteAttachment(anchor, assetId).catch(() => undefined);
  };

  return (
    <div className="space-y-2">
      <span className="text-13 font-medium text-primary">
        {t("attachments")}
        {requiredMark}
      </span>
      <p id={helpId} className="text-11 text-tertiary">
        {t("project_settings.features.intake.form.attachments_help", { count: maxCount })}
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        aria-label={t("project_settings.features.intake.form.add_attachments")}
        aria-describedby={helpId}
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        prependIcon={<Paperclip />}
        onClick={() => inputRef.current?.click()}
        disabled={atCapacity}
      >
        {t("project_settings.features.intake.form.add_attachments")}
      </Button>
      {value.length > 0 || uploading.length > 0 ? (
        <ul className="space-y-1.5">
          {value.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2 text-13"
            >
              <span className="min-w-0 truncate text-primary">{item.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-11 text-tertiary">
                {convertBytesToSize(item.size)}
                <button
                  type="button"
                  className="rounded p-0.5 text-secondary hover:text-primary"
                  aria-label={t("attachment.delete")}
                  onClick={() => removeUploaded(item.id)}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
          {uploading.map((item) => (
            <li
              key={item.localId}
              className="flex items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2 text-13"
            >
              <span className="min-w-0 truncate text-primary">{item.name}</span>
              <span className="shrink-0 text-11 text-tertiary">
                {t("project_settings.features.intake.form.attachments_uploading")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-11 text-danger-primary">{error}</p> : null}
    </div>
  );
}
