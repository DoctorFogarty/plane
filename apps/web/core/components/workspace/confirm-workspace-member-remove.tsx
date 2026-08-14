/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
/* eslint-disable jsx-a11y/tabindex-no-positive */

import { useState } from "react";
import { observer } from "mobx-react";
import { AlertTriangle } from "lucide-react";
// ui
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

export type TConfirmWorkspaceMemberAction = "remove" | "delete" | "leave" | "cancel_invite";

export type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  userDetails: {
    id: string;
    display_name: string;
  };
  variant: TConfirmWorkspaceMemberAction;
};

export const ConfirmWorkspaceMemberRemove = observer(function ConfirmWorkspaceMemberRemove(props: Props) {
  const { isOpen, onClose, onSubmit, userDetails, variant } = props;
  // states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useTranslation();

  const handleClose = () => {
    onClose();
    setIsSubmitting(false);
  };

  const handleDeletion = async () => {
    setIsSubmitting(true);

    await onSubmit();

    handleClose();
  };

  const title =
    variant === "leave"
      ? t("workspace_settings.settings.members.leave_title")
      : variant === "delete"
        ? t("workspace_settings.settings.members.delete_title", { name: userDetails.display_name })
        : variant === "cancel_invite"
          ? t("workspace_settings.settings.members.cancel_invite_title", { name: userDetails.display_name })
          : t("workspace_settings.settings.members.remove_title", { name: userDetails.display_name });

  const description =
    variant === "leave"
      ? t("workspace_settings.settings.members.leave_confirmation")
      : variant === "delete"
        ? t("workspace_settings.settings.members.delete_confirmation", { name: userDetails.display_name })
        : variant === "cancel_invite"
          ? t("workspace_settings.settings.members.cancel_invite_confirmation", { name: userDetails.display_name })
          : t("workspace_settings.settings.members.remove_confirmation", { name: userDetails.display_name });

  const confirmLabel =
    variant === "leave"
      ? isSubmitting
        ? t("leaving")
        : t("leave")
      : variant === "delete"
        ? isSubmitting
          ? t("deleting")
          : t("delete")
        : isSubmitting
          ? t("removing")
          : t("remove");

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
        <div className="sm:flex sm:items-start">
          <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-danger-subtle sm:mx-0 sm:h-10 sm:w-10">
            <AlertTriangle className="h-6 w-6 text-danger-primary" aria-hidden="true" />
          </div>
          <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
            <h3 className="text-h5-medium leading-6 text-primary">{title}</h3>
            <div className="mt-2">
              <p className="text-body-xs-regular text-secondary">{description}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 p-4 sm:px-6">
        <Button variant="secondary" size="lg" onClick={handleClose}>
          {t("cancel")}
        </Button>
        <Button variant="error-fill" size="lg" tabIndex={1} onClick={handleDeletion} loading={isSubmitting}>
          {confirmLabel}
        </Button>
      </div>
    </ModalCore>
  );
});
