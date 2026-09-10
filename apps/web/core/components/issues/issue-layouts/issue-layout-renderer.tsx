/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { EIssueLayoutTypes } from "@plane/types";
import { ActiveLoader } from "./issue-layout-HOC";
import { useIssueLayoutPolicy } from "./issue-layout-policy";
import { BaseCalendarRoot } from "./calendar/base-calendar-root";
import { BaseGanttRoot } from "./gantt/base-gantt-root";
import { BaseKanBanRoot } from "./kanban/base-kanban-root";
import { BaseListRoot } from "./list/base-list-root";
import { BaseSpreadsheetRoot } from "./spreadsheet/base-spreadsheet-root";

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

  switch (activeLayout) {
    case EIssueLayoutTypes.LIST:
      return <BaseListRoot {...shared} />;
    case EIssueLayoutTypes.KANBAN:
      return <BaseKanBanRoot {...shared} />;
    case EIssueLayoutTypes.CALENDAR:
      return <BaseCalendarRoot {...shared} />;
    case EIssueLayoutTypes.SPREADSHEET:
      return <BaseSpreadsheetRoot {...shared} />;
    case EIssueLayoutTypes.GANTT:
      return <BaseGanttRoot {...shared} />;
    default:
      return <ActiveLoader layout={activeLayout} />;
  }
});
