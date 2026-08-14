/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { MouseEvent } from "react";
import { observer } from "mobx-react";

import { useTranslation } from "@plane/i18n";
import { TrashIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// ui
import { CustomMenu } from "@plane/ui";
import {
  convertBytesToSize,
  getFileExtension,
  getFileName,
  getFileURL,
  isPreviewableImage,
  renderFormattedDate,
} from "@plane/utils";
// components
import { AttachmentPreviewModal } from "@/components/issues/attachment/attachment-preview-modal";
import { AttachmentThumbnail } from "@/components/issues/attachment/attachment-thumbnail";
//
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
// helpers
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { usePlatformOS } from "@/hooks/use-platform-os";

type TIssueAttachmentsListItem = {
  attachmentId: string;
  disabled?: boolean;
  issueServiceType?: TIssueServiceType;
};

export const IssueAttachmentsListItem = observer(function IssueAttachmentsListItem(props: TIssueAttachmentsListItem) {
  const { t } = useTranslation();
  // props
  const { attachmentId, disabled, issueServiceType = EIssueServiceType.ISSUES } = props;
  // store hooks
  const { getUserDetails } = useMember();
  const {
    attachment: { getAttachmentById },
    toggleDeleteAttachmentModal,
  } = useIssueDetail(issueServiceType);
  // state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  // derived values
  const attachment = attachmentId ? getAttachmentById(attachmentId) : undefined;
  const fullFileName = attachment?.attributes.name ?? "";
  const fileName = getFileName(fullFileName);
  const fileExtension = getFileExtension(fullFileName);
  const displayName = `${fileName}.${fileExtension}`;
  const fileURL = getFileURL(attachment?.asset_url ?? "");
  const canPreview = isPreviewableImage(fullFileName);
  // hooks
  const { isMobile } = usePlatformOS();

  if (!attachment) return <></>;

  const handleAttachmentClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canPreview) {
      setIsPreviewOpen(true);
      return;
    }
    window.open(fileURL, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      {canPreview && (
        <AttachmentPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          fileName={displayName}
          fileURL={fileURL ?? ""}
        />
      )}
      <button type="button" onClick={handleAttachmentClick}>
        <div className="group flex h-11 items-center justify-between gap-3 pr-2 pl-9 hover:bg-surface-2">
          <div className="flex items-center gap-3 truncate text-13">
            <AttachmentThumbnail
              fileURL={fileURL ?? ""}
              fileExtension={fileExtension}
              size={24}
              canPreview={canPreview}
            />
            <Tooltip tooltipContent={displayName} isMobile={isMobile}>
              <p className="truncate font-medium text-secondary">{displayName}</p>
            </Tooltip>
            <span className="flex size-1.5 rounded-full bg-layer-1" />
            <span className="flex-shrink-0 text-placeholder">{convertBytesToSize(attachment.attributes.size)}</span>
          </div>

          <div className="flex items-center gap-3">
            {attachment?.created_by && (
              <>
                <Tooltip
                  isMobile={isMobile}
                  tooltipContent={`${
                    getUserDetails(attachment?.created_by)?.display_name ?? ""
                  } uploaded on ${renderFormattedDate(attachment.updated_at)}`}
                >
                  <div className="flex items-center justify-center">
                    <ButtonAvatars showTooltip userIds={attachment?.created_by} />
                  </div>
                </Tooltip>
              </>
            )}

            <CustomMenu ellipsis closeOnSelect placement="bottom-end" disabled={disabled}>
              <CustomMenu.MenuItem
                onClick={() => {
                  toggleDeleteAttachmentModal(attachmentId);
                }}
              >
                <div className="flex items-center gap-2">
                  <TrashIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>{t("common.actions.delete")}</span>
                </div>
              </CustomMenu.MenuItem>
            </CustomMenu>
          </div>
        </div>
      </button>
    </>
  );
});
