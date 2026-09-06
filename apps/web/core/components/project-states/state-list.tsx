/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { IState, IStateGroup, TStateGroups, TStateOperationsCallbacks } from "@plane/types";
import { StateItem } from "@/components/project-states/state-item";

type TStateList = {
  groupKey: TStateGroups;
  groupId: string;
  groups: IStateGroup[];
  groupedStates: Record<string, IState[]>;
  states: IState[];
  stateOperationsCallbacks: TStateOperationsCallbacks;
  shouldTrackEvents: boolean;
  disabled?: boolean;
  stateItemClassName?: string;
};

export const StateList = observer(function StateList(props: TStateList) {
  const { groups, states, stateOperationsCallbacks, shouldTrackEvents, disabled = false } = props;

  return (
    <>
      {states.map((state: IState) => (
        <StateItem
          key={state.id}
          state={state}
          states={states}
          groups={groups}
          disabled={disabled}
          stateOperationsCallbacks={stateOperationsCallbacks}
          shouldTrackEvents={shouldTrackEvents}
        />
      ))}
    </>
  );
});
