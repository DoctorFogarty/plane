/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { observer } from "mobx-react";
import type { TDraggableData } from "@plane/constants";
import type { IState, IStateGroup, TStateOperationsCallbacks } from "@plane/types";
import { DropIndicator } from "@plane/ui";
import { cn, getCurrentStateSequence } from "@plane/utils";
import { StateUpdate } from "@/components/project-states/create-update/update";
import { StateItemTitle } from "@/components/project-states/state-item-title";
import { StateSpine } from "@/components/project-states/state-spine";

type TStateItem = {
  states: IState[];
  groups: IStateGroup[];
  state: IState;
  stateOperationsCallbacks: TStateOperationsCallbacks;
  shouldTrackEvents: boolean;
  disabled?: boolean;
};

export const StateItem = observer(function StateItem(props: TStateItem) {
  const { states, groups, state, stateOperationsCallbacks, shouldTrackEvents, disabled = false } = props;
  const draggableElementRef = useRef<HTMLDivElement | null>(null);
  const [updateStateModal, setUpdateStateModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [closestEdge, setClosestEdge] = useState<string | null>(null);

  const handleStateSequence = useCallback(
    async (payload: Partial<IState>) => {
      try {
        if (!payload.id) return;
        await stateOperationsCallbacks.moveStatePosition(payload.id, payload);
      } catch (error) {
        console.error("error", error);
      }
    },
    [stateOperationsCallbacks]
  );

  useEffect(() => {
    const elementRef = draggableElementRef.current;
    if (!elementRef || !state || disabled) return;

    const initialData: TDraggableData = {
      groupKey: state.group,
      groupId: state.group_id ?? undefined,
      id: state.id,
    };

    return combine(
      draggable({
        element: elementRef,
        getInitialData: () => ({ ...initialData, type: "STATE_ITEM" }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
        canDrag: () => !disabled && !updateStateModal,
      }),
      dropTargetForElements({
        element: elementRef,
        canDrop: ({ source }) => source.data.type === "STATE_ITEM",
        getData: ({ input, element }) =>
          attachClosestEdge(
            { ...initialData, type: "STATE_ITEM" },
            {
              input,
              element,
              allowedEdges: ["top", "bottom"],
            }
          ),
        onDragEnter: (args) => {
          setIsDraggedOver(true);
          setClosestEdge(extractClosestEdge(args.self.data));
        },
        onDragLeave: () => {
          setIsDraggedOver(false);
          setClosestEdge(null);
        },
        onDrop: (data) => {
          setIsDraggedOver(false);
          const sourceData = data.source.data as TDraggableData;
          const destinationData = data.self.data as TDraggableData;
          if (!sourceData?.id) return;
          const edge = extractClosestEdge(destinationData) || undefined;
          const sequence = getCurrentStateSequence(states, destinationData, edge);
          const payload: Partial<IState> = {
            id: sourceData.id,
            sequence,
          };
          handleStateSequence(payload);
        },
      })
    );
  }, [state, states, handleStateSequence, disabled, updateStateModal]);

  if (updateStateModal) {
    return (
      <div className="relative">
        <StateSpine color={state.color} />
        <div className="border-b border-subtle py-3 pl-4">
          <StateUpdate
            key={state.id}
            state={state}
            updateStateCallback={stateOperationsCallbacks.updateState}
            deleteStateCallback={stateOperationsCallbacks.deleteState}
            shouldTrackEvents={shouldTrackEvents}
            handleClose={() => setUpdateStateModal(false)}
            groups={groups}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <DropIndicator isVisible={isDraggedOver && closestEdge === "top"} />
      <div
        ref={draggableElementRef}
        className={cn("relative", isDragging ? "opacity-50" : "opacity-100", disabled ? "cursor-auto" : "cursor-grab")}
      >
        <StateSpine color={state.color} />
        <div className="border-b border-subtle py-3 pl-4">
          {disabled ? (
            <StateItemTitle state={state} setUpdateStateModal={setUpdateStateModal} disabled />
          ) : (
            <StateItemTitle
              state={state}
              setUpdateStateModal={setUpdateStateModal}
              disabled={false}
              stateOperationsCallbacks={{
                markStateAsDefault: stateOperationsCallbacks.markStateAsDefault,
                deleteState: stateOperationsCallbacks.deleteState,
              }}
              shouldTrackEvents={shouldTrackEvents}
            />
          )}
        </div>
      </div>
      <DropIndicator isVisible={isDraggedOver && closestEdge === "bottom"} />
    </>
  );
});
