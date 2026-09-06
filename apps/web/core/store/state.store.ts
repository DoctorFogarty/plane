/* eslint-disable unicorn/no-array-sort, unicorn/no-empty-file, promise/always-return, jsx-a11y/no-autofocus, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role, react-hooks/exhaustive-deps, react/no-array-index-key, no-shadow, no-unneeded-ternary, no-unused-expressions, no-useless-constructor */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, groupBy } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { IIntakeState, IState, IStateGroup } from "@plane/types";
// helpers
import { sortStateGroups, sortStates } from "@plane/utils";
// plane web
import { ProjectStateService } from "@/services/project/project-state.service";
import type { RootStore } from "@/plane-web/store/root.store";

export interface IStateStore {
  //Loaders
  fetchedMap: Record<string, boolean>;
  fetchedIntakeMap: Record<string, boolean>;
  fetchedGroupMap: Record<string, boolean>;
  // observables
  stateMap: Record<string, IState>;
  intakeStateMap: Record<string, IIntakeState>;
  groupMap: Record<string, IStateGroup>;
  // computed
  workspaceStates: IState[] | undefined;
  projectStates: IState[] | undefined;
  projectStateGroups: IStateGroup[] | undefined;
  groupedProjectStates: Record<string, IState[]> | undefined;
  // computed actions
  getStateById: (stateId: string | null | undefined) => IState | undefined;
  getIntakeStateById: (intakeStateId: string | null | undefined) => IIntakeState | undefined;
  getGroupById: (groupId: string | null | undefined) => IStateGroup | undefined;
  getProjectStates: (projectId: string | null | undefined) => IState[] | undefined;
  getProjectStateGroups: (projectId: string | null | undefined) => IStateGroup[] | undefined;
  getProjectIntakeState: (projectId: string | null | undefined) => IIntakeState | undefined;
  getProjectStateIds: (projectId: string | null | undefined) => string[] | undefined;
  getProjectIntakeStateIds: (projectId: string | null | undefined) => string[] | undefined;
  getProjectDefaultStateId: (projectId: string | null | undefined) => string | undefined;
  // fetch actions
  fetchProjectStates: (workspaceSlug: string, projectId: string) => Promise<IState[]>;
  fetchProjectStateGroups: (workspaceSlug: string, projectId: string) => Promise<IStateGroup[]>;
  fetchProjectIntakeState: (workspaceSlug: string, projectId: string) => Promise<IIntakeState>;
  fetchWorkspaceStates: (workspaceSlug: string) => Promise<IState[]>;
  // crud actions
  createState: (workspaceSlug: string, projectId: string, data: Partial<IState>) => Promise<IState>;
  updateState: (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    data: Partial<IState>
  ) => Promise<IState | undefined>;
  deleteState: (workspaceSlug: string, projectId: string, stateId: string, fallbackStateId?: string) => Promise<void>;
  markStateAsDefault: (workspaceSlug: string, projectId: string, stateId: string) => Promise<void>;
  moveStatePosition: (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    payload: Partial<IState>
  ) => Promise<void>;
  createGroup: (workspaceSlug: string, projectId: string, data: Partial<IStateGroup>) => Promise<IStateGroup>;
  updateGroup: (
    workspaceSlug: string,
    projectId: string,
    groupId: string,
    data: Partial<IStateGroup>
  ) => Promise<IStateGroup | undefined>;
  deleteGroup: (workspaceSlug: string, projectId: string, groupId: string) => Promise<void>;
  moveGroupPosition: (
    workspaceSlug: string,
    projectId: string,
    groupId: string,
    payload: Partial<IStateGroup>
  ) => Promise<void>;

  getStatePercentageInGroup: (stateId: string | null | undefined) => number | undefined;
}

export class StateStore implements IStateStore {
  stateMap: Record<string, IState> = {};
  intakeStateMap: Record<string, IIntakeState> = {};
  groupMap: Record<string, IStateGroup> = {};
  //loaders
  fetchedMap: Record<string, boolean> = {};
  fetchedIntakeMap: Record<string, boolean> = {};
  fetchedGroupMap: Record<string, boolean> = {};
  rootStore: RootStore;
  router;
  stateService: ProjectStateService;

  constructor(_rootStore: RootStore) {
    makeObservable(this, {
      // observables
      stateMap: observable,
      intakeStateMap: observable,
      groupMap: observable,
      fetchedMap: observable,
      fetchedIntakeMap: observable,
      fetchedGroupMap: observable,
      // computed
      projectStates: computed,
      projectStateGroups: computed,
      groupedProjectStates: computed,
      // fetch action
      fetchProjectStates: action,
      fetchProjectStateGroups: action,
      fetchProjectIntakeState: action,
      // CRUD actions
      createState: action,
      updateState: action,
      deleteState: action,
      createGroup: action,
      updateGroup: action,
      deleteGroup: action,
      // state actions
      markStateAsDefault: action,
      moveStatePosition: action,
      moveGroupPosition: action,
    });
    this.stateService = new ProjectStateService();
    this.router = _rootStore.router;
    this.rootStore = _rootStore;
  }

