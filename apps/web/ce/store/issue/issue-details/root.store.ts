/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { makeObservable, override } from "mobx";
import type { TIssueServiceType } from "@plane/types";
import { connectCodeModalStore } from "@/plane-web/store/connect-code-modal.store";
import type { IIssueDetail as IIssueDetailCore } from "@/store/issue/issue-details/root.store";
import { IssueDetail as IssueDetailCore } from "@/store/issue/issue-details/root.store";
import type { IIssueRootStore } from "@/store/issue/root.store";

export type IIssueDetail = IIssueDetailCore;

export class IssueDetail extends IssueDetailCore {
  constructor(rootStore: IIssueRootStore, serviceType: TIssueServiceType) {
    super(rootStore, serviceType);
    makeObservable(this, {
      isAnyModalOpen: override,
    });
  }

  override get isAnyModalOpen(): boolean {
    const isConnectCodeOpenForPeek =
      connectCodeModalStore.isOpen && connectCodeModalStore.workItemId === this.peekIssue?.issueId;

    return super.isAnyModalOpen || isConnectCodeOpenForPeek;
  }
}
