/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueProperty,
  TIssuePropertyOption,
  TIssuePropertyValuesMap,
  TIssueType,
  TWorkItemTypesPropertiesAndOptionsResponse,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class IssueTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async enableIssueTypes(
    workspaceSlug: string,
    projectId: string
  ): Promise<TWorkItemTypesPropertiesAndOptionsResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/enable/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getWorkItemTypesPropertiesAndOptions(
    workspaceSlug: string,
    projectId: string
  ): Promise<TWorkItemTypesPropertiesAndOptionsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/work-item-types-properties-and-options/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIssueTypes(workspaceSlug: string, projectId: string): Promise<TIssueType[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createIssueType(workspaceSlug: string, projectId: string, data: Partial<TIssueType>): Promise<TIssueType> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssueType(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Partial<TIssueType>
  ): Promise<TIssueType> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteIssueType(workspaceSlug: string, projectId: string, typeId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createProperty(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Omit<Partial<TIssueProperty>, "options"> & { options?: Partial<TIssuePropertyOption>[] }
  ): Promise<TIssueProperty> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/properties/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateProperty(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Omit<Partial<TIssueProperty>, "options"> & { options?: Partial<TIssuePropertyOption>[] }
  ): Promise<TIssueProperty> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/properties/${propertyId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteProperty(workspaceSlug: string, projectId: string, typeId: string, propertyId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/properties/${propertyId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPropertyValues(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssuePropertyValuesMap> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/property-values/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async upsertPropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyValues: TIssuePropertyValuesMap,
    validateRequired = true
  ): Promise<TIssuePropertyValuesMap> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/property-values/`, {
      property_values: propertyValues,
      validate_required: validateRequired,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
