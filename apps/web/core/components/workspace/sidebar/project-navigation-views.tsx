/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Transition } from "@headlessui/react";
import { observer } from "mobx-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { ChevronRightIcon, ViewsIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { EIssueLayoutTypes } from "@plane/types";
import { cn, getViewName } from "@plane/utils";
// components
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { useProjectView } from "@/hooks/store/use-project-view";
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  workspaceSlug: string;
  projectId: string;
  onNavigate: () => void;
};

function isViewsListPath(pathname: string, viewsListHref: string): boolean {
  return pathname === viewsListHref || pathname === `${viewsListHref}/`;
}

function isViewDetailPath(pathname: string, viewsListHref: string): boolean {
  return pathname.startsWith(`${viewsListHref}/`) && pathname.length > viewsListHref.length + 1;
}

function resolveViewLayout(layout: unknown): EIssueLayoutTypes | null {
  if (typeof layout === "string" && (Object.values(EIssueLayoutTypes) as string[]).includes(layout)) {
    return layout as EIssueLayoutTypes;
  }
  return null;
}

export const ProjectNavigationViews = observer(function ProjectNavigationViews(props: Props) {
  const { workspaceSlug, projectId, onNavigate } = props;
  const { t } = useTranslation();
  const pathname = usePathname();
  const { isMobile } = usePlatformOS();
  const { getProjectViews, fetchViews, fetchedMap } = useProjectView();

  const viewsListHref = `/${workspaceSlug}/projects/${projectId}/views`;
  const isListActive = isViewsListPath(pathname, viewsListHref);
  const isDetailActive = isViewDetailPath(pathname, viewsListHref);

  const [isOpen, setIsOpen] = useState(isDetailActive);
  const [wasDetailActive, setWasDetailActive] = useState(isDetailActive);
  if (isDetailActive !== wasDetailActive) {
    setWasDetailActive(isDetailActive);
    if (isDetailActive) setIsOpen(true);
  }

  const views = getProjectViews(projectId);
  const hasViews = (views?.length ?? 0) > 0;
  const isFetched = !!fetchedMap[projectId];

  // Fetch when this nav mounts (project accordion open) or when data is not yet warm
  useEffect(() => {
    if (!isFetched) {
      void fetchViews(workspaceSlug, projectId);
    }
  }, [isFetched, projectId, workspaceSlug, fetchViews]);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="group/views-nav relative flex items-center">
        <Link href={viewsListHref} onClick={onNavigate} className="min-w-0 flex-1">
          <SidebarNavItem isActive={isListActive}>
            <div className="flex w-full items-center justify-between gap-1.5 py-[1px] pr-5">
              <div className="flex items-center gap-1.5">
                <ViewsIcon className="size-4 flex-shrink-0 stroke-[1.5]" />
                <span className="text-11 font-medium">{t("sidebar.views")}</span>
              </div>
            </div>
          </SidebarNavItem>
        </Link>
        {hasViews && (
          <IconButton
            variant="ghost"
            size="sm"
            icon={ChevronRightIcon}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen((prev) => !prev);
            }}
            className={cn("absolute right-0.5 hidden text-placeholder group-hover/views-nav:inline-flex", {
              "inline-flex": isOpen,
            })}
            iconClassName={cn("transition-transform", {
              "rotate-90": isOpen,
            })}
            aria-label={t(
              isOpen ? "aria_labels.projects_sidebar.close_views_menu" : "aria_labels.projects_sidebar.open_views_menu"
            )}
            aria-expanded={isOpen}
          />
        )}
      </div>
      <Transition
        show={isOpen && hasViews}
        enter="transition duration-100 ease-out"
        enterFrom="transform scale-95 opacity-0"
        enterTo="transform scale-100 opacity-100"
        leave="transition duration-75 ease-out"
        leaveFrom="transform scale-100 opacity-100"
        leaveTo="transform scale-95 opacity-0"
      >
        <div className="relative mt-0.5 mb-0.5 flex flex-col gap-0.5 pl-4">
          <div className="absolute top-0 bottom-1 left-[11px] w-px bg-layer-3" />
          {views?.map((view) => {
            const href = `${viewsListHref}/${view.id}`;
            const isActive = pathname.includes(href);
            const layout = resolveViewLayout(view.display_filters?.layout);
            const name = getViewName(view.name);

            return (
              <Link key={view.id} href={href} onClick={onNavigate}>
                <SidebarNavItem isActive={isActive}>
                  <div className="flex w-full min-w-0 items-center gap-1.5 py-[1px]">
                    {layout ? (
                      <IssueLayoutIcon layout={layout} className="size-4 flex-shrink-0 stroke-[1.5]" />
                    ) : (
                      <ViewsIcon className="size-4 flex-shrink-0 stroke-[1.5]" />
                    )}
                    <Tooltip tooltipContent={name} isMobile={isMobile} position="right">
                      <span className="truncate text-11 font-medium">{name}</span>
                    </Tooltip>
                  </div>
                </SidebarNavItem>
              </Link>
            );
          })}
        </div>
      </Transition>
    </div>
  );
});
