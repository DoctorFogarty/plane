/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@plane/utils";

type TGanttSidebarResizeHandleProps = {
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
};

export function GanttSidebarResizeHandle(props: TGanttSidebarResizeHandleProps) {
  const { sidebarWidth, setSidebarWidth } = props;
  const [isResizing, setIsResizing] = useState(false);
  const dragStateRef = useRef({ startX: 0, startWidth: 0 });

  const startResizing = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragStateRef.current = { startX: e.clientX, startWidth: sidebarWidth };
      setIsResizing(true);
    },
    [sidebarWidth]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStateRef.current.startX;
      setSidebarWidth(dragStateRef.current.startWidth + deltaX);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <div
      className={cn(
        "absolute top-0 right-0 z-20 h-full w-1 cursor-col-resize touch-none",
        isResizing ? "bg-accent-primary/40" : "hover:bg-accent-primary/30"
      )}
      onMouseDown={startResizing}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize work item pane"
      aria-valuenow={sidebarWidth}
    />
  );
}
