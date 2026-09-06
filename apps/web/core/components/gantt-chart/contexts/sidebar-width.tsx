/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocalStorage } from "@plane/hooks";
import { GANTT_SIDEBAR_WIDTH_STORAGE_KEY, SIDEBAR_WIDTH } from "../constants";
import { clampGanttSidebarWidth } from "../sidebar-width";

type TGanttSidebarWidthContext = {
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
};

const GanttSidebarWidthContext = createContext<TGanttSidebarWidthContext | null>(null);

type TGanttSidebarWidthProviderProps = {
  children: ReactNode;
};

export function GanttSidebarWidthProvider(props: TGanttSidebarWidthProviderProps) {
  const { children } = props;
  const { storedValue, setValue } = useLocalStorage<number>(GANTT_SIDEBAR_WIDTH_STORAGE_KEY, SIDEBAR_WIDTH);
  const [sidebarWidth, setSidebarWidthState] = useState(() => clampGanttSidebarWidth(storedValue ?? SIDEBAR_WIDTH));

  const setSidebarWidth = useCallback(
    (width: number) => {
      const nextWidth = clampGanttSidebarWidth(width);
      setSidebarWidthState(nextWidth);
      setValue(nextWidth);
    },
    [setValue]
  );

  const value = useMemo(
    () => ({
      sidebarWidth,
      setSidebarWidth,
    }),
    [sidebarWidth, setSidebarWidth]
  );

  return <GanttSidebarWidthContext.Provider value={value}>{children}</GanttSidebarWidthContext.Provider>;
}

export function useGanttSidebarWidth(): TGanttSidebarWidthContext {
  const context = useContext(GanttSidebarWidthContext);
  if (!context) {
    return {
      sidebarWidth: SIDEBAR_WIDTH,
      setSidebarWidth: () => undefined,
    };
  }
  return context;
}
