/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IState, IStateGroup, TStateGroups } from "@plane/types";

export type TStateDeleteDisabledReason = "default";

export function getStateDeleteDisabledReason(state: Pick<IState, "default">): TStateDeleteDisabledReason | null {
  if (state.default) return "default";
  return null;
}

export function isStateDeleteDisabled(state: Pick<IState, "default">): boolean {
  return getStateDeleteDisabledReason(state) !== null;
}

export function deleteDisabledTooltipKey(
  _reason: TStateDeleteDisabledReason
): "project_settings.states.delete.cannot_delete_default" {
  return "project_settings.states.delete.cannot_delete_default";
}

export function getFallbackStateOptions(states: IState[], stateToDeleteId: string): IState[] {
  return states.filter((state) => state.id !== stateToDeleteId);
}

export function getDefaultFallbackStateId(states: IState[], stateToDelete: IState): string | undefined {
  const others = getFallbackStateOptions(states, stateToDelete.id);
  if (others.length === 0) return undefined;

  const sameGroup = others.find((state) =>
    state.group_id && stateToDelete.group_id
      ? state.group_id === stateToDelete.group_id
      : state.group === stateToDelete.group
  );
  if (sameGroup) return sameGroup.id;

  const projectDefault = others.find((state) => state.default);
  if (projectDefault) return projectDefault.id;

  return others[0]?.id;
}

export function sortStatesBySequence(states: IState[]): IState[] {
  return states.toSorted((a, b) => a.sequence - b.sequence);
}

export function getFirstGroupIdForCategory(groups: IStateGroup[], category: TStateGroups): string | undefined {
  return groups.find((group) => group.category === category)?.id;
}
