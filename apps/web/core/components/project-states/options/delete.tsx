/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable promise/always-return */

import { useState, useTransition } from "react";
import { observer } from "mobx-react";
import { STATE_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IState, TStateOperationsCallbacks } from "@plane/types";
import { AlertModalCore, CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  deleteDisabledTooltipKey,
  getDefaultFallbackStateId,
  getFallbackStateOptions,
  getStateDeleteDisabledReason,
  isStateDeleteDisabled,
} from "@/components/project-states/helpers";
import { useProjectState } from "@/hooks/store/use-project-state";

type TStateDelete = {
  state: IState;
  deleteStateCallback: TStateOperationsCallbacks["deleteState"];
  shouldTrackEvents?: boolean;
  onDeleted?: () => void;
};

type TStateDeleteConfirmModal = {
  state: IState;
  isOpen: boolean;
  onClose: () => void;
  deleteStateCallback: TStateOperationsCallbacks["deleteState"];
  onDeleted?: () => void;
};

export const StateDeleteConfirmModal = observer(function StateDeleteConfirmModal(props: TStateDeleteConfirmModal) {
  const { state, isOpen, onClose, deleteStateCallback, onDeleted } = props;
  const { t } = useTranslation();
  const { projectStates } = useProjectState();
  const [fallbackOverride, setFallbackOverride] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const options = getFallbackStateOptions(projectStates ?? [], state.id);
  const selectedFallbackId = fallbackOverride ?? getDefaultFallbackStateId(projectStates ?? [], state);
  const selectedFallback = options.find((option) => option.id === selectedFallbackId);

  const handleDeleteState = () => {
    if (!selectedFallbackId || isSubmitting) return;

    setIsSubmitting(true);
    startTransition(() => {
      void deleteStateCallback(state.id, selectedFallbackId)
        .then(() => {
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("toast.success"),
            message: t("project_settings.states.delete.success"),
          });
          onClose();
          onDeleted?.();
        })
        .catch(() => {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
            message: t("project_settings.states.delete.failed"),
          });
        })
        .finally(() => setIsSubmitting(false));
    });
  };

  return (
    <AlertModalCore
      handleClose={onClose}
      handleSubmit={handleDeleteState}
      isSubmitting={isPending || isSubmitting}
      isOpen={isOpen}
      title={t("project_settings.states.delete.title")}
      primaryButtonText={{
        loading: t("project_settings.states.delete.deleting"),
        default: t("project_settings.states.delete.button"),
      }}
      content={
        <>
          {t("project_settings.states.delete.confirm", { name: state.name })}
          <span className="mt-3 block text-left">
            <span className="mb-1.5 block text-13 font-medium text-primary">
              {t("project_settings.states.delete.move_work_items")}
            </span>
            <CustomSelect
              value={selectedFallbackId ?? null}
              label={selectedFallback?.name ?? t("project_settings.states.delete.select_state")}
              onChange={(stateId: string) => setFallbackOverride(stateId)}
              buttonClassName="w-full"
            >
              {options.map((option) => (
                <CustomSelect.Option key={option.id} value={option.id}>
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: option.color }} />
                    {option.name}
                  </span>
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </span>
        </>
      }
    />
  );
});

export const StateDelete = observer(function StateDelete(props: TStateDelete) {
  const { state, deleteStateCallback, shouldTrackEvents, onDeleted } = props;
  const { t } = useTranslation();
  const [isDeleteModal, setIsDeleteModal] = useState(false);
  const deleteReason = getStateDeleteDisabledReason(state);
  const deleteDisabled = isStateDeleteDisabled(state);

  return (
    <>
      {isDeleteModal ? (
        <StateDeleteConfirmModal
          state={state}
          isOpen
          onClose={() => setIsDeleteModal(false)}
          deleteStateCallback={deleteStateCallback}
          onDeleted={onDeleted}
        />
      ) : null}

      <button
        type="button"
        aria-label={t("project_settings.states.delete.title")}
        className={cn(
          "flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm transition-colors focus:outline-none",
          deleteDisabled ? "bg-surface-2 text-secondary" : "text-danger-primary hover:bg-layer-1"
        )}
        disabled={deleteDisabled}
        onClick={() => setIsDeleteModal(true)}
        data-ph-element={shouldTrackEvents ? STATE_TRACKER_ELEMENTS.STATE_LIST_DELETE_BUTTON : undefined}
      >
        <Tooltip
          tooltipContent={deleteReason ? t(deleteDisabledTooltipKey(deleteReason)) : ""}
          disabled={!deleteDisabled}
          className="focus:outline-none"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </Tooltip>
      </button>
    </>
  );
});
