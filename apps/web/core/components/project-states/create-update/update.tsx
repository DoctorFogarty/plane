/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IState, IStateGroup, TStateOperationsCallbacks } from "@plane/types";
import { getStateDeleteDisabledReason, isStateDeleteDisabled } from "@/components/project-states/helpers";
import { StateDeleteConfirmModal } from "@/components/project-states/options/delete";
import { StateForm } from "@/components/project-states/create-update/form";

type TStateUpdate = {
  state: IState;
  updateStateCallback: TStateOperationsCallbacks["updateState"];
  deleteStateCallback: TStateOperationsCallbacks["deleteState"];
  shouldTrackEvents: boolean;
  handleClose: () => void;
  groups?: IStateGroup[];
};

export const StateUpdate = observer(function StateUpdate(props: TStateUpdate) {
  const { state, updateStateCallback, deleteStateCallback, handleClose, groups } = props;
  const [loader, setLoader] = useState(false);
  const [isDeleteModal, setIsDeleteModal] = useState(false);
  const deleteDisabled = isStateDeleteDisabled(state);
  const deleteDisabledReason = getStateDeleteDisabledReason(state);

  const onCancel = () => {
    setLoader(false);
    handleClose();
  };

  const onSubmit = async (formData: Partial<IState>) => {
    if (!state.id) return { status: "error" };

    try {
      setLoader(true);
      await updateStateCallback(state.id, formData);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "State updated successfully.",
      });
      handleClose();
      return { status: "success" };
    } catch (error) {
      const errorStatus = error as { status: number };
      if (errorStatus?.status === 400) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "Another state exists with the same name. Please try again with another name.",
        });
        return { status: "already_exists" };
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "State could not be updated. Please try again.",
      });
      return { status: "error" };
    } finally {
      setLoader(false);
    }
  };

  return (
    <>
      {isDeleteModal ? (
        <StateDeleteConfirmModal
          state={state}
          isOpen
          onClose={() => setIsDeleteModal(false)}
          deleteStateCallback={deleteStateCallback}
          onDeleted={handleClose}
        />
      ) : null}
      <StateForm
        data={state}
        onSubmit={onSubmit}
        onCancel={onCancel}
        buttonDisabled={loader}
        buttonTitle={loader ? `Updating` : `Update`}
        groups={groups}
        onDelete={() => setIsDeleteModal(true)}
        isDeleteDisabled={deleteDisabled}
        deleteDisabledReason={deleteDisabledReason}
      />
    </>
  );
});
