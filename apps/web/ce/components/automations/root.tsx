/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useAutomation } from "@/hooks/store/use-automation";
import { CustomAutomationsList } from "./list";

export type TCustomAutomationsRootProps = {
  projectId: string;
  workspaceSlug: string;
};

export const CustomAutomationsRoot = observer(function CustomAutomationsRoot(props: TCustomAutomationsRootProps) {
  const { projectId, workspaceSlug } = props;
  const { fetchAutomations } = useAutomation();

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    void fetchAutomations(workspaceSlug, projectId);
  }, [fetchAutomations, projectId, workspaceSlug]);

  return <CustomAutomationsList workspaceSlug={workspaceSlug} projectId={projectId} />;
});
