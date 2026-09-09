/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import type { TIssue } from "@plane/types";
import type { TNavigationItem } from "@/components/navigation/navigation-item";
import { isNavigationItemActive } from "@/components/navigation/tab-navigation-utils";

type UseActiveTabProps = {
  navigationItems: TNavigationItem[];
  pathname: string;
  workItemId?: string;
  workItem?: TIssue;
  projectId: string;
  workItemLayoutNavKey?: string;
};

export const useActiveTab = ({
  navigationItems,
  pathname,
  workItemId,
  workItem,
  projectId,
  workItemLayoutNavKey,
}: UseActiveTabProps) => {
  const isActive = useCallback(
    (item: TNavigationItem) =>
      isNavigationItemActive({
        item,
        pathname,
        projectId,
        workItemId,
        workItem,
        workItemLayoutNavKey,
      }),
    [pathname, workItem, workItemId, projectId, workItemLayoutNavKey]
  );

  const activeItem = useMemo(() => navigationItems.find((item) => isActive(item)), [navigationItems, isActive]);

  return { isActive, activeItem };
};
