/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { TIssueProperty, TIssuePropertyOption, TIssuePropertyValuesMap, TIssueType } from "@plane/types";
import { IssueTypeService } from "@/services/issue/issue_type.service";
import type { CoreRootStore } from "./root.store";

export interface IIssueTypeStore {
  fetchedMap: Record<string, boolean>;
  enabledMap: Record<string, boolean>;
  typeMap: Record<string, TIssueType>;
  propertyValuesMap: Record<string, TIssuePropertyValuesMap>;
  getProjectIssueTypes: (projectId: string | undefined | null) => TIssueType[];
  getActiveProjectIssueTypes: (projectId: string | undefined | null) => TIssueType[];
  getDefaultIssueTypeId: (projectId: string | undefined | null) => string | null;
  getIssueTypeById: (typeId: string | undefined | null) => TIssueType | undefined;
  getPropertiesForType: (typeId: string | undefined | null) => TIssueProperty[];
  getActivePropertiesForType: (typeId: string | undefined | null) => TIssueProperty[];
  getPropertyValues: (issueId: string | undefined | null) => TIssuePropertyValuesMap;
  isIssueTypeEnabled: (projectId: string | undefined | null) => boolean;
  fetchWorkItemTypesPropertiesAndOptions: (workspaceSlug: string, projectId: string) => Promise<TIssueType[]>;
  enableIssueTypes: (workspaceSlug: string, projectId: string) => Promise<TIssueType[]>;
  createIssueType: (workspaceSlug: string, projectId: string, data: Partial<TIssueType>) => Promise<TIssueType>;
  updateIssueType: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Partial<TIssueType>
  ) => Promise<TIssueType>;
  deleteIssueType: (workspaceSlug: string, projectId: string, typeId: string) => Promise<void>;
  createProperty: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Omit<Partial<TIssueProperty>, "options"> & { options?: Partial<TIssuePropertyOption>[] }
  ) => Promise<TIssueProperty>;
  updateProperty: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Omit<Partial<TIssueProperty>, "options"> & { options?: Partial<TIssuePropertyOption>[] }
  ) => Promise<TIssueProperty>;
  deleteProperty: (workspaceSlug: string, projectId: string, typeId: string, propertyId: string) => Promise<void>;
  fetchPropertyValues: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssuePropertyValuesMap>;
  upsertPropertyValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyValues: TIssuePropertyValuesMap,
    validateRequired?: boolean
  ) => Promise<TIssuePropertyValuesMap>;
}

