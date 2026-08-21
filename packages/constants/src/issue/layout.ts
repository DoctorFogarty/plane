/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EIssueLayoutTypes } from "@plane/types";

export type TIssueLayout = "list" | "kanban" | "calendar" | "spreadsheet" | "gantt";

export type TIssueLayoutMap = Record<
  EIssueLayoutTypes,
  {
    key: EIssueLayoutTypes;
    i18n_title: string;
    i18n_label: string;
  }
>;

export const SITES_ISSUE_LAYOUTS: {
  key: TIssueLayout;
  titleTranslationKey: string;
  icon: string;
}[] = [
  {
    key: "list",
    icon: "List",
    titleTranslationKey: "issue.layouts.list",
  },
  {
    key: "kanban",
    icon: "Kanban",
    titleTranslationKey: "issue.layouts.kanban",
  },
];

export const ISSUE_LAYOUT_MAP: TIssueLayoutMap = {
  [EIssueLayoutTypes.LIST]: {
    key: EIssueLayoutTypes.LIST,
    i18n_title: "issue.layouts.title.list",
    i18n_label: "issue.layouts.list",
  },
  [EIssueLayoutTypes.KANBAN]: {
    key: EIssueLayoutTypes.KANBAN,
    i18n_title: "issue.layouts.title.kanban",
    i18n_label: "issue.layouts.kanban",
  },
  [EIssueLayoutTypes.CALENDAR]: {
    key: EIssueLayoutTypes.CALENDAR,
    i18n_title: "issue.layouts.title.calendar",
    i18n_label: "issue.layouts.calendar",
  },
  [EIssueLayoutTypes.SPREADSHEET]: {
    key: EIssueLayoutTypes.SPREADSHEET,
    i18n_title: "issue.layouts.title.spreadsheet",
    i18n_label: "issue.layouts.spreadsheet",
  },
  [EIssueLayoutTypes.GANTT]: {
    key: EIssueLayoutTypes.GANTT,
    i18n_title: "issue.layouts.title.gantt",
    i18n_label: "issue.layouts.gantt",
  },
};

export const ISSUE_LAYOUTS: {
  key: EIssueLayoutTypes;
  i18n_title: string;
  i18n_label: string;
}[] = Object.values(ISSUE_LAYOUT_MAP);

export const ISSUE_LAYOUT_PATH_SLUGS = ["list", "board", "calendar", "table", "timeline"] as const;

export type TIssueLayoutPathSlug = (typeof ISSUE_LAYOUT_PATH_SLUGS)[number];

export const ISSUE_LAYOUT_PATH_SLUG_SET: ReadonlySet<string> = new Set(ISSUE_LAYOUT_PATH_SLUGS);

export const ISSUE_LAYOUT_PATH_SLUG_MAP: Record<TIssueLayoutPathSlug, EIssueLayoutTypes> = {
  list: EIssueLayoutTypes.LIST,
  board: EIssueLayoutTypes.KANBAN,
  calendar: EIssueLayoutTypes.CALENDAR,
  table: EIssueLayoutTypes.SPREADSHEET,
  timeline: EIssueLayoutTypes.GANTT,
};

export const ISSUE_LAYOUT_TO_PATH_SLUG: Record<EIssueLayoutTypes, TIssueLayoutPathSlug> = {
  [EIssueLayoutTypes.LIST]: "list",
  [EIssueLayoutTypes.KANBAN]: "board",
  [EIssueLayoutTypes.CALENDAR]: "calendar",
  [EIssueLayoutTypes.SPREADSHEET]: "table",
  [EIssueLayoutTypes.GANTT]: "timeline",
};

export const ISSUE_LAYOUT_NAV_ITEMS: {
  key: TIssueLayoutPathSlug;
  slug: TIssueLayoutPathSlug;
  layout: EIssueLayoutTypes;
  i18n_key: string;
  name: string;
  sortOrder: number;
}[] = [
  {
    key: "list",
    slug: "list",
    layout: EIssueLayoutTypes.LIST,
    i18n_key: "issue.layouts.list",
    name: "List",
    sortOrder: 1,
  },
  {
    key: "board",
    slug: "board",
    layout: EIssueLayoutTypes.KANBAN,
    i18n_key: "issue.layouts.kanban",
    name: "Board",
    sortOrder: 2,
  },
  {
    key: "calendar",
    slug: "calendar",
    layout: EIssueLayoutTypes.CALENDAR,
    i18n_key: "issue.layouts.calendar",
    name: "Calendar",
    sortOrder: 3,
  },
  {
    key: "table",
    slug: "table",
    layout: EIssueLayoutTypes.SPREADSHEET,
    i18n_key: "issue.layouts.spreadsheet",
    name: "Table",
    sortOrder: 4,
  },
  {
    key: "timeline",
    slug: "timeline",
    layout: EIssueLayoutTypes.GANTT,
    i18n_key: "issue.layouts.gantt",
    name: "Timeline",
    sortOrder: 5,
  },
];

const ISSUE_LAYOUT_PATH_SLUG_REGEX = /\/issues\/(list|board|calendar|table|timeline)\/?$/;
const PROJECT_ISSUES_INDEX_REGEX = /\/projects\/[^/]+\/issues\/?$/;

export function isIssueLayoutPathSlug(value: string | null | undefined): value is TIssueLayoutPathSlug {
  return !!value && ISSUE_LAYOUT_PATH_SLUG_SET.has(value);
}

export function getIssueLayoutFromPathSlug(slug: string | null | undefined): EIssueLayoutTypes | undefined {
  if (!isIssueLayoutPathSlug(slug)) return undefined;
  return ISSUE_LAYOUT_PATH_SLUG_MAP[slug];
}

export function getIssueLayoutPathSlug(layout: EIssueLayoutTypes | null | undefined): TIssueLayoutPathSlug {
  if (!layout) return "list";
  return ISSUE_LAYOUT_TO_PATH_SLUG[layout] ?? "list";
}

export function getIssueLayoutSlugFromPathname(pathname: string): TIssueLayoutPathSlug | undefined {
  const match = ISSUE_LAYOUT_PATH_SLUG_REGEX.exec(pathname);
  if (!match?.[1]) return undefined;
  return match[1] as TIssueLayoutPathSlug;
}

export function isProjectIssuesIndexPath(pathname: string): boolean {
  return PROJECT_ISSUES_INDEX_REGEX.test(pathname);
}

export function getProjectIssuesLayoutHref(
  workspaceSlug: string,
  projectId: string,
  layout: EIssueLayoutTypes | null | undefined
): string {
  return `/${workspaceSlug}/projects/${projectId}/issues/${getIssueLayoutPathSlug(layout)}`;
}
