/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { PanelLeft } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { IntakeIcon } from "@plane/propel/icons";
import { EInboxIssueCurrentTab } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { InboxContentRoot } from "@/components/inbox/content";
import { InboxSidebar } from "@/components/inbox/sidebar";
import { InboxLayoutLoader } from "@/components/ui/loader/layouts/project-inbox/inbox-layout-loader";
// hooks
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProjectInbox } from "@/hooks/store/use-project-inbox";

type TInboxIssueRoot = {
  workspaceSlug: string;
  projectId: string;
  inboxIssueId: string | undefined;
  inboxAccessible: boolean;
  navigationTab?: EInboxIssueCurrentTab | undefined;
};

export const InboxIssueRoot = observer(function InboxIssueRoot(props: TInboxIssueRoot) {
  const { workspaceSlug, projectId, inboxIssueId, inboxAccessible, navigationTab } = props;
  // states
  const [isMobileSidebar, setIsMobileSidebar] = useState(true);
  // plane hooks
  const { t } = useTranslation();
  // hooks
  const { loader, error, currentTab, currentInboxProjectId, handleCurrentTab, fetchInboxIssues } = useProjectInbox();
  const issueTypeStore = useIssueType();
  const currentTabRef = useRef(currentTab);
  currentTabRef.current = currentTab;
  const currentInboxProjectIdRef = useRef(currentInboxProjectId);
  currentInboxProjectIdRef.current = currentInboxProjectId;
  const navigationTabRef = useRef(navigationTab);
  navigationTabRef.current = navigationTab;
  const handleCurrentTabRef = useRef(handleCurrentTab);
  handleCurrentTabRef.current = handleCurrentTab;
  const fetchInboxIssuesRef = useRef(fetchInboxIssues);
  fetchInboxIssuesRef.current = fetchInboxIssues;
  const issueTypeStoreRef = useRef(issueTypeStore);
  issueTypeStoreRef.current = issueTypeStore;

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    void issueTypeStoreRef.current.fetchWorkItemTypesPropertiesAndOptions(
      workspaceSlug.toString(),
      projectId.toString()
    );
    if (!inboxAccessible) return;
    // Check if project has changed
    const hasProjectChanged = currentInboxProjectIdRef.current && currentInboxProjectIdRef.current !== projectId;

    if (navigationTabRef.current && navigationTabRef.current !== currentTabRef.current) {
      handleCurrentTabRef.current(workspaceSlug, projectId, navigationTabRef.current);
    } else if (hasProjectChanged) {
      handleCurrentTabRef.current(workspaceSlug, projectId, EInboxIssueCurrentTab.OPEN);
    } else {
      fetchInboxIssuesRef.current(
        workspaceSlug.toString(),
        projectId.toString(),
        undefined,
        navigationTabRef.current || EInboxIssueCurrentTab.OPEN
      );
    }
  }, [inboxAccessible, workspaceSlug, projectId]);

  // loader
  if (loader === "init-loading")
    return (
      <div className="relative flex h-full w-full flex-col">
        <InboxLayoutLoader />
      </div>
    );

  // error
  if (error && error?.status === "init-error")
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-3">
        <IntakeIcon className="size-[60px]" strokeWidth={1.5} />
        <div className="text-secondary">{error?.message}</div>
      </div>
    );

  return (
    <>
      {!inboxIssueId && (
        <div className="flex h-12 w-full items-center border-b border-subtle px-4 lg:hidden">
          <button type="button" onClick={() => setIsMobileSidebar(!isMobileSidebar)} aria-label="Toggle sidebar">
            <PanelLeft className={cn("h-4 w-4", isMobileSidebar ? "text-accent-primary" : "text-secondary")} />
          </button>
        </div>
      )}
      <div className="flex h-full w-full overflow-hidden bg-surface-1">
        <div
          className={cn(
            "absolute top-[50px] bottom-0 z-10 w-full flex-shrink-0 bg-surface-1 transition-all lg:!relative lg:!top-0 lg:w-2/6",
            isMobileSidebar ? "translate-x-0" : "-translate-x-full lg:!translate-x-0"
          )}
        >
          <InboxSidebar
            setIsMobileSidebar={setIsMobileSidebar}
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
            inboxIssueId={inboxIssueId}
          />
        </div>

        {inboxIssueId ? (
          <InboxContentRoot
            setIsMobileSidebar={setIsMobileSidebar}
            isMobileSidebar={isMobileSidebar}
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
            inboxIssueId={inboxIssueId.toString()}
          />
        ) : (
          <EmptyStateCompact
            assetKey="intake"
            title={t("project_empty_state.intake_main.title")}
            assetClassName="size-20"
          />
        )}
      </div>
    </>
  );
});
