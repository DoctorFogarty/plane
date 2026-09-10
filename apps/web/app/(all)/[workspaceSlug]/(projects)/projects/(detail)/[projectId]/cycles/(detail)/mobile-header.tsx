/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EIssueFilterType, ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CalendarLayoutIcon, BoardLayoutIcon, ListLayoutIcon, ChevronDownIcon } from "@plane/propel/icons";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
import { CustomMenu } from "@plane/ui";
// components
import { WorkItemsModal } from "@/components/analytics/work-items/modal";
import { DisplayFiltersSelection, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";
import { useCollectionLayoutSelection } from "@/components/issues/issue-layouts/use-collection-layout-route";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";

const SUPPORTED_LAYOUTS = [
  { key: EIssueLayoutTypes.LIST, titleTranslationKey: "issue.layouts.list", icon: ListLayoutIcon },
  { key: EIssueLayoutTypes.KANBAN, titleTranslationKey: "issue.layouts.kanban", icon: BoardLayoutIcon },
  { key: EIssueLayoutTypes.CALENDAR, titleTranslationKey: "issue.layouts.calendar", icon: CalendarLayoutIcon },
];

export const CycleIssuesMobileHeader = observer(function CycleIssuesMobileHeader() {
  // router
  const { workspaceSlug, projectId, cycleId } = useParams();
  // states
  const [analyticsModal, setAnalyticsModal] = useState(false);
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { currentProjectDetails } = useProject();
  const { getCycleById } = useCycle();
  const {
    issuesFilter,
    issuesFilter: { updateFilters },
  } = useIssues(EIssuesStoreType.CYCLE);
  // derived values
  const cycleIdStr = cycleId?.toString();
  const issueFilters = cycleIdStr ? issuesFilter.getIssueFilters(cycleIdStr) : undefined;
  const { activeLayout, handleLayoutChange } = useCollectionLayoutSelection({
    kind: "cycles",
    entityId: cycleIdStr,
    storedLayout: issueFilters?.displayFilters?.layout,
  });
  const cycleDetails = cycleId ? getCycleById(cycleId.toString()) : undefined;

  const handleDisplayFilters = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (!workspaceSlug || !projectId || !cycleId) return;
      updateFilters(
        workspaceSlug.toString(),
        projectId.toString(),
        EIssueFilterType.DISPLAY_FILTERS,
        updatedDisplayFilter,
        cycleId.toString()
      );
    },
    [workspaceSlug, projectId, cycleId, updateFilters]
  );

  const handleDisplayProperties = useCallback(
    (property: Partial<IIssueDisplayProperties>) => {
      if (!workspaceSlug || !projectId || !cycleId) return;
      updateFilters(
        workspaceSlug.toString(),
        projectId.toString(),
        EIssueFilterType.DISPLAY_PROPERTIES,
        property,
        cycleId.toString()
      );
    },
    [workspaceSlug, projectId, cycleId, updateFilters]
  );

  return (
    <>
      <WorkItemsModal
        projectDetails={currentProjectDetails}
        isOpen={analyticsModal}
        onClose={() => setAnalyticsModal(false)}
        cycleDetails={cycleDetails ?? undefined}
      />
      <div className="flex justify-evenly border-b border-subtle bg-surface-1 py-2 md:hidden">
        <CustomMenu
          maxHeight={"md"}
          className="flex flex-grow justify-center text-13 text-secondary"
          placement="bottom-start"
          customButton={
            <span className="flex flex-grow justify-center text-13 text-secondary">{t("common.layout")}</span>
          }
          customButtonClassName="flex flex-grow justify-center text-secondary text-13"
          closeOnSelect
        >
          {SUPPORTED_LAYOUTS.map((layout) => (
            <CustomMenu.MenuItem
              key={layout.key}
              onClick={() => {
                handleLayoutChange(layout.key);
              }}
              className="flex items-center gap-2"
            >
              <IssueLayoutIcon layout={layout.key} className="h-3 w-3" />
              <div className="text-tertiary">{t(layout.titleTranslationKey)}</div>
            </CustomMenu.MenuItem>
          ))}
        </CustomMenu>
        <div className="flex flex-grow items-center justify-center border-l border-subtle text-13 text-secondary">
          <FiltersDropdown
            title={t("common.display")}
            placement="bottom-end"
            menuButton={
              <span className="flex items-center text-13 text-secondary">
                {t("common.display")}
                <ChevronDownIcon className="ml-2 h-4 w-4 text-secondary" />
              </span>
            }
          >
            <DisplayFiltersSelection
              layoutDisplayFiltersOptions={
                activeLayout ? ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.layoutOptions[activeLayout] : undefined
              }
              displayFilters={issueFilters?.displayFilters ?? {}}
              handleDisplayFiltersUpdate={handleDisplayFilters}
              displayProperties={issueFilters?.displayProperties ?? {}}
              handleDisplayPropertiesUpdate={handleDisplayProperties}
              projectId={projectId?.toString()}
              ignoreGroupedFilters={["cycle"]}
              cycleViewDisabled={!currentProjectDetails?.cycle_view}
              moduleViewDisabled={!currentProjectDetails?.module_view}
            />
          </FiltersDropdown>
        </div>

        <button
          type="button"
          onClick={() => setAnalyticsModal(true)}
          className="flex flex-grow justify-center border-l border-subtle text-13 text-secondary"
        >
          {t("common.analytics")}
        </button>
      </div>
    </>
  );
});
