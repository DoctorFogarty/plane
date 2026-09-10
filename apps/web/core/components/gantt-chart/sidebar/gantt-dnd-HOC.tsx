/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachInstruction, extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { observer } from "mobx-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { DropIndicator } from "@plane/ui";
import { cn } from "@plane/utils";
import { HIGHLIGHT_WITH_LINE, highlightIssueOnDrop } from "@/components/issues/issue-layouts/utils";

type Props = {
  id: string;
  isLastChild: boolean;
  isDragEnabled: boolean;
  /** When false, only make-child nest drops are allowed (reorder blocked) */
  enableReorderOnly?: boolean;
  children: (isDragging: boolean) => React.ReactNode;
  onDrop: (
    draggingBlockId: string | undefined,
    droppedBlockId: string | undefined,
    dropAtEndOfList: boolean,
    makeChild?: boolean
  ) => void;
};

type TInstruction = "DRAG_OVER" | "DRAG_BELOW" | "MAKE_CHILD" | undefined;

export const GanttDnDHOC = observer(function GanttDnDHOC(props: Props) {
  const { id, isLastChild, children, onDrop, isDragEnabled, enableReorderOnly = true } = props;
  // states
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<TInstruction>(undefined);
  // refs
  const blockRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = blockRef.current;

    if (!element) return;

    return combine(
      draggable({
        element,
        canDrag: () => isDragEnabled,
        getInitialData: () => ({ id, dragInstanceId: "GANTT_REORDER" }),
        onDragStart: () => {
          setIsDragging(true);
        },
        onDrop: () => {
          setIsDragging(false);
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source?.data?.id !== id && source?.data?.dragInstanceId === "GANTT_REORDER",
        getData: ({ input, element: targetElement }) => {
          const data = { id };

          const block = enableReorderOnly ? [] : (["reorder-above", "reorder-below"] as const);

          return attachInstruction(data, {
            input,
            element: targetElement,
            currentLevel: 0,
            indentPerLevel: 0,
            mode: isLastChild ? "last-in-group" : "standard",
            block: [...block],
          });
        },
        onDrag: ({ self }) => {
          const extractedInstruction = extractInstruction(self?.data)?.type;
          if (extractedInstruction === "make-child") {
            setInstruction("MAKE_CHILD");
            return;
          }
          setInstruction(
            extractedInstruction
              ? extractedInstruction === "reorder-below" && isLastChild
                ? "DRAG_BELOW"
                : "DRAG_OVER"
              : undefined
          );
        },
        onDragLeave: () => {
          setInstruction(undefined);
        },
        onDrop: ({ self, source }) => {
          setInstruction(undefined);
          const extractedInstruction = extractInstruction(self?.data)?.type;

          const sourceId = source?.data?.id as string | undefined;
          const destinationId = self?.data?.id as string | undefined;

          if (extractedInstruction === "make-child") {
            onDrop(sourceId, destinationId, false, true);
            highlightIssueOnDrop(source?.element?.id, false, true);
            return;
          }

          const currentInstruction = extractedInstruction
            ? extractedInstruction === "reorder-below" && isLastChild
              ? "DRAG_BELOW"
              : "DRAG_OVER"
            : undefined;
          if (!currentInstruction || !enableReorderOnly) return;

          onDrop(sourceId, destinationId, currentInstruction === "DRAG_BELOW", false);
          highlightIssueOnDrop(source?.element?.id, false, true);
        },
      })
    );
  }, [blockRef, isLastChild, onDrop, isDragEnabled, enableReorderOnly, id]);

  useOutsideClickDetector(blockRef, () => blockRef?.current?.classList?.remove(HIGHLIGHT_WITH_LINE));

  return (
    <div
      id={`draggable-${id}`}
      className={cn("relative min-w-0 overflow-hidden", {
        "rounded-sm ring-2 ring-accent-strong/40 ring-inset": instruction === "MAKE_CHILD",
      })}
      ref={blockRef}
      onDragStart={() => {
        if (!isDragEnabled) {
          setToast({
            title: "Warning!",
            type: TOAST_TYPE.WARNING,
            message: "Drag and drop is only enabled when sorted by manual",
          });
        }
      }}
    >
      <DropIndicator classNames="absolute top-0" isVisible={instruction === "DRAG_OVER"} />
      {children(isDragging)}
      {isLastChild && <DropIndicator isVisible={instruction === "DRAG_BELOW"} />}
    </div>
  );
});
