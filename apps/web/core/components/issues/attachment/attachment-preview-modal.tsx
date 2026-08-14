/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileURL: string;
};

export function AttachmentPreviewModal(props: Props) {
  const { isOpen, onClose, fileName, fileURL } = props;
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    setHasError(false);
  }, [isOpen, fileURL]);

  const handleDownload = () => {
    window.open(fileURL, "_blank", "noopener,noreferrer");
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.VIIXL}
      className="overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-3">
        <p className="truncate text-14 font-medium text-primary" title={fileName}>
          {fileName}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownload}
            prependIcon={<Download className="size-3.5" />}
          >
            {t("attachment.download")}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded text-secondary hover:bg-surface-2 hover:text-primary"
            aria-label={t("close")}
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative flex max-h-[80vh] min-h-48 items-center justify-center bg-surface-2 p-4">
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center text-13 text-secondary">
            {t("common.loading")}
          </div>
        )}
        {hasError ? (
          <p className="text-13 text-secondary">{t("attachment.preview_failed")}</p>
        ) : (
          <img
            src={fileURL}
            alt={fileName}
            className={`max-h-[calc(80vh-2rem)] max-w-full object-contain ${isLoading ? "opacity-0" : "opacity-100"}`}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        )}
      </div>
    </ModalCore>
  );
}
