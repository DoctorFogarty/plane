/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";

export type TWorkflowDisabledOverlayProps = {
  messageContainerRef: React.RefObject<HTMLDivElement>;
  workflowDisabledSource: string;
  shouldOverlayBeVisible: boolean;
};

export const WorkFlowDisabledOverlay = observer(function WorkFlowDisabledOverlay(
  _props: TWorkflowDisabledOverlayProps
) {
  return <></>;
});
