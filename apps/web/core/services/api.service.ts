/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { AxiosInstance, AxiosRequestConfig } from "axios";
import { create } from "axios";

export abstract class APIService {
  protected baseURL: string;
  private axiosInstance: AxiosInstance;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.axiosInstance = create({
      baseURL,
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401) {
          // Preserve search params (e.g. workspace invite slug/code) so signup can unlock.
          const nextPath = `${window.location.pathname}${window.location.search}`;
          const params = new URLSearchParams();
          if (nextPath && nextPath !== "/") {
            params.set("next_path", nextPath);
          }
          const currentParams = new URLSearchParams(window.location.search);
          const inviteCode = currentParams.get("code") || currentParams.get("invite_code");
          const workspaceSlug = currentParams.get("slug") || currentParams.get("workspace_slug");
          if (inviteCode) params.set("invite_code", inviteCode);
          if (workspaceSlug) params.set("workspace_slug", workspaceSlug);
          const query = params.toString();
          window.location.replace(query ? `/?${query}` : "/");
        }
        return Promise.reject(error);
      }
    );
  }

  get(url: string, params = {}, config: AxiosRequestConfig = {}) {
    return this.axiosInstance.get(url, {
      ...params,
      ...config,
    });
  }

  post(url: string, data = {}, config: AxiosRequestConfig = {}) {
    return this.axiosInstance.post(url, data, config);
  }

  put(url: string, data = {}, config: AxiosRequestConfig = {}) {
    return this.axiosInstance.put(url, data, config);
  }

  patch(url: string, data = {}, config: AxiosRequestConfig = {}) {
    return this.axiosInstance.patch(url, data, config);
  }

  delete(url: string, data?: unknown, config: AxiosRequestConfig = {}) {
    return this.axiosInstance.delete(url, { data, ...config });
  }

  request(config = {}) {
    return this.axiosInstance(config);
  }
}
