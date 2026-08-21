/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isIssueLayoutPathSlug } from "@plane/constants";
import type { TIssueLayoutPathSlug } from "@plane/constants";

// Tab preferences type
export type TTabPreferences = {
  defaultTab: string;
  hiddenTabs: string[];
};

// Constants
export const TAB_PREFS_KEY = "plane_tab_prefs";
export const DEFAULT_TAB_KEY: TIssueLayoutPathSlug = "list";
export const LEGACY_WORK_ITEMS_TAB_KEY = "work_items";

/**
 * Get tab preferences for a specific project from localStorage
 * @param projectId - The project ID
 * @returns Tab preferences object with defaultTab and hiddenTabs
 */
export const getTabPreferences = (projectId: string): TTabPreferences => {
  try {
    const stored = localStorage.getItem(TAB_PREFS_KEY);
    if (stored) {
      const allPrefs = JSON.parse(stored);
      return (
        allPrefs[projectId] || {
          defaultTab: DEFAULT_TAB_KEY,
          hiddenTabs: [],
        }
      );
    }
  } catch (error) {
    console.error("Error reading tab preferences:", error);
  }
  return {
    defaultTab: DEFAULT_TAB_KEY,
    hiddenTabs: [],
  };
};

/**
 * Save tab preferences for a specific project to localStorage
 * @param projectId - The project ID
 * @param preferences - Tab preferences to save
 */
export const saveTabPreferences = (projectId: string, preferences: TTabPreferences): void => {
  try {
    const stored = localStorage.getItem(TAB_PREFS_KEY);
    const allPrefs = stored ? JSON.parse(stored) : {};
    allPrefs[projectId] = preferences;
    localStorage.setItem(TAB_PREFS_KEY, JSON.stringify(allPrefs));
  } catch (error) {
    console.error("Error saving tab preferences:", error);
  }
};

/**
 * Resolve a stored default tab against the tabs that currently exist.
 * Legacy `work_items` is preserved so getTabUrl can alias it to `/issues`.
 */
export const resolveDefaultTabKey = (storedDefaultTab: string | undefined, availableTabKeys?: string[]): string => {
  const tabKey = storedDefaultTab || DEFAULT_TAB_KEY;

  if (availableTabKeys && availableTabKeys.length > 0) {
    if (availableTabKeys.includes(tabKey)) return tabKey;
    if (tabKey === LEGACY_WORK_ITEMS_TAB_KEY) return LEGACY_WORK_ITEMS_TAB_KEY;
    return DEFAULT_TAB_KEY;
  }

  return tabKey;
};

/**
 * Map tab keys to their corresponding URLs
 * @param workspaceSlug - The workspace slug
 * @param projectId - The project ID
 * @param tabKey - The tab key to map
 * @returns Full URL path for the tab
 */
export const getTabUrl = (workspaceSlug: string, projectId: string, tabKey: string): string => {
  const baseUrl = `/${workspaceSlug}/projects/${projectId}`;
  if (isIssueLayoutPathSlug(tabKey)) {
    return `${baseUrl}/issues/${tabKey}`;
  }
  const tabUrlMap: Record<string, string> = {
    [LEGACY_WORK_ITEMS_TAB_KEY]: `${baseUrl}/issues`,
    cycles: `${baseUrl}/cycles`,
    modules: `${baseUrl}/modules`,
    views: `${baseUrl}/views`,
    pages: `${baseUrl}/pages`,
    intake: `${baseUrl}/intake`,
    overview: `${baseUrl}/overview`,
    epics: `${baseUrl}/epics`,
  };
  return tabUrlMap[tabKey] || `${baseUrl}/issues`;
};

export const isNavHrefActive = (pathname: string, href: string): boolean =>
  pathname === href || pathname === `${href}/` || pathname.startsWith(`${href}/`);

/**
 * Get the default tab URL for a project
 * @param workspaceSlug - The workspace slug
 * @param projectId - The project ID
 * @param availableTabKeys - Optional array of available tab keys for validation
 * @returns Full URL path for the default tab (validated if availableTabKeys provided)
 */
export const getDefaultTabUrl = (workspaceSlug: string, projectId: string, availableTabKeys?: string[]): string => {
  const preferences = getTabPreferences(projectId);
  const tabKey = availableTabKeys?.length
    ? getValidatedDefaultTab(projectId, availableTabKeys)
    : resolveDefaultTabKey(preferences.defaultTab);

  return getTabUrl(workspaceSlug, projectId, tabKey);
};

/**
 * Get the default tab key, with validation that it exists in available tabs
 * @param projectId - The project ID
 * @param availableTabKeys - Array of available tab keys
 * @returns The default tab key if valid, otherwise DEFAULT_TAB_KEY
 */
export const getValidatedDefaultTab = (projectId: string, availableTabKeys: string[]): string => {
  const preferences = getTabPreferences(projectId);
  return resolveDefaultTabKey(preferences.defaultTab, availableTabKeys);
};
