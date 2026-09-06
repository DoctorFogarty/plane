/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TStateGroups = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

export interface IStateGroup {
  readonly id: string;
  name: string;
  description?: string;
  color: string;
  sequence: number;
  category: TStateGroups;
  is_system: boolean;
  project_id: string;
  workspace_id: string;
}

export interface IState {
  readonly id: string;
  color: string;
  default: boolean;
  description: string;
  /** Behavioral category (backlog | unstarted | …) */
  group: TStateGroups;
  /** Project-scoped display group id */
  group_id?: string | null;
  name: string;
  project_id: string;
  sequence: number;
  workspace_id: string;
  order: number;
}

export interface IStateLite {
  color: string;
  group: TStateGroups;
  group_id?: string | null;
  id: string;
  name: string;
}

export interface IStateResponse {
  [key: string]: IState[];
}

export type TStateOperationsCallbacks = {
  createState: (data: Partial<IState>) => Promise<IState>;
  updateState: (stateId: string, data: Partial<IState>) => Promise<IState | undefined>;
  deleteState: (stateId: string, fallbackStateId?: string) => Promise<void>;
  moveStatePosition: (stateId: string, data: Partial<IState>) => Promise<void>;
  markStateAsDefault: (stateId: string) => Promise<void>;
  createGroup?: (data: Partial<IStateGroup>) => Promise<IStateGroup>;
  updateGroup?: (groupId: string, data: Partial<IStateGroup>) => Promise<IStateGroup | undefined>;
  deleteGroup?: (groupId: string) => Promise<void>;
  moveGroupPosition?: (groupId: string, data: Partial<IStateGroup>) => Promise<void>;
};

export type TStateGroupOperationsCallbacks = {
  createGroup: (data: Partial<IStateGroup>) => Promise<IStateGroup>;
  updateGroup: (groupId: string, data: Partial<IStateGroup>) => Promise<IStateGroup | undefined>;
  deleteGroup: (groupId: string) => Promise<void>;
  moveGroupPosition: (groupId: string, data: Partial<IStateGroup>) => Promise<void>;
};
