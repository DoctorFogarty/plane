/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { EPillSize, Pill } from "@plane/propel/pill";
import { getLuminance, hexToRgb } from "@plane/utils";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";

const HEX_COLOR_RE = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
const LUMINANCE_TEXT_THRESHOLD = 0.55;

export const GANTT_STATE_CHIP_LIGHT_FOREGROUND = "#ffffff";
export const GANTT_STATE_CHIP_DARK_FOREGROUND = "#0d0d0d";
export const GANTT_STATE_CHIP_FALLBACK_BACKGROUND = "#60646C";

type TGanttStateChipColors = {
  backgroundColor: string;
  color: string;
};

export function getGanttStateChipColors(color: string | null | undefined): TGanttStateChipColors {
  if (!color) {
    return {
      backgroundColor: GANTT_STATE_CHIP_FALLBACK_BACKGROUND,
      color: GANTT_STATE_CHIP_LIGHT_FOREGROUND,
    };
  }

  const trimmed = color.trim();
  if (!HEX_COLOR_RE.test(trimmed)) {
    return {
      backgroundColor: GANTT_STATE_CHIP_FALLBACK_BACKGROUND,
      color: GANTT_STATE_CHIP_LIGHT_FOREGROUND,
    };
  }

  const backgroundColor = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return {
    backgroundColor,
    color:
      getLuminance(hexToRgb(trimmed)) > LUMINANCE_TEXT_THRESHOLD
        ? GANTT_STATE_CHIP_DARK_FOREGROUND
        : GANTT_STATE_CHIP_LIGHT_FOREGROUND,
  };
}

type TGanttStateChipProps = {
  name: string;
  color: string | null | undefined;
};

export function GanttStateChip(props: TGanttStateChipProps) {
  const { name, color } = props;
  const chipColors = getGanttStateChipColors(color);

  return (
    <Pill size={EPillSize.XS} className="max-w-24 shrink-0 truncate border-0" style={chipColors}>
      {name}
    </Pill>
  );
}

type TIssueGanttSidebarStateChipProps = {
  issueId: string;
};

export const IssueGanttSidebarStateChip = observer(function IssueGanttSidebarStateChip(
  props: TIssueGanttSidebarStateChipProps
) {
  const { issueId } = props;
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();

  const issue = getIssueById(issueId);
  if (!issue?.state_id) return null;

  const state = getStateById(issue.state_id);
  return state ? <GanttStateChip name={state.name} color={state.color} /> : null;
});