  get workspaceStates() {
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!workspaceSlug || !this.fetchedMap[workspaceSlug]) return;
    return sortStates(Object.values(this.stateMap), this.groupMap);
  }

  get projectStates() {
    const projectId = this.router.projectId;
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug])) return;
    return sortStates(
      Object.values(this.stateMap).filter((state) => state.project_id === projectId),
      this.groupMap
    );
  }

  get projectStateGroups() {
    const projectId = this.router.projectId;
    if (!projectId || !this.fetchedGroupMap[projectId]) return;
    return sortStateGroups(Object.values(this.groupMap).filter((group) => group.project_id === projectId));
  }

  /**
   * Returns states grouped by workflow group id (falls back to category for legacy states)
   */
  get groupedProjectStates() {
    if (!this.router.projectId) return;

    const groups = this.projectStateGroups;
    const states = this.projectStates || [];

    if (groups && groups.length > 0) {
      const byGroupId = groupBy(
        states.filter((s) => s.group_id),
        "group_id"
      ) as Record<string, IState[]>;
      const result: Record<string, IState[]> = {};
      for (const group of groups) {
        result[group.id] = byGroupId[group.id] || [];
      }
      return result;
    }

    // Legacy fallback: group by category
    return groupBy(states, "group") as Record<string, IState[]>;
  }

  getStateById = computedFn((stateId: string | null | undefined) => {
    if (!this.stateMap || !stateId) return;
    return this.stateMap[stateId] ?? undefined;
  });

  getIntakeStateById = computedFn((intakeStateId: string | null | undefined) => {
    if (!this.intakeStateMap || !intakeStateId) return;
    return this.intakeStateMap[intakeStateId] ?? undefined;
  });

  getGroupById = computedFn((groupId: string | null | undefined) => {
    if (!this.groupMap || !groupId) return;
    return this.groupMap[groupId] ?? undefined;
  });

  getProjectStates = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug])) return;
    return sortStates(
      Object.values(this.stateMap).filter((state) => state.project_id === projectId),
      this.groupMap
    );
  });

  getProjectStateGroups = computedFn((projectId: string | null | undefined) => {
    if (!projectId || !this.fetchedGroupMap[projectId]) return;
    return sortStateGroups(Object.values(this.groupMap).filter((group) => group.project_id === projectId));
  });

  getProjectIntakeState = computedFn((projectId: string | null | undefined) => {
    if (!projectId || !this.fetchedIntakeMap[projectId]) return;
    return Object.values(this.intakeStateMap).find((state) => state.project_id === projectId);
  });

  getProjectStateIds = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug;
    if (!workspaceSlug || !projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug]))
      return undefined;
    const projectStates = this.getProjectStates(projectId);
    return projectStates?.map((state) => state.id) ?? [];
  });

  getProjectIntakeStateIds = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug;
    if (!workspaceSlug || !projectId || !this.fetchedIntakeMap[projectId]) return undefined;
    const projectIntakeState = this.getProjectIntakeState(projectId);
    return projectIntakeState?.id ? [projectIntakeState.id] : [];
  });

  getProjectDefaultStateId = computedFn((projectId: string | null | undefined) => {
    const projectStates = this.getProjectStates(projectId);
    return projectStates?.find((state) => state.default)?.id;
  });

  fetchProjectStates = async (workspaceSlug: string, projectId: string) => {
    const [statesResponse] = await Promise.all([
      this.stateService.getStates(workspaceSlug, projectId),
      this.fetchProjectStateGroups(workspaceSlug, projectId),
    ]);
    runInAction(() => {
      statesResponse.forEach((state) => {
        set(this.stateMap, [state.id], state);
      });
      set(this.fetchedMap, projectId, true);
    });
    return statesResponse;
  };

  fetchProjectStateGroups = async (workspaceSlug: string, projectId: string) => {
    const groupsResponse = await this.stateService.getStateGroups(workspaceSlug, projectId);
    runInAction(() => {
      groupsResponse.forEach((group) => {
        set(this.groupMap, [group.id], group);
      });
      set(this.fetchedGroupMap, projectId, true);
    });
    return groupsResponse;
  };

  fetchProjectIntakeState = async (workspaceSlug: string, projectId: string) => {
    const intakeStateResponse = await this.stateService.getIntakeState(workspaceSlug, projectId);
    runInAction(() => {
      set(this.intakeStateMap, [intakeStateResponse.id], intakeStateResponse);
      set(this.fetchedIntakeMap, projectId, true);
    });
    return intakeStateResponse;
  };

  fetchWorkspaceStates = async (workspaceSlug: string) => {
    const statesResponse = await this.stateService.getWorkspaceStates(workspaceSlug);
    runInAction(() => {
      statesResponse.forEach((state) => {
        set(this.stateMap, [state.id], state);
      });
      set(this.fetchedMap, workspaceSlug, true);
    });
    return statesResponse;
  };

  createState = async (workspaceSlug: string, projectId: string, data: Partial<IState>) =>
    await this.stateService.createState(workspaceSlug, projectId, data).then((response) => {
      runInAction(() => {
        set(this.stateMap, [response?.id], response);
      });
      return response;
    });

  updateState = async (workspaceSlug: string, projectId: string, stateId: string, data: Partial<IState>) => {
    const originalState = this.stateMap[stateId];
    try {
      runInAction(() => {
        set(this.stateMap, [stateId], { ...this.stateMap?.[stateId], ...data });
      });
      const response = await this.stateService.patchState(workspaceSlug, projectId, stateId, data);
      runInAction(() => {
        if (response) set(this.stateMap, [stateId], response);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.stateMap = {
          ...this.stateMap,
          [stateId]: originalState,
        };
      });
      throw error;
    }
  };

  deleteState = async (workspaceSlug: string, projectId: string, stateId: string, fallbackStateId?: string) => {
    if (!this.stateMap?.[stateId]) return;
    await this.stateService.deleteState(workspaceSlug, projectId, stateId, fallbackStateId).then(() => {
      runInAction(() => {
        delete this.stateMap[stateId];
      });
    });
  };

  markStateAsDefault = async (workspaceSlug: string, projectId: string, stateId: string) => {
    const originalStates = this.stateMap;
    const currentDefaultState = Object.values(this.stateMap).find(
      (state) => state.project_id === projectId && state.default
    );
    try {
      runInAction(() => {
        if (currentDefaultState) set(this.stateMap, [currentDefaultState.id, "default"], false);
        set(this.stateMap, [stateId, "default"], true);
      });
      await this.stateService.markDefault(workspaceSlug, projectId, stateId);
    } catch (error) {
      runInAction(() => {
        this.stateMap = originalStates;
      });
      throw error;
    }
  };

  moveStatePosition = async (workspaceSlug: string, projectId: string, stateId: string, payload: Partial<IState>) => {
    const originalStates = this.stateMap;
    try {
      Object.entries(payload).forEach(([key, value]) => {
        runInAction(() => {
          set(this.stateMap, [stateId, key], value);
        });
      });
      await this.stateService.patchState(workspaceSlug, projectId, stateId, payload);
    } catch {
      runInAction(() => {
        this.stateMap = originalStates;
      });
    }
  };

  createGroup = async (workspaceSlug: string, projectId: string, data: Partial<IStateGroup>) =>
    await this.stateService.createStateGroup(workspaceSlug, projectId, data).then((response) => {
      runInAction(() => {
        set(this.groupMap, [response.id], response);
      });
      return response;
    });

  updateGroup = async (workspaceSlug: string, projectId: string, groupId: string, data: Partial<IStateGroup>) => {
    const originalGroup = this.groupMap[groupId];
    try {
      runInAction(() => {
        set(this.groupMap, [groupId], { ...this.groupMap[groupId], ...data });
      });
      const response = await this.stateService.patchStateGroup(workspaceSlug, projectId, groupId, data);
      runInAction(() => {
        if (response) set(this.groupMap, [groupId], response);
        // Sync category on states if category changed
        if (data.category) {
          Object.values(this.stateMap).forEach((state) => {
            if (state.group_id === groupId) {
              set(this.stateMap, [state.id, "group"], data.category);
            }
          });
        }
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.groupMap = { ...this.groupMap, [groupId]: originalGroup };
      });
      throw error;
    }
  };

  deleteGroup = async (workspaceSlug: string, projectId: string, groupId: string) => {
    if (!this.groupMap[groupId]) return;
    const original = this.groupMap[groupId];
    try {
      runInAction(() => {
        delete this.groupMap[groupId];
      });
      await this.stateService.deleteStateGroup(workspaceSlug, projectId, groupId);
    } catch (error) {
      runInAction(() => {
        set(this.groupMap, [groupId], original);
      });
      throw error;
    }
  };

  moveGroupPosition = async (
    workspaceSlug: string,
    projectId: string,
    groupId: string,
    payload: Partial<IStateGroup>
  ) => {
    const originalGroups = { ...this.groupMap };
    try {
      Object.entries(payload).forEach(([key, value]) => {
        runInAction(() => {
          set(this.groupMap, [groupId, key], value);
        });
      });
      await this.stateService.patchStateGroup(workspaceSlug, projectId, groupId, payload);
    } catch {
      runInAction(() => {
        this.groupMap = originalGroups;
      });
    }
  };

  getStatePercentageInGroup = computedFn((stateId: string | null | undefined) => {
    if (!stateId || !this.stateMap[stateId]) return -1;

    const state = this.stateMap[stateId];
    const groupKey = state.group_id || state.group;

    if (!groupKey || !this.groupedProjectStates || !this.groupedProjectStates[groupKey]) return -1;

    const statesInGroup = this.groupedProjectStates[groupKey];
    const stateIndex = statesInGroup.findIndex((s) => s.id === stateId);

    if (stateIndex === -1) return undefined;

    return ((stateIndex + 1) / statesInGroup.length) * 100;
  });
}
