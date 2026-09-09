/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ElementType } from "react";
// plane imports
import { EUserPermissions, EProjectFeatureKey, ISSUE_LAYOUT_NAV_ITEMS } from "@plane/constants";
import type { TIssueLayoutPathSlug } from "@plane/constants";
import {
  BoardLayoutIcon,
  CalendarLayoutIcon,
  CycleIcon,
  IntakeIcon,
  ListLayoutIcon,
  ModuleIcon,
  PageIcon,
  SheetLayoutIcon,
  TimelineLayoutIcon,
  ViewsIcon,
} from "@plane/propel/icons";
// components
import type { TNavigationItem } from "@/components/navigation/navigation-item";

const ISSUE_LAYOUT_NAV_ICONS: Record<TIssueLayoutPathSlug, ElementType> = {
  list: ListLayoutIcon,
  board: BoardLayoutIcon,
  calendar: CalendarLayoutIcon,
  table: SheetLayoutIcon,
  timeline: TimelineLayoutIcon,
};

export const getProjectFeatureNavigation = (
  workspaceSlug: string,
  projectId: string,
  project: {
    cycle_view: boolean;
    module_view: boolean;
    issue_views_view: boolean;
    page_view: boolean;
    inbox_view: boolean;
  }
): TNavigationItem[] => [
  ...ISSUE_LAYOUT_NAV_ITEMS.map((item) => ({
    i18n_key: item.i18n_key,
    key: item.key,
    name: item.name,
    href: `/${workspaceSlug}/projects/${projectId}/issues/${item.slug}`,
    icon: ISSUE_LAYOUT_NAV_ICONS[item.slug],
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    shouldRender: true,
    sortOrder: item.sortOrder,
  })),
  {
    i18n_key: "sidebar.cycles",
    key: EProjectFeatureKey.CYCLES,
    name: "Cycles",
    href: `/${workspaceSlug}/projects/${projectId}/cycles`,
    icon: CycleIcon,
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    shouldRender: !!project.cycle_view,
    sortOrder: 6,
  },
  {
    i18n_key: "sidebar.modules",
    key: EProjectFeatureKey.MODULES,
    name: "Modules",
    href: `/${workspaceSlug}/projects/${projectId}/modules`,
    icon: ModuleIcon,
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    shouldRender: !!project.module_view,
    sortOrder: 7,
  },
  {
    i18n_key: "sidebar.views",
    key: EProjectFeatureKey.VIEWS,
    name: "Views",
    href: `/${workspaceSlug}/projects/${projectId}/views`,
    icon: ViewsIcon,
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    shouldRender: !!project.issue_views_view,
    sortOrder: 8,
  },
  {
    i18n_key: "sidebar.pages",
    key: EProjectFeatureKey.PAGES,
    name: "Pages",
    href: `/${workspaceSlug}/projects/${projectId}/pages`,
    icon: PageIcon,
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    shouldRender: !!project.page_view,
    sortOrder: 9,
  },
  {
    i18n_key: "sidebar.intake",
    key: EProjectFeatureKey.INTAKE,
    name: "Intake",
    href: `/${workspaceSlug}/projects/${projectId}/intake`,
    icon: IntakeIcon,
    access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    shouldRender: !!project.inbox_view,
    sortOrder: 10,
  },
];
