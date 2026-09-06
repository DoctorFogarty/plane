/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { SetStateAction } from "react";
import { observer } from "mobx-react";
import { STATE_GROUPS, STATE_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EditIcon } from "@plane/propel/icons";
import type { IState, TStateOperationsCallbacks } from "@plane/types";
import { StateDelete } from "@/components/project-states/options/delete";
import { StateMarksAsDefault } from "@/components/project-states/options/mark-as-default";

type TBaseStateItemTitleProps = {
  state: IState;
  setUpdateStateModal: (value: SetStateAction<boolean>) => void;
};

type TEnabledStateItemTitleProps = TBaseStateItemTitleProps & {
  disabled: false;
  stateOperationsCallbacks: Pick<TStateOperationsCallbacks, "markStateAsDefault" | "deleteState">;
  shouldTrackEvents: boolean;
};

type TDisabledStateItemTitleProps = TBaseStateItemTitleProps & {
  disabled: true;
};

export type TStateItemTitleProps = TEnabledStateItemTitleProps | TDisabledStateItemTitleProps;

export const StateItemTitle = observer(function StateItemTitle(props: TStateItemTitleProps) {
  const { setUpdateStateModal, disabled, state } = props;
  const { t } = useTranslation();
  const categoryLabel = STATE_GROUPS[state.group]?.label ?? state.group;

  return (
    <div className="flex w-full flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h6 className="truncate text-14 font-medium text-primary">{state.name}</h6>
        <p className="text-11 text-tertiary">{categoryLabel}</p>
      </div>
      {!disabled && (
        <div className="flex shrink-0 items-center gap-2">
          <StateMarksAsDefault
            stateId={state.id}
            isDefault={Boolean(state.default)}
            color={state.color}
            markStateAsDefaultCallback={props.stateOperationsCallbacks.markStateAsDefault}
          />
          <button
            type="button"
            aria-label={t("edit")}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
            onClick={() => setUpdateStateModal(true)}
            data-ph-element={STATE_TRACKER_ELEMENTS.STATE_LIST_EDIT_BUTTON}
          >
            <EditIcon className="size-3" />
          </button>
          <StateDelete
            state={state}
            deleteStateCallback={props.stateOperationsCallbacks.deleteState}
            shouldTrackEvents={props.shouldTrackEvents}
          />
        </div>
      )}
    </div>
  );
});
