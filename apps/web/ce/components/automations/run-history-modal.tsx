/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import type { IAutomation, IAutomationRun } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useAutomation } from "@/hooks/store/use-automation";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  automation: IAutomation | null;
};

export const AutomationRunHistoryModal = observer(function AutomationRunHistoryModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, automation } = props;
  const { fetchRuns, runs } = useAutomation();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !automation) return;
    setLoading(true);
    void fetchRuns(workspaceSlug, projectId, automation.id).finally(() => setLoading(false));
  }, [automation, fetchRuns, isOpen, projectId, workspaceSlug]);

  const history: IAutomationRun[] = automation ? runs[automation.id] || [] : [];

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Run history{automation ? ` — ${automation.name}` : ""}</h3>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-custom-text-300">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-custom-text-300">No runs yet.</p>
        ) : (
          <div className="max-h-[28rem] space-y-2 overflow-y-auto">
            {history.map((run) => (
              <div key={run.id} className="border-custom-border-200 text-sm rounded border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium capitalize">{run.status}</span>
                  <span className="text-custom-text-300">{new Date(run.started_at).toLocaleString()}</span>
                </div>
                <div className="text-custom-text-200 mt-1">{run.trigger_type}</div>
                {run.error ? <div className="text-red-500 mt-1">{run.error}</div> : null}
                {run.steps?.length ? (
                  <ul className="text-custom-text-300 mt-2 list-disc pl-5">
                    {run.steps.map((step) => (
                      <li key={step.id}>
                        {step.action_type}: {step.status}
                        {step.error ? ` — ${step.error}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalCore>
  );
});
