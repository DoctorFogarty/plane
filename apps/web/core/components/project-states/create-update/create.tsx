/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { STATE_GROUPS } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IState, IStateGroup, TStateGroups, TStateOperationsCallbacks } from "@plane/types";
import { getFirstGroupIdForCategory } from "@/components/project-states/helpers";
import { StateForm } from "@/components/project-states/create-update/form";

type TStateCreate = {
  defaultCategory?: TStateGroups;
  groups?: IStateGroup[];
  shouldTrackEvents?: boolean;
  createStateCallback: TStateOperationsCallbacks["createState"];
  handleClose: () => void;
};

export const StateCreate = observer(function StateCreate(props: TStateCreate) {
  const { defaultCategory = "unstarted", groups, createStateCallback, handleClose } = props;
  const [loader, setLoader] = useState(false);
  const groupId = getFirstGroupIdForCategory(groups ?? [], defaultCategory);

  const onCancel = () => {
    setLoader(false);
    handleClose();
  };

  const onSubmit = async (formData: Partial<IState>) => {
    try {
      setLoader(true);
      await createStateCallback({
        ...formData,
        group: formData.group ?? defaultCategory,
        group_id: formData.group_id ?? groupId,
      });

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "State created successfully.",
      });
      handleClose();
      return { status: "success" };
    } catch (error) {
      const errorStatus = error as { status: number; data: { error: string } };
      if (errorStatus?.status === 400) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "State with that name already exists. Please try again with another name.",
        });
        return { status: "already_exists" };
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: errorStatus.data?.error ?? "State could not be created. Please try again.",
      });
      return { status: "error" };
    } finally {
      setLoader(false);
    }
  };

  return (
    <StateForm
      data={{
        name: "",
        description: "",
        color: STATE_GROUPS[defaultCategory].color,
        group: defaultCategory,
        group_id: groupId,
      }}
      onSubmit={onSubmit}
      onCancel={onCancel}
      buttonDisabled={loader}
      buttonTitle={loader ? `Creating` : `Create`}
      groups={groups}
    />
  );
});
