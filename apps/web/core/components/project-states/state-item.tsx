/* eslint-disable unicorn/no-array-sort, unicorn/no-empty-file, promise/always-return, jsx-a11y/no-autofocus, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role, react-hooks/exhaustive-deps, react/no-array-index-key, no-shadow, no-unneeded-ternary, no-unused-expressions, no-useless-constructor */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { observer } from "mobx-react";
// Plane
import type { TDraggableData } from "@plane/constants";
import type { IState, IStateGroup, TStateGroups, TStateOperationsCallbacks } from "@plane/types";
import { DropIndicator } from "@plane/ui";
import { cn, getCurrentStateSequence } from "@plane/utils";
// components
import { StateItemTitle, StateUpdate } from "@/components/project-states";

type TStateItem = {
  groupKey: TStateGroups;
  groupId: string;
  groups: IStateGroup[];
  groupedStates: Record<string, IState[]>;
  totalStates: number;
  state: IState;
  stateOperationsCallbacks: TStateOperationsCallbacks;
  shouldTrackEvents: boolean;
  disabled?: boolean;
  stateItemClassName?: string;
};

export const StateItem = observer(function StateItem(props: TStateItem) {
  const {
    groupKey,
    groupId,
    groups,
    groupedStates,
    totalStates,
    state,
    stateOperationsCallbacks,
    shouldTrackEvents,
    disabled = false,
    stateItemClassName,
  } = props;
  const draggableElementRef = useRef<HTMLDivElement | null>(null);
  const [updateStateModal, setUpdateStateModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [closestEdge, setClosestEdge] = useState<string | null>(null);

  const commonStateItemListProps = {
    stateCount: totalStates,
    state: state,
    setUpdateStateModal: setUpdateStateModal,
  };

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
    const initialData: TDraggableData = { groupKey, groupId, id: state.id };

    if (elementRef && state) {
      return combine(
        draggable({
          element: elementRef,
          getInitialData: () => ({ ...initialData, type: "STATE_ITEM" }),
          onDragStart: () => setIsDragging(true),
          onDrop: () => setIsDragging(false),
          canDrag: () => !disabled,
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
            const { self, source } = data;
            const sourceData = source.data as TDraggableData;
            const destinationData = self.data as TDraggableData;

            if (sourceData && destinationData && sourceData.id) {
              const destinationGroupKey = destinationData.groupKey;
              const destinationGroupId = destinationData.groupId;
              const edge = extractClosestEdge(destinationData) || undefined;
              const destinationStates =
                (destinationGroupId && groupedStates[destinationGroupId]) || groupedStates[destinationGroupKey] || [];
              const payload: Partial<IState> = {
                id: sourceData.id,
                group: destinationGroupKey,
                group_id: destinationGroupId,
                sequence: getCurrentStateSequence(destinationStates, destinationData, edge),
              };
              handleStateSequence(payload);
            }
          },
        })
      );
    }
  }, [state, groupKey, groupId, groupedStates, handleStateSequence, disabled]);

  if (updateStateModal)
    return (
      <StateUpdate
        state={state}
        updateStateCallback={stateOperationsCallbacks.updateState}
        shouldTrackEvents={shouldTrackEvents}
        handleClose={() => setUpdateStateModal(false)}
        groups={groups}
      />
    );

  return (
    <Fragment>
      <DropIndicator isVisible={isDraggedOver && closestEdge === "top"} />
      <div
        ref={draggableElementRef}
        className={cn(
          "group relative rounded-sm border border-subtle bg-surface-1 px-3 py-2.5",
          isDragging ? `opacity-50` : `opacity-100`,
          disabled ? `cursor-auto` : `cursor-grab`,
          stateItemClassName
        )}
      >
        {disabled ? (
          <StateItemTitle {...commonStateItemListProps} disabled />
        ) : (
          <StateItemTitle
            {...commonStateItemListProps}
            disabled={false}
            stateOperationsCallbacks={{
              markStateAsDefault: stateOperationsCallbacks.markStateAsDefault,
              deleteState: stateOperationsCallbacks.deleteState,
            }}
            shouldTrackEvents={shouldTrackEvents}
          />
        )}
      </div>
      <DropIndicator isVisible={isDraggedOver && closestEdge === "bottom"} />
    </Fragment>
  );
});
