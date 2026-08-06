/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState, startTransition } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { IState } from "@plane/types";
import { getCurrentStateSequence } from "@plane/utils";

export const STATE_COLUMN_DND_TYPE = "STATE_COLUMN";

type TUseStateColumnDndArgs = {
  enabled: boolean;
  stateId: string;
  states: IState[];
  onReorder: (stateId: string, payload: Partial<IState>) => Promise<void>;
};

export function useStateColumnDnd(options: TUseStateColumnDndArgs) {
  const { enabled, stateId, states, onReorder } = options;
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<string | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) return;

    const state = states.find((s) => s.id === stateId);
    if (!state) return;

    const initialData = {
      type: STATE_COLUMN_DND_TYPE,
      id: stateId,
      groupKey: state.group,
      groupId: state.group_id || undefined,
    };

    return combine(
      draggable({
        element,
        getInitialData: () => initialData,
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
        canDrag: () => enabled,
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source.data.type === STATE_COLUMN_DND_TYPE,
        getData: ({ input, element: el }) =>
          attachClosestEdge(initialData, {
            input,
            element: el,
            allowedEdges: ["left", "right"],
          }),
        onDragEnter: (args) => {
          setClosestEdge(extractClosestEdge(args.self.data));
        },
        onDrag: (args) => {
          setClosestEdge(extractClosestEdge(args.self.data));
        },
        onDragLeave: () => setClosestEdge(null),
        onDrop: (data) => {
          setClosestEdge(null);
          const sourceId = data.source.data.id as string | undefined;
          if (!sourceId || sourceId === stateId) return;

          const edge = extractClosestEdge(data.self.data) || undefined;
          const destinationState = states.find((s) => s.id === stateId);
          if (!destinationState) return;

          const sequence = getCurrentStateSequence(
            states,
            {
              id: stateId,
              groupKey: destinationState.group,
              groupId: destinationState.group_id || undefined,
            },
            edge
          );

          startTransition(() => {
            void onReorder(sourceId, {
              id: sourceId,
              group: destinationState.group,
              group_id: destinationState.group_id,
              sequence,
            });
          });
        },
      })
    );
  }, [enabled, stateId, states, onReorder]);

  return { elementRef, isDragging, closestEdge };
}
