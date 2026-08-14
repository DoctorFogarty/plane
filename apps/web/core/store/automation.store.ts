/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { IAutomation, IAutomationRun } from "@plane/types";
import { ProjectAutomationService } from "@/services/project/project-automation.service";
import type { CoreRootStore } from "./root.store";

export interface IAutomationStore {
  automations: Record<string, IAutomation>;
  runs: Record<string, IAutomationRun[]>;
  loader: boolean;
  getProjectAutomations: (projectId: string) => IAutomation[];
  fetchAutomations: (workspaceSlug: string, projectId: string) => Promise<IAutomation[]>;
  fetchAutomationById: (workspaceSlug: string, projectId: string, automationId: string) => Promise<IAutomation>;
  createAutomation: (workspaceSlug: string, projectId: string, data: Partial<IAutomation>) => Promise<IAutomation>;
  updateAutomation: (
    workspaceSlug: string,
    projectId: string,
    automationId: string,
    data: Partial<IAutomation>
  ) => Promise<IAutomation>;
  deleteAutomation: (workspaceSlug: string, projectId: string, automationId: string) => Promise<void>;
  fetchRuns: (workspaceSlug: string, projectId: string, automationId: string) => Promise<IAutomationRun[]>;
}

export class AutomationStore implements IAutomationStore {
  automations: Record<string, IAutomation> = {};
  runs: Record<string, IAutomationRun[]> = {};
  loader = false;
  service: ProjectAutomationService;
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      automations: observable,
      runs: observable,
      loader: observable.ref,
      fetchAutomations: action,
      fetchAutomationById: action,
      createAutomation: action,
      updateAutomation: action,
      deleteAutomation: action,
      fetchRuns: action,
    });
    this.rootStore = _rootStore;
    this.service = new ProjectAutomationService();
  }

  getProjectAutomations = computedFn((projectId: string) =>
    Object.values(this.automations).filter((automation) => automation?.project === projectId)
  );

  fetchAutomations = async (workspaceSlug: string, projectId: string) => {
    this.loader = true;
    const response = await this.service.list(workspaceSlug, projectId);
    runInAction(() => {
      const next = { ...this.automations };
      Object.values(next).forEach((automation) => {
        if (automation.project === projectId) {
          delete next[automation.id];
        }
      });
      response.forEach((automation) => {
        if (automation.id) {
          next[automation.id] = { ...automation, project: automation.project || projectId };
        }
      });
      this.automations = next;
      this.loader = false;
    });
    return response;
  };

  fetchAutomationById = async (workspaceSlug: string, projectId: string, automationId: string) => {
    const response = await this.service.retrieve(workspaceSlug, projectId, automationId);
    runInAction(() => {
      this.automations[automationId] = { ...response, project: response.project || projectId };
    });
    return response;
  };

  createAutomation = async (workspaceSlug: string, projectId: string, data: Partial<IAutomation>) => {
    const response = await this.service.create(workspaceSlug, projectId, data);
    runInAction(() => {
      this.automations[response.id] = { ...response, project: response.project || projectId };
    });
    return response;
  };

  updateAutomation = async (
    workspaceSlug: string,
    projectId: string,
    automationId: string,
    data: Partial<IAutomation>
  ) => {
    const response = await this.service.update(workspaceSlug, projectId, automationId, data);
    runInAction(() => {
      this.automations[automationId] = { ...response, project: response.project || projectId };
    });
    return response;
  };

  deleteAutomation = async (workspaceSlug: string, projectId: string, automationId: string) => {
    await this.service.destroy(workspaceSlug, projectId, automationId);
    runInAction(() => {
      delete this.automations[automationId];
      delete this.runs[automationId];
    });
  };

  fetchRuns = async (workspaceSlug: string, projectId: string, automationId: string) => {
    const response = await this.service.listRuns(workspaceSlug, projectId, automationId);
    runInAction(() => {
      this.runs[automationId] = response;
    });
    return response;
  };
}