export class IssueTypeStore implements IIssueTypeStore {
  rootStore;
  fetchedMap: Record<string, boolean> = {};
  enabledMap: Record<string, boolean> = {};
  typeMap: Record<string, TIssueType> = {};
  propertyValuesMap: Record<string, TIssuePropertyValuesMap> = {};
  projectTypeIds: Record<string, string[]> = {};
  service;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      fetchedMap: observable,
      enabledMap: observable,
      typeMap: observable,
      propertyValuesMap: observable,
      projectTypeIds: observable,
      fetchWorkItemTypesPropertiesAndOptions: action,
      enableIssueTypes: action,
      createIssueType: action,
      updateIssueType: action,
      deleteIssueType: action,
      createProperty: action,
      updateProperty: action,
      deleteProperty: action,
      fetchPropertyValues: action,
      upsertPropertyValues: action,
    });
    this.rootStore = _rootStore;
    this.service = new IssueTypeService();
  }

  getProjectIssueTypes = computedFn((projectId: string | undefined | null) => {
    if (!projectId) return [];
    const projectTypes = this.projectTypeIds[projectId] || [];
    return projectTypes.map((id) => this.typeMap[id]).filter(Boolean);
  });

  getActiveProjectIssueTypes = computedFn((projectId: string | undefined | null) =>
    this.getProjectIssueTypes(projectId).filter((type) => type.is_active)
  );

  getDefaultIssueTypeId = computedFn((projectId: string | undefined | null) => {
    const defaultType = this.getProjectIssueTypes(projectId).find((type) => type.is_default && type.is_active);
    return defaultType?.id || null;
  });

  getIssueTypeById = computedFn((typeId: string | undefined | null) => {
    if (!typeId) return undefined;
    return this.typeMap[typeId];
  });

  getPropertiesForType = computedFn((typeId: string | undefined | null) => {
    if (!typeId) return [];
    return this.typeMap[typeId]?.properties || [];
  });

  getActivePropertiesForType = computedFn((typeId: string | undefined | null) =>
    this.getPropertiesForType(typeId).filter((property) => property.is_active)
  );

  getPropertyValues = computedFn((issueId: string | undefined | null) => {
    if (!issueId) return {};
    return this.propertyValuesMap[issueId] || {};
  });

  isIssueTypeEnabled = computedFn((projectId: string | undefined | null) => {
    if (!projectId) return false;
    return Boolean(this.enabledMap[projectId]);
  });

  private _setProjectTypes(projectId: string, types: TIssueType[], enabled: boolean) {
    this.projectTypeIds[projectId] = types.map((t) => t.id);
    types.forEach((type) => {
      this.typeMap[type.id] = type;
    });
    this.enabledMap[projectId] = enabled;
    this.fetchedMap[projectId] = true;
  }

  async fetchWorkItemTypesPropertiesAndOptions(workspaceSlug: string, projectId: string) {
    const response = await this.service.getWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId);
    runInAction(() => {
      this._setProjectTypes(projectId, response.issue_types || [], response.is_issue_type_enabled);
    });
    return response.issue_types || [];
  }

  async enableIssueTypes(workspaceSlug: string, projectId: string) {
    const response = await this.service.enableIssueTypes(workspaceSlug, projectId);
    runInAction(() => {
      this._setProjectTypes(projectId, response.issue_types || [], true);
    });
    // Keep project store in sync
    const project = this.rootStore.projectRoot.project.projectMap[projectId];
    if (project) {
      runInAction(() => {
        project.is_issue_type_enabled = true;
      });
    }
    return response.issue_types || [];
  }

  async createIssueType(workspaceSlug: string, projectId: string, data: Partial<TIssueType>) {
    const type = await this.service.createIssueType(workspaceSlug, projectId, data);
    await this.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId);
    return type;
  }

  async updateIssueType(workspaceSlug: string, projectId: string, typeId: string, data: Partial<TIssueType>) {
    const type = await this.service.updateIssueType(workspaceSlug, projectId, typeId, data);
    await this.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId);
    return type;
  }

  async deleteIssueType(workspaceSlug: string, projectId: string, typeId: string) {
    await this.service.deleteIssueType(workspaceSlug, projectId, typeId);
    await this.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId);
  }

  async createProperty(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Omit<Partial<TIssueProperty>, "options"> & { options?: Partial<TIssuePropertyOption>[] }
  ) {
    const property = await this.service.createProperty(workspaceSlug, projectId, typeId, data);
    await this.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId);
    return property;
  }

  async updateProperty(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Omit<Partial<TIssueProperty>, "options"> & { options?: Partial<TIssuePropertyOption>[] }
  ) {
    const property = await this.service.updateProperty(workspaceSlug, projectId, typeId, propertyId, data);
    await this.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId);
    return property;
  }

  async deleteProperty(workspaceSlug: string, projectId: string, typeId: string, propertyId: string) {
    await this.service.deleteProperty(workspaceSlug, projectId, typeId, propertyId);
    await this.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId);
  }

  async fetchPropertyValues(workspaceSlug: string, projectId: string, issueId: string) {
    const values = await this.service.getPropertyValues(workspaceSlug, projectId, issueId);
    runInAction(() => {
      this.propertyValuesMap[issueId] = values || {};
    });
    return values || {};
  }

  async upsertPropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyValues: TIssuePropertyValuesMap,
    validateRequired = true
  ) {
    const values = await this.service.upsertPropertyValues(
      workspaceSlug,
      projectId,
      issueId,
      propertyValues,
      validateRequired
    );
    runInAction(() => {
      this.propertyValuesMap[issueId] = { ...this.propertyValuesMap[issueId], ...values };
    });
    return values;
  }
}
