/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense } from "react";
import { observer } from "mobx-react";
import type { IWorkItemPeekOverview } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { IssuePeekOverviewLoader } from "./loader";

const IssuePeekOverviewContent = lazy(() => import("./root").then((module) => ({ default: module.IssuePeekOverview })));

function PeekSuspenseFallback() {
  return (
    <div className="absolute top-0 right-0 bottom-0 z-[25] flex w-full flex-col overflow-hidden border-l border-subtle bg-surface-1 md:w-1/2">
      <IssuePeekOverviewLoader removeRoutePeekId={() => undefined} />
    </div>
  );
}

export const IssuePeekOverview = observer(function IssuePeekOverview(props: IWorkItemPeekOverview) {
  const { embedIssue = false } = props;
  const { peekIssue } = useIssueDetail();
  const { peekIssue: epicPeekIssue } = useIssueDetail(EIssueServiceType.EPICS);

  if (!embedIssue && !peekIssue?.issueId && !epicPeekIssue?.issueId) return null;

  return (
    <Suspense
      fallback={embedIssue ? <IssuePeekOverviewLoader removeRoutePeekId={() => undefined} /> : <PeekSuspenseFallback />}
    >
      <IssuePeekOverviewContent {...props} />
    </Suspense>
  );
});
