/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense } from "react";
import { observer } from "mobx-react";
import { EIssueLayoutTypes } from "@plane/types";
import { ActiveLoader } from "./issue-layout-HOC";
import { useIssueLayoutPolicy } from "./issue-layout-policy";

const BaseListRoot = lazy(() => import("./list/base-list-root").then((module) => ({ default: module.BaseListRoot })));
const BaseKanBanRoot = lazy(() =>
  import("./kanban/base-kanban-root").then((module) => ({ default: module.BaseKanBanRoot }))
);
const BaseCalendarRoot = lazy(() =>
  import("./calendar/base-calendar-root").then((module) => ({ default: module.BaseCalendarRoot }))
);
const BaseSpreadsheetRoot = lazy(() =>
  import("./spreadsheet/base-spreadsheet-root").then((module) => ({ default: module.BaseSpreadsheetRoot }))
);
const BaseGanttRoot = lazy(() =>
  import("./gantt/base-gantt-root").then((module) => ({ default: module.BaseGanttRoot }))
);

type TIssueLayoutRendererProps = {
  activeLayout: EIssueLayoutTypes | undefined;
  workspaceSlug?: string;
  projectId?: string;
  entityId?: string;
};

export const IssueLayoutRenderer = observer(function IssueLayoutRenderer(props: TIssueLayoutRendererProps) {
  const { activeLayout, workspaceSlug, projectId, entityId } = props;
  const policy = useIssueLayoutPolicy({ workspaceSlug, projectId, entityId });
  const shared = {
    QuickActions: policy.QuickActions,
    addIssuesToView: policy.addIssuesToView,
    canEditPropertiesBasedOnProject: policy.canEditPropertiesBasedOnProject,
    isCompletedCycle: policy.isCompletedCycle,
    viewId: policy.viewId,
  };

  if (!activeLayout) return <ActiveLoader layout={activeLayout} />;

  let layoutNode = null;
  switch (activeLayout) {
    case EIssueLayoutTypes.LIST:
      layoutNode = <BaseListRoot {...shared} />;
      break;
    case EIssueLayoutTypes.KANBAN:
      layoutNode = <BaseKanBanRoot {...shared} />;
      break;
    case EIssueLayoutTypes.CALENDAR:
      layoutNode = <BaseCalendarRoot {...shared} />;
      break;
    case EIssueLayoutTypes.SPREADSHEET:
      layoutNode = <BaseSpreadsheetRoot {...shared} />;
      break;
    case EIssueLayoutTypes.GANTT:
      layoutNode = <BaseGanttRoot {...shared} />;
      break;
    default:
      return null;
  }

  return <Suspense fallback={<ActiveLoader layout={activeLayout} />}>{layoutNode}</Suspense>;
});
