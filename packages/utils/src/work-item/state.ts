/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TDraggableData } from "@plane/constants";
import { STATE_GROUPS } from "@plane/constants";
import type { IState, IStateGroup, IStateResponse } from "@plane/types";

export const orderStateGroups = (unorderedStateGroups: IStateResponse | undefined): IStateResponse | undefined => {
  if (!unorderedStateGroups) return undefined;
  return Object.assign({ backlog: [], unstarted: [], started: [], completed: [], cancelled: [] }, unorderedStateGroups);
};

/**
 * Sort states by workflow group sequence (when group metadata is provided),
 * falling back to fixed category order, then by state sequence within a group.
 */
export const sortStates = (states: IState[], groups?: IStateGroup[] | Record<string, IStateGroup>) => {
  if (!states || states.length === 0) return;

  const groupSequence = (state: IState): number => {
    if (!groups || !state.group_id) {
      return Object.keys(STATE_GROUPS).indexOf(state.group);
    }
    const group = Array.isArray(groups) ? groups.find((g) => g.id === state.group_id) : groups[state.group_id];
    if (group) return group.sequence;
    return Object.keys(STATE_GROUPS).indexOf(state.group);
  };

  return states.toSorted((stateA, stateB) => {
    const groupDiff = groupSequence(stateA) - groupSequence(stateB);
    if (groupDiff !== 0) return groupDiff;
    if (stateA.group_id && stateB.group_id && stateA.group_id === stateB.group_id) {
      return stateA.sequence - stateB.sequence;
    }
    if (stateA.group === stateB.group) {
      return stateA.sequence - stateB.sequence;
    }
    return groupDiff;
  });
};

export const sortStateGroups = (groups: IStateGroup[]) => {
  if (!groups || groups.length === 0) return [];
  return [...groups].toSorted((a, b) => a.sequence - b.sequence);
};

export const getCurrentStateSequence = (
  groupStates: IState[],
  destinationData: TDraggableData,
  edge: string | undefined
) => {
  const defaultSequence = 65535;
  if (!edge) return defaultSequence;

  const currentStateIndex = groupStates.findIndex((state) => state.id === destinationData.id);
  const currentStateSequence = groupStates[currentStateIndex]?.sequence || undefined;

  if (!currentStateSequence) return defaultSequence;

  const isBefore = edge === "top" || edge === "left";
  const isAfter = edge === "bottom" || edge === "right";

  if (isBefore) {
    const prevStateSequence = groupStates[currentStateIndex - 1]?.sequence || undefined;

    if (prevStateSequence === undefined) {
      return currentStateSequence - defaultSequence;
    }
    return (currentStateSequence + prevStateSequence) / 2;
  } else if (isAfter) {
    const nextStateSequence = groupStates[currentStateIndex + 1]?.sequence || undefined;

    if (nextStateSequence === undefined) {
      return currentStateSequence + defaultSequence;
    }
    return (currentStateSequence + nextStateSequence) / 2;
  }
};

export const getCurrentGroupSequence = (
  groups: IStateGroup[],
  destinationGroupId: string,
  edge: string | undefined
) => {
  const defaultSequence = 65535;
  if (!edge) return defaultSequence;

  const currentIndex = groups.findIndex((group) => group.id === destinationGroupId);
  const currentSequence = groups[currentIndex]?.sequence;
  if (currentSequence === undefined) return defaultSequence;

  const isBefore = edge === "top" || edge === "left";
  const isAfter = edge === "bottom" || edge === "right";

  if (isBefore) {
    const prevSequence = groups[currentIndex - 1]?.sequence;
    if (prevSequence === undefined) return currentSequence - defaultSequence;
    return (currentSequence + prevSequence) / 2;
  }
  if (isAfter) {
    const nextSequence = groups[currentIndex + 1]?.sequence;
    if (nextSequence === undefined) return currentSequence + defaultSequence;
    return (currentSequence + nextSequence) / 2;
  }
  return defaultSequence;
};
