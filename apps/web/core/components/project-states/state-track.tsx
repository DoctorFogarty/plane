/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { IState, IStateGroup, TStateOperationsCallbacks } from "@plane/types";
import { StateCreate } from "@/components/project-states/create-update/create";
import { sortStatesBySequence } from "@/components/project-states/helpers";
import { StateItem } from "@/components/project-states/state-item";
import { StateSpine } from "@/components/project-states/state-spine";

type TStateTrack = {
  states: IState[];
  groups: IStateGroup[];
  stateOperationsCallbacks: TStateOperationsCallbacks;
  isEditable: boolean;
  shouldTrackEvents: boolean;
};

export const StateTrack = observer(function StateTrack(props: TStateTrack) {
  const { states, groups, stateOperationsCallbacks, isEditable, shouldTrackEvents } = props;
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const orderedStates = sortStatesBySequence(states);

  return (
    <div>
      {orderedStates.map((state) => (
        <StateItem
          key={state.id}
          state={state}
          states={orderedStates}
          groups={groups}
          disabled={!isEditable}
          stateOperationsCallbacks={stateOperationsCallbacks}
          shouldTrackEvents={shouldTrackEvents}
        />
      ))}

      {isEditable && isCreating ? (
        <div className="relative">
          <StateSpine dashed />
          <div className="py-3 pl-4">
            <StateCreate
              groups={groups}
              createStateCallback={stateOperationsCallbacks.createState}
              handleClose={() => setIsCreating(false)}
            />
          </div>
        </div>
      ) : null}

      {isEditable && !isCreating ? (
        <div className="relative">
          <StateSpine dashed />
          <button
            type="button"
            className="w-full py-3 pl-4 text-left text-14 text-secondary transition-colors hover:text-primary"
            onClick={() => setIsCreating(true)}
          >
            {t("project_settings.states.add_status")}
          </button>
        </div>
      ) : null}
    </div>
  );
});
