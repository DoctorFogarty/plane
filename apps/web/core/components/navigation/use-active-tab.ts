/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { isIssueLayoutPathSlug } from "@plane/constants";
import type { TIssue } from "@plane/types";
import type { TNavigationItem } from "@/components/navigation/tab-navigation-root";
import { isNavHrefActive } from "@/components/navigation/tab-navigation-utils";

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
    (item: TNavigationItem) => {
      const workItemCondition = workItemId && workItem && !workItem?.is_epic && workItem?.project_id === projectId;
      const epicCondition = workItemId && workItem && workItem?.is_epic && workItem?.project_id === projectId;
      const isLayoutActiveForWorkItem =
        !!workItemCondition && isIssueLayoutPathSlug(item.key) && item.key === workItemLayoutNavKey;
      const isEpicActive = item.key === "epics" && epicCondition;
      if (item.key === "views") {
        return pathname === item.href || pathname === `${item.href}/`;
      }
      return isLayoutActiveForWorkItem || isEpicActive || isNavHrefActive(pathname, item.href);
    },
    [pathname, workItem, workItemId, projectId, workItemLayoutNavKey]
  );

  const activeItem = useMemo(() => navigationItems.find((item) => isActive(item)), [navigationItems, isActive]);

  return { isActive, activeItem };
};
